import { LISTEN_RETRY_LIMIT, QUICK_LISTEN_LIMIT, QUICK_LISTEN_PAUSE_MS } from "../conversation/controller";
import { NOTICE_TEXT, SPEECH_ERROR_TEXT } from "../conversation/messages";
import { ChatError, type Notice } from "../conversation/types";
import { SpeechError, type SpeechRecognizer } from "../speech/types";
import type { MeetingDraftPort } from "./meetingDraft";
import { formatTranscript, MAX_TRANSCRIPT_LENGTH, type MeetingEntry, meetingMinutes, transcriptLength } from "./transcript";

export { MAX_TRANSCRIPT_LENGTH };

/** การฟังรอบที่จบเองเร็วกว่านี้โดยไม่ได้ยินอะไร ถือว่าผิดปกติ */
const QUICK_SESSION_MS = 1500;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15_000;
/** ที่ว่างที่กันไว้ให้เวลานำหน้าบรรทัดและตัวขึ้นบรรทัด ตอนตัดช่วงสุดท้ายให้พอดีเพดาน */
const ENTRY_OVERHEAD = 12;

export const MEETING_TEXT = {
  retrying: "ระบบฟังเสียงสะดุด Javis กำลังลองใหม่ให้เองครับ สิ่งที่จดไว้ยังอยู่ครบ",
  unstable: "ระบบฟังเสียงเริ่มแล้วหยุดเองซ้ำหลายครั้ง จึงพักการจดไว้ก่อน สิ่งที่จดไว้ยังอยู่ครบ กดจดต่อเพื่อลองใหม่",
  interrupted: "การฟังเสียงถูกขัดจังหวะซ้ำหลายครั้ง อาจมีแท็บหรือโปรแกรมอื่นใช้ไมโครโฟนอยู่ จึงพักการจดไว้ก่อน สิ่งที่จดไว้ยังอยู่ครบ",
  nothingHeard: "ยังไม่ได้ยินเสียงพูดเลย จึงยังไม่มีอะไรให้สรุป กดจดต่อเพื่อฟังอีกครั้ง หรือยกเลิก",
  transcriptKept: "บันทึกที่จดไว้ยังอยู่ครบ กดจบและสรุปอีกครั้งได้",
  restored: "พบบันทึกการประชุมที่ยังไม่ได้สรุปค้างอยู่ในเครื่องนี้ กดจบและสรุป จดต่อ หรือยกเลิกเพื่อทิ้ง",
  full: "บันทึกยาวถึงขีดจำกัดแล้ว (ราวสองชั่วโมง) จึงพักการจดไว้ กดจบและสรุปได้เลย",
  movedElsewhere: "มีการเปิดไมโครโฟนที่อีกแท็บหนึ่งของ Javis การฟังจึงย้ายไปที่นั่น และพักการจดไว้ก่อน สิ่งที่จดไว้ยังอยู่ครบ กดจดต่อเพื่อกลับมาจดที่แท็บนี้"
} as const;

/**
 * idle: ไม่มีการประชุม · recording: กำลังฟังและจด · paused: พักการจด สิ่งที่จดไว้ยังอยู่
 * summarizing: ส่งบันทึกให้ AI แล้ว รอคำสรุป
 */
export type MeetingStatus = "idle" | "recording" | "paused" | "summarizing";

export interface MeetingState {
  status: MeetingStatus;
  /** เวลาที่เริ่มประชุม (มิลลิวินาทีของนาฬิกาเครื่อง) หรือ null เมื่อไม่มีการประชุม */
  startedAt: number | null;
  entries: MeetingEntry[];
  /** คำที่กำลังได้ยินของช่วงที่ยังไม่จบ */
  partial: string;
  /** คำสรุปที่กำลังทยอยมาจาก AI */
  summary: string;
  notice: Notice | null;
}

export interface SummaryRequest {
  /** บันทึกทั้งหมด บรรทัดละช่วงคำพูด */
  transcript: string;
  /** ความยาวของการประชุมเป็นนาที */
  minutes: number;
  signal: AbortSignal;
  /** คำสรุปส่วนถัดไปที่ AI ส่งมา */
  onDelta: (text: string) => void;
}

export interface MeetingResult {
  summary: string;
  transcript: string;
  minutes: number;
  /** เวลาที่เริ่มประชุม (มิลลิวินาทีของนาฬิกาเครื่อง) */
  startedAt: number;
}

export interface MeetingDeps {
  recognizer: SpeechRecognizer;
  /** ขอให้ AI สรุปบันทึกหนึ่งครั้ง คืนคำสรุปเต็ม ล้มเหลวด้วย ChatError ที่มีข้อความให้ผู้ใช้อ่าน */
  summarize: (request: SummaryRequest) => Promise<string>;
  /** เรียกเมื่อสรุปเสร็จ พร้อมคำสรุปและบันทึกทั้งหมด */
  onSummary: (result: MeetingResult) => void;
  /** ที่เก็บบันทึกที่ยังไม่ได้สรุปไว้ในเครื่อง เพื่อกู้คืนถ้าหน้าเว็บถูกปิดกลางประชุม */
  draft?: MeetingDraftPort;
  /** นาฬิกาของเครื่อง (มิลลิวินาที) */
  now?: () => number;
  /** หน่วงเวลา (มิลลิวินาที) ก่อนลองฟังใหม่ แยกไว้เพื่อให้ทดสอบได้โดยไม่ต้องรอจริง */
  wait?: (ms: number) => Promise<void>;
}

const INITIAL_STATE: MeetingState = { status: "idle", startedAt: null, entries: [], partial: "", summary: "", notice: null };

/**
 * โหมดสรุปการประชุม: ฟังเงียบ ๆ จดคำพูดทั้งหมดไว้ในเครื่อง แล้วส่งให้ AI สรุปครั้งเดียวตอนผู้ใช้กดจบ
 * ระหว่างจดไม่มีการถาม AI ไม่มีการพูดตอบ และไม่ทำตามคำสั่งใดที่ได้ยิน จึงใช้โควตา AI หนึ่งคำขอต่อการประชุม
 * ไม่ผูกกับ React หรือระบบเสียงใด จึงทดสอบได้ด้วยตัวจำลอง
 *
 * การลองฟังใหม่เมื่อระบบฟังสะดุดใช้เกณฑ์เดียวกับโหมดฟังตลอดเวลาของบทสนทนา (src/conversation/controller.ts)
 * ต่างกันที่เมื่อเกินเกณฑ์ ที่นี่พักการจดโดยเก็บทุกอย่างไว้ ไม่ทิ้งสิ่งที่จดมา
 */
export class MeetingRecorder {
  private state: MeetingState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  /** เพิ่มขึ้นทุกครั้งที่ผู้ใช้เปลี่ยนจังหวะ งานค้างของรอบเก่าจะรู้ตัวและหยุดเอง */
  private epoch = 0;
  private request: AbortController | null = null;
  /** จำนวนครั้งติดกันที่ระบบฟังสะดุดชั่วคราว */
  private failures = 0;
  /** จำนวนครั้งติดกันที่การฟังจบเองเร็วผิดปกติโดยไม่ได้ยินอะไร */
  private quickSessions = 0;

  constructor(private readonly deps: MeetingDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): MeetingState => this.state;

  /**
   * เริ่มการประชุมใหม่ ทิ้งบันทึกที่ค้างจากครั้งก่อน
   * เข้าสู่การจดในจังหวะเดียวกับที่สั่ง ก่อนรู้ว่าระบบฟังใช้ได้ไหม เพื่อให้แอปสลับจากบทสนทนามาโหมดนี้ได้ในคราวเดียว
   * ไม่มีช่วงที่ไม่ได้อยู่โหมดใดเลย (ซึ่งหน้าจอจะแสดงแถบสั่งงานแวบหนึ่ง) ถ้าระบบฟังใช้ไม่ได้ จะกลับออกมาพร้อมบอกสาเหตุ
   */
  start = async (): Promise<void> => {
    if (this.state.status !== "idle") return;

    const epoch = this.halt();
    this.failures = 0;
    this.quickSessions = 0;
    this.update({ ...INITIAL_STATE, status: "recording", startedAt: this.clock() });

    try {
      await this.deps.recognizer.prepare();
    } catch (error) {
      if (epoch === this.epoch) this.update({ ...INITIAL_STATE, notice: this.speechNotice(error) });
      return;
    }
    if (epoch !== this.epoch) return;

    this.deps.draft?.clear();
    void this.record(epoch);
  };

  /**
   * พักการจด หรือยกเลิกการขอคำสรุปที่กำลังรออยู่ สิ่งที่จดไว้ยังอยู่
   * @param reason เหตุผลที่บอกผู้ใช้ เมื่อการพักไม่ได้มาจากผู้ใช้กดเอง (เช่นการฟังย้ายไปแท็บอื่น)
   */
  pause = (reason?: string): void => {
    if (this.state.status !== "recording" && this.state.status !== "summarizing") return;
    this.halt();
    this.update({ status: "paused", summary: "", notice: reason ? { tone: "info", text: reason } : null });
  };

  /** กลับมาจดต่อจากที่พักไว้ */
  resume = (): void => {
    if (this.state.status !== "paused") return;
    const epoch = this.halt();
    this.failures = 0;
    this.quickSessions = 0;
    this.update({ status: "recording", notice: null });
    void this.record(epoch);
  };

  /** จบการประชุม: หยุดฟัง แล้วส่งบันทึกทั้งหมดให้ AI สรุปครั้งเดียว */
  finish = async (): Promise<void> => {
    const { status, startedAt } = this.state;
    if ((status !== "recording" && status !== "paused") || startedAt === null) return;

    const epoch = this.halt();
    const { entries } = this.state;
    if (entries.length === 0) {
      this.update({ status: "paused", notice: { tone: "info", text: MEETING_TEXT.nothingHeard } });
      return;
    }

    const transcript = formatTranscript(entries);
    // นับถึงคำพูดสุดท้าย ไม่ใช่ถึงตอนกดสรุป: บันทึกที่นำกลับมาสรุปในวันถัดไปจึงไม่กลายเป็นการประชุมยาวข้ามคืน
    const minutes = meetingMinutes(0, entries.at(-1)?.at ?? 0);
    const request = new AbortController();
    this.request = request;
    this.update({ status: "summarizing", summary: "", notice: null });

    try {
      const summary = await this.deps.summarize({
        transcript,
        minutes,
        signal: request.signal,
        onDelta: (text) => {
          if (epoch === this.epoch) this.update({ summary: this.state.summary + text });
        }
      });
      if (epoch !== this.epoch) return;
      if (!summary.trim()) throw new ChatError(NOTICE_TEXT.emptyReply);

      this.request = null;
      this.deps.draft?.clear();
      this.update(INITIAL_STATE);
      this.deps.onSummary({ summary: summary.trim(), transcript, minutes, startedAt });
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.request = null;
      const reason = error instanceof ChatError ? error.message : NOTICE_TEXT.chatFailed;
      this.update({ status: "paused", summary: "", notice: { tone: "error", text: `${reason} ${MEETING_TEXT.transcriptKept}` } });
    }
  };

  /** ยกเลิกการประชุมและทิ้งทุกอย่างที่จดไว้ */
  cancel = (): void => {
    this.epoch += 1;
    this.request?.abort();
    this.request = null;
    this.deps.recognizer.cancel();
    this.deps.draft?.clear();
    this.update(INITIAL_STATE);
  };

  /**
   * เก็บข้อความแจ้งที่ค้างอยู่ตอนไม่มีการประชุม (เช่นเริ่มจดไม่สำเร็จ) ออก เมื่อผู้ใช้ไปทำอย่างอื่นต่อแล้ว
   * ข้อความแจ้งระหว่างการประชุมบอกสิ่งที่ผู้ใช้ต้องตัดสินใจ จึงไม่ถูกเก็บออกทางนี้
   */
  dismissNotice = (): void => {
    if (this.state.status === "idle" && this.state.notice) this.update({ notice: null });
  };

  /**
   * หยุดการประชุมและล้างหน้าจอ โดยเก็บบันทึกไว้ในเครื่องให้นำกลับมาสรุปได้ภายหลัง
   * ใช้เมื่อผู้ใช้ไม่ได้อยู่ในระบบแล้ว (ออกจากระบบ หรือเซสชันหมดอายุกลางประชุม): ไมโครโฟนต้องปิดและบันทึกต้องไม่ค้างบนจอ
   * แต่การประชุมที่จดมาเป็นชั่วโมงต้องไม่หายเพียงเพราะเซสชันหมดอายุ
   */
  shelve = (): void => {
    if (this.state.status === "idle") return;
    this.halt();
    this.update(INITIAL_STATE);
  };

  /**
   * นำบันทึกที่ค้างอยู่ในเครื่องกลับมา (หน้าเว็บถูกปิดหรือโหลดใหม่กลางประชุม) ในสภาพพักการจด
   * คืน true ถ้ามีบันทึกให้นำกลับมา ไม่ทับการประชุมที่กำลังดำเนินอยู่
   */
  restore = (): boolean => {
    if (this.state.status !== "idle") return false;
    const saved = this.deps.draft?.load();
    if (!saved) return false;

    this.update({ ...INITIAL_STATE, status: "paused", startedAt: saved.startedAt, entries: saved.entries, notice: { tone: "info", text: MEETING_TEXT.restored } });
    return true;
  };

  private update(patch: Partial<MeetingState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private clock(): number {
    return (this.deps.now ?? Date.now)();
  }

  private wait(ms: number): Promise<void> {
    return (this.deps.wait ?? ((delay) => new Promise<void>((resolve) => setTimeout(resolve, delay))))(ms);
  }

  private speechNotice(error: unknown): Notice | null {
    const code = error instanceof SpeechError ? error.code : "unknown";
    return code === "aborted" ? null : { tone: "error", text: SPEECH_ERROR_TEXT[code] };
  }

  /**
   * หยุดทุกงานที่ค้างอยู่ และเปิดรอบใหม่
   * คำที่กำลังได้ยินค้างอยู่ถูกเก็บเป็นช่วงสุดท้ายก่อน เพื่อไม่ให้คำพูดก่อนกดปุ่มหายไป
   */
  private halt(): number {
    if (this.state.partial.trim()) this.add(this.state.partial);
    this.epoch += 1;
    this.request?.abort();
    this.request = null;
    this.deps.recognizer.cancel();
    if (this.state.partial) this.update({ partial: "" });
    return this.epoch;
  }

  /** จดหนึ่งช่วงคำพูด และเก็บลงเครื่องทันที */
  private add(heard: string): void {
    const { startedAt, entries } = this.state;
    const text = heard.trim();
    if (!text || startedAt === null) return;

    // เหลือที่ไม่พอทั้งช่วง: ตัดให้พอดีเพดาน ส่วนที่เกินไม่ถูกจด และผู้เรียกจะพักการจด
    const room = MAX_TRANSCRIPT_LENGTH - transcriptLength(entries) - ENTRY_OVERHEAD;
    if (room <= 0) return;

    const next = [...entries, { at: Math.max(0, this.clock() - startedAt), text: text.slice(0, room) }];
    this.update({ entries: next, partial: "" });
    this.deps.draft?.save({ startedAt, entries: next });
  }

  private isFull(): boolean {
    return MAX_TRANSCRIPT_LENGTH - transcriptLength(this.state.entries) - ENTRY_OVERHEAD <= 0;
  }

  /** พักการจดเองพร้อมบอกเหตุผล โดยเก็บทุกอย่างที่จดไว้ */
  private suspend(notice: Notice): void {
    this.halt();
    this.update({ status: "paused", notice });
  }

  /** ฟังหนึ่งรอบ: ระบบฟังที่ฟังต่อเนื่องได้ส่งทีละช่วงคำพูดจนจบรอบ ส่วนระบบอื่นฟังได้รอบละช่วงเดียว */
  private listenOnce(epoch: number): Promise<void> {
    const { recognizer } = this.deps;
    const onPartial = (text: string) => {
      if (epoch === this.epoch) this.update({ partial: text });
    };
    const onFinal = (text: string) => {
      if (epoch !== this.epoch) return;
      this.add(text);
      if (this.isFull()) this.suspend({ tone: "info", text: MEETING_TEXT.full });
    };

    if (recognizer.dictate) return recognizer.dictate({ onPartial, onFinal });
    return recognizer.listen(onPartial).then(onFinal);
  }

  /** ฟังและจดไปเรื่อย ๆ จนผู้ใช้เปลี่ยนจังหวะ โดยเปิดฟังใหม่เองทุกครั้งที่ระบบฟังจบรอบหรือสะดุดชั่วคราว */
  private async record(epoch: number): Promise<void> {
    for (;;) {
      const heardBefore = this.state.entries.length;
      const startedAt = this.clock();
      let failure: unknown = null;
      try {
        await this.listenOnce(epoch);
      } catch (error) {
        failure = error;
      }
      if (epoch !== this.epoch) return;
      if (this.state.partial) this.update({ partial: "" });

      if (failure !== null) {
        const code = failure instanceof SpeechError ? failure.code : "unknown";
        const transient = code === "network" || code === "aborted" || code === "unknown";
        this.failures += 1;
        if (!transient || this.failures > LISTEN_RETRY_LIMIT) {
          this.suspend({ tone: "error", text: code === "aborted" ? MEETING_TEXT.interrupted : SPEECH_ERROR_TEXT[code] });
          return;
        }
        this.update({ notice: { tone: "info", text: MEETING_TEXT.retrying } });
        await this.wait(Math.min(RETRY_BASE_MS * 2 ** (this.failures - 1), RETRY_MAX_MS));
        if (epoch !== this.epoch) return;
        this.update({ notice: null });
        continue;
      }

      this.failures = 0;
      const heard = this.state.entries.length > heardBefore;
      if (heard || this.clock() - startedAt >= QUICK_SESSION_MS) {
        this.quickSessions = 0;
        continue;
      }
      // จบเร็วผิดปกติโดยไม่ได้ยินอะไร: เว้นจังหวะก่อน และถ้าเป็นซ้ำ ๆ ให้พัก ดีกว่าวนเปิดปิดไมโครโฟนไม่รู้จบ
      this.quickSessions += 1;
      if (this.quickSessions >= QUICK_LISTEN_LIMIT) {
        this.suspend({ tone: "error", text: MEETING_TEXT.unstable });
        return;
      }
      await this.wait(QUICK_LISTEN_PAUSE_MS);
      if (epoch !== this.epoch) return;
    }
  }
}
