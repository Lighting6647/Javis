import type { FillResult, FillValue, PageContext } from "../browser/types";
import { SpeechError, type SpeechRecognizer, type SpeechSynthesizer } from "../speech/types";
import { type FillDecision, interpretFillDecision } from "./fillDecision";
import { NOTICE_TEXT, SPEECH_ERROR_TEXT } from "./messages";
import { createSentenceChunker } from "./sentenceChunker";
import {
  ChatError,
  type ChatTurn,
  type ConversationMessage,
  type ConversationState,
  type FillStatus,
  type MemoryEntry,
  type MemoryNote,
  type Notice,
  type PageLink,
  type StreamChat
} from "./types";

/** ต้องไม่เกินเพดานที่เซิร์ฟเวอร์ตรวจ (server/chat.ts) */
export const HISTORY_LIMIT = 20;
export const MESSAGE_LENGTH_LIMIT = 2000;

/** การฟังที่จบโดยไม่ได้ยินอะไรเร็วกว่านี้ถือว่าผิดปกติ: ปกติระบบฟังรอเสียงพูดหลายวินาทีก่อนจบเอง */
const QUICK_LISTEN_MS = 1500;
/** โหมดฟังตลอดเวลา: เว้นจังหวะเท่านี้ก่อนฟังใหม่หลังการฟังที่จบเร็วผิดปกติ เพื่อไม่ให้วนถี่ */
export const QUICK_LISTEN_PAUSE_MS = 1000;
/** โหมดฟังตลอดเวลา: การฟังจบเร็วผิดปกติติดกันได้กี่ครั้ง ก่อนปิดไมโครโฟน */
export const QUICK_LISTEN_LIMIT = 8;
/** โหมดฟังตลอดเวลา: ระบบฟังสะดุดชั่วคราวติดกันได้กี่ครั้ง ก่อนปิดไมโครโฟน แต่ละครั้งรอนานขึ้นทีละเท่าตัว */
export const LISTEN_RETRY_LIMIT = 5;
const LISTEN_RETRY_BASE_MS = 1000;
const LISTEN_RETRY_MAX_MS = 15_000;

export interface ConversationDeps {
  recognizer: SpeechRecognizer;
  synthesizer: SpeechSynthesizer;
  chat: StreamChat;
  /** เปิดหน้าเว็บให้ผู้ใช้ในแท็บใหม่ เบราว์เซอร์ในตัว หรือเบราว์เซอร์ของระบบ คืน false ถ้าเปิดไม่ได้ */
  openPage: (url: string) => boolean;
  /**
   * พาแท็บนี้ไปยังหน้าเว็บนั้น คืน false ถ้าไปไม่ได้ ใช้เมื่อผู้ใช้สั่งให้เปิดแต่ openPage เปิดไม่ได้
   * ผู้ให้มาต้องเก็บบทสนทนาไว้เองก่อนออกจากหน้า ถ้าไม่ให้มา ผู้ใช้ต้องแตะลิงก์ในบทสนทนาเอง
   */
  leaveToPage?: (url: string) => boolean;
  /**
   * แสดงหน้าเว็บในกรอบของแอปเอง คืน false ถ้าแสดงไม่ได้ มีเฉพาะเว็บในเบราว์เซอร์
   * ใช้กับหน้าที่เซิร์ฟเวอร์ตรวจแล้วว่าเจ้าของเว็บยอมให้แสดงในกรอบ ผู้ใช้จึงเห็นหน้านั้นโดยไม่ต้องออกจาก Javis
   */
  showPage?: (url: string, title: string) => boolean;
  /** อ่านหน้าเว็บที่เปิดอยู่ในเบราว์เซอร์ในตัว มีเฉพาะในแอปเดสก์ท็อป */
  getPageContext?: () => Promise<PageContext | null>;
  /** กรอกค่าลงฟอร์มของหน้าเว็บที่เปิดอยู่ เรียกหลังผู้ใช้ยืนยันแล้วเท่านั้น */
  fillPage?: (pageUrl: string, values: FillValue[]) => Promise<FillResult>;
  /** ความจำระยะยาวของผู้ใช้ที่เก็บในอุปกรณ์ */
  memory?: MemoryPort;
  /** นาฬิกาของตัวควบคุม (มิลลิวินาที) ค่าเริ่มต้นคือนาฬิกาของเครื่อง */
  now?: () => number;
  /**
   * ฟังตลอดเวลา: ไม่ได้ยินอะไรก็ฟังต่อ ระบบฟังสะดุดชั่วคราวก็ลองใหม่เอง และคำตอบที่ล้มเหลวไม่จบโหมดเสียง
   * เพราะผู้ใช้ไม่มีปุ่มไมโครโฟนให้แตะเริ่มใหม่ทุกครั้ง ถ้าไม่ตั้ง การฟังที่เงียบหรือล้มเหลวจะจบโหมดเสียงตามเดิม
   */
  handsFree?: boolean;
  /** หน่วงเวลา (มิลลิวินาที) ก่อนลองฟังใหม่ ค่าเริ่มต้นใช้ตัวจับเวลาของเครื่อง แยกไว้เพื่อให้ทดสอบได้โดยไม่ต้องรอจริง */
  wait?: (ms: number) => Promise<void>;
}

/** สิ่งที่ตัวควบคุมต้องการจากคลังความจำ */
export interface MemoryPort {
  list(): MemoryEntry[];
  /** จำเรื่องใหม่ คืน null ถ้าว่างหรือมีอยู่แล้ว */
  add(text: string): MemoryEntry | null;
  /** ลืมเรื่องหนึ่งเรื่อง คืนเรื่องที่ลบ หรือ null ถ้าไม่พบ */
  remove(id: string): MemoryEntry | null;
}

const INITIAL_STATE: ConversationState = {
  phase: "idle",
  active: false,
  messages: [],
  partial: "",
  notice: null,
  onDeviceListening: false,
  searching: false,
  pendingFillId: null,
  lastReplyMs: null
};

function toChatTurns(messages: ConversationMessage[]): ChatTurn[] {
  return messages
    .filter((message) => message.text.trim())
    .slice(-HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      content: message.text.trim().slice(0, MESSAGE_LENGTH_LIMIT)
    }));
}

/**
 * ควบคุมจังหวะสนทนาแบบผู้ช่วยเสียง: ฟัง → คิด → พูด → กลับมาฟังต่อ
 * ไม่ผูกกับ React หรือระบบเสียงใด จึงทดสอบได้ด้วยตัวจำลอง
 */
export class ConversationController {
  private state: ConversationState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  /** เพิ่มขึ้นทุกครั้งที่ผู้ใช้เปลี่ยนจังหวะ งานค้างของรอบเก่าจะรู้ตัวและหยุดเอง */
  private epoch = 0;
  private request: AbortController | null = null;
  private voiceReplies = false;
  private sequence = 0;
  /** กันการกดยืนยันซ้ำระหว่างที่กำลังกรอก */
  private filling = false;
  /** ลิงก์ที่รอพาแท็บนี้ไปเมื่อคำตอบจบ ถ้าผู้ใช้เปลี่ยนจังหวะหรือแตะเปิดเองก่อนถึงตอนนั้น จะไม่พาไป */
  private leaving: { messageId: string; url: string } | null = null;
  /** โหมดฟังตลอดเวลา: จำนวนครั้งติดกันที่ระบบฟังสะดุดชั่วคราว */
  private listenFailures = 0;
  /** โหมดฟังตลอดเวลา: จำนวนครั้งติดกันที่การฟังจบเร็วผิดปกติโดยไม่ได้ยินอะไร */
  private quickListens = 0;

  constructor(private readonly deps: ConversationDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): ConversationState => this.state;

  /**
   * เริ่มสนทนาด้วยเสียง บนมือถือต้องเรียกจากจังหวะที่ผู้ใช้แตะหน้าจอ
   * ส่วนโหมดฟังตลอดเวลาบนคอมพิวเตอร์เรียกได้เองตอนเปิดหน้า เมื่อผู้ใช้อนุญาตไมโครโฟนไว้แล้ว
   */
  start = async (): Promise<void> => {
    if (this.state.active) return;

    const epoch = this.halt();
    this.listenFailures = 0;
    this.quickListens = 0;
    this.update({ active: true, phase: "starting", notice: null });

    // สั่งเตรียมตัวพูดก่อน await ใด ๆ เพื่อให้ยังอยู่ในจังหวะแตะของผู้ใช้
    const voiceReady = this.deps.synthesizer.prepare().catch(() => false);
    // อุปกรณ์มีเสียงพูดหรือไม่ ไม่ขึ้นกับว่ารอบนี้ถูกแทรกไหม จึงจดไว้เสมอ
    // เช่นผู้ใช้แตะคำถามตัวอย่างระหว่างกำลังเตรียมไมโครโฟนในโหมดฟังตลอดเวลา คำตอบยังต้องออกเสียงได้
    void voiceReady.then((ready) => {
      this.voiceReplies = ready;
    });

    try {
      await this.deps.recognizer.prepare();
    } catch (error) {
      if (epoch === this.epoch) this.failSpeech(error);
      return;
    }

    const voiceReplies = await voiceReady;
    if (epoch !== this.epoch) return;

    this.voiceReplies = voiceReplies;
    await this.listen(epoch);
  };

  /** จบการสนทนาด้วยเสียง */
  stop = (): void => {
    this.halt();
    this.update({ active: false, phase: "idle" });
  };

  /** ล้างบทสนทนาทั้งหมด ใช้เมื่อผู้ใช้ออกจากระบบ */
  reset = (): void => {
    this.halt();
    this.voiceReplies = false;
    this.update(INITIAL_STATE);
  };

  /**
   * แสดงบทสนทนาที่เก็บไว้ก่อนออกจากหน้าไปยังเว็บอื่น ต่อจากเดิม
   * รับเฉพาะตอนที่ยังว่างและยังไม่ได้เริ่มอะไร เพื่อไม่ทับหรือแทรกบทสนทนาที่ผู้ใช้เริ่มไปแล้ว
   */
  restore = (messages: ConversationMessage[]): void => {
    if (this.state.phase !== "idle" || this.state.messages.length > 0) return;

    // ออกรหัสใหม่ เพื่อไม่ให้ซ้ำกับข้อความที่จะเกิดในรอบนี้
    const restored = messages.filter((message) => message.text.trim()).map((message) => ({ ...message, id: this.nextId() }));
    if (restored.length > 0) this.update({ messages: restored });
  };

  /** หยุดคำตอบที่กำลังคิดหรือพูดอยู่ แล้วกลับมาฟังต่อ */
  interrupt = (): void => {
    const epoch = this.halt();
    if (this.state.active) void this.listen(epoch);
    else this.update({ phase: "idle" });
  };

  /** ผู้ใช้บอกว่าพูดจบแล้ว ไม่ต้องรอให้ระบบตัดจบเอง */
  finishListening = (): void => {
    if (this.state.phase === "listening") this.deps.recognizer.stop();
  };

  /** ส่งข้อความที่พิมพ์ ใช้ได้ทั้งตอนสนทนาด้วยเสียงและตอนไม่ได้เปิดเสียง */
  sendText = (text: string): void => {
    const clean = text.trim().slice(0, MESSAGE_LENGTH_LIMIT);
    if (!clean) return;

    const epoch = this.halt();
    // พิมพ์แทรกระหว่างรอสิทธิ์ไมโครโฟน: ถือว่ายังไม่ได้เปิดโหมดเสียง
    // ยกเว้นโหมดฟังตลอดเวลา ซึ่งต้องกลับมาฟังต่อเองหลังตอบ เพราะไม่มีปุ่มให้ผู้ใช้แตะเปิดใหม่
    if (this.state.phase === "starting" && !this.deps.handsFree) this.update({ active: false });
    void this.handle(clean, epoch);
  };

  /** ผู้ใช้กดยืนยันรายการกรอกฟอร์มที่รออยู่ */
  confirmFill = (): void => {
    void this.decideFill("confirm").then((notice) => this.update({ notice }));
  };

  /** ผู้ใช้กดยกเลิกรายการกรอกฟอร์มที่รออยู่ */
  cancelFill = (): void => {
    void this.decideFill("cancel").then((notice) => this.update({ notice }));
  };

  /** ผู้ใช้กดยกเลิกสิ่งที่ Javis เพิ่งจำไว้ในข้อความนั้น */
  undoMemory = (messageId: string, memoryId: string): void => {
    this.deps.memory?.remove(memoryId);
    this.patchMessage(messageId, (message) => ({
      ...message,
      memoryNotes: message.memoryNotes?.map((note) => (note.id === memoryId ? { ...note, undone: true } : note))
    }));
  };

  /**
   * ผู้ใช้แตะลิงก์หน้าเว็บของข้อความนั้นเอง: ลิงก์ถือว่าเปิดแล้วในแท็บใหม่ ไม่ต้องบอกว่าถูกบล็อกอีก
   * และถ้ากำลังรอพาแท็บนี้ไปยังหน้าเดียวกัน ก็ไม่ต้องพาไปแล้ว ไม่เช่นนั้นหน้าเดิมจะเปิดซ้ำสองที่
   */
  markLinkOpened = (messageId: string): void => {
    if (this.leaving?.messageId === messageId) this.leaving = null;
    this.patchMessage(messageId, (message) =>
      message.link ? { ...message, link: { ...message.link, opened: true, blocked: false, inPlace: false } } : message
    );
  };

  private update(patch: Partial<ConversationState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private nextId(): string {
    this.sequence += 1;
    return `message-${this.sequence}`;
  }

  /** หยุดทุกงานที่ค้างอยู่ และเปิดรอบใหม่ */
  private halt(): number {
    this.epoch += 1;
    this.request?.abort();
    this.request = null;
    this.deps.recognizer.cancel();
    this.deps.synthesizer.cancel();
    // ผู้ใช้เปลี่ยนจังหวะก่อนถึงเวลาออกจากหน้า: ไม่พาไปแล้ว ลิงก์จึงกลับเป็นให้แตะเอง
    const cancelledLeave = this.leaving?.messageId;
    this.leaving = null;
    this.update({
      partial: "",
      searching: false,
      messages: this.state.messages
        // คำตอบที่ถูกตัดก่อนมีข้อความ ไม่ต้องค้างเป็นกล่องเปล่า
        .filter((message) => message.text.trim())
        .map((message) =>
          message.id === cancelledLeave && message.link ? { ...message, link: { ...message.link, inPlace: false } } : message
        )
    });
    return this.epoch;
  }

  /**
   * พาแท็บนี้ไปยังหน้าที่รออยู่ คืน false ถ้าไปไม่ได้ ซึ่งลิงก์จะกลับเป็นให้ผู้ใช้แตะเอง
   * เมื่อไปได้ จะหยุดฟังและหยุดพูดก่อนหน้านี้ถูกแทนที่ ถ้าเบราว์เซอร์คืนหน้าเดิมให้ตอนผู้ใช้กดย้อนกลับ จะอยู่ในสภาพพร้อมใช้
   */
  private leave(): boolean {
    const target = this.leaving;
    this.leaving = null;
    if (!target) return false;

    const mark = (state: Pick<PageLink, "opened" | "blocked" | "inPlace">) =>
      this.patchMessage(target.messageId, (message) => (message.link ? { ...message, link: { ...message.link, ...state } } : message));

    // ทำเครื่องหมายก่อนออก เพราะบทสนทนาในจังหวะนี้คือสิ่งที่ถูกเก็บไว้คืนให้ตอนผู้ใช้กลับมา
    mark({ opened: true, blocked: false, inPlace: true });
    if (!this.deps.leaveToPage?.(target.url)) {
      mark({ opened: false, blocked: true, inPlace: false });
      return false;
    }
    this.stop();
    return true;
  }

  private patchMessage(id: string, patch: (message: ConversationMessage) => ConversationMessage): void {
    this.update({
      messages: this.state.messages.map((message) => (message.id === id ? patch(message) : message))
    });
  }

  private fail(notice: Notice | null): void {
    this.halt();
    this.update({ active: false, phase: "idle", notice });
  }

  private failSpeech(error: unknown): void {
    const code = error instanceof SpeechError ? error.code : "unknown";
    this.fail(code === "aborted" ? null : { tone: "error", text: SPEECH_ERROR_TEXT[code] });
  }

  /**
   * จบรอบที่ขอคำตอบไม่สำเร็จ พร้อมข้อความแจ้งผู้ใช้
   * โหมดฟังตลอดเวลา: หยุดเสียงที่ค้างคิวอยู่แล้วฟังต่อ เพราะไม่มีปุ่มให้ผู้ใช้แตะเริ่มใหม่ ที่อื่น: จบโหมดเสียง
   */
  private async failTurn(notice: Notice): Promise<void> {
    if (!this.deps.handsFree || !this.state.active) {
      this.fail(notice);
      return;
    }
    await this.listen(this.halt(), notice);
  }

  private clock(): number {
    return (this.deps.now ?? (() => performance.now()))();
  }

  private wait(ms: number): Promise<void> {
    return (this.deps.wait ?? ((delay) => new Promise<void>((resolve) => setTimeout(resolve, delay))))(ms);
  }

  /**
   * ฟังจนได้คำพูดหนึ่งช่วง แล้วส่งต่อไปตอบ
   * โหมดฟังตลอดเวลาฟังซ้ำเองเมื่อเงียบหรือระบบฟังสะดุดชั่วคราว จึงวนในนี้ ไม่เรียกตัวเองซ้อนไปเรื่อย ๆ
   * @param notice ข้อความแจ้งที่ต้องแสดงค้างไว้ระหว่างการฟังรอบแรก
   */
  private async listen(epoch: number, notice: Notice | null = null): Promise<void> {
    let pendingNotice = notice;
    for (;;) {
      const heard = await this.listenOnce(epoch, pendingNotice);
      if (heard === null) return;
      if (heard) {
        await this.handle(heard, epoch);
        return;
      }
      pendingNotice = null;
    }
  }

  /**
   * ฟังหนึ่งรอบ คืนข้อความที่ได้ยิน สตริงว่างเมื่อควรฟังใหม่ (เกิดเฉพาะโหมดฟังตลอดเวลา)
   * หรือ null เมื่อการฟังจบลงแล้ว (ล้มเหลว ถูกปิด หรือผู้ใช้เปลี่ยนจังหวะไปแล้ว)
   */
  private async listenOnce(epoch: number, notice: Notice | null): Promise<string | null> {
    this.update({
      phase: "listening",
      partial: "",
      notice: notice ?? (this.voiceReplies ? null : { tone: "info", text: NOTICE_TEXT.noThaiVoice }),
      onDeviceListening: this.deps.recognizer.isOnDevice()
    });

    const startedAt = this.clock();
    let heard: string;
    try {
      heard = await this.deps.recognizer.listen((partial) => {
        if (epoch === this.epoch) this.update({ partial });
      });
    } catch (error) {
      if (epoch !== this.epoch) return null;
      return (await this.recoverListening(error, epoch)) ? "" : null;
    }
    if (epoch !== this.epoch) return null;
    this.listenFailures = 0;

    const text = heard.trim().slice(0, MESSAGE_LENGTH_LIMIT);
    if (text) {
      this.quickListens = 0;
      return text;
    }
    if (!this.deps.handsFree) {
      this.fail({ tone: "info", text: NOTICE_TEXT.noSpeech });
      return null;
    }

    // เงียบจนระบบฟังจบเองตามปกติ: ฟังต่อได้เลย
    if (this.clock() - startedAt >= QUICK_LISTEN_MS) {
      this.quickListens = 0;
      return "";
    }
    // จบเร็วผิดปกติ: เว้นจังหวะก่อน และถ้าเป็นซ้ำ ๆ ให้หยุด ดีกว่าวนเปิดปิดไมโครโฟนไม่รู้จบ
    this.quickListens += 1;
    if (this.quickListens >= QUICK_LISTEN_LIMIT) {
      this.fail({ tone: "error", text: NOTICE_TEXT.listenUnstable });
      return null;
    }
    await this.wait(QUICK_LISTEN_PAUSE_MS);
    return epoch === this.epoch ? "" : null;
  }

  /**
   * ระบบฟังล้มเหลวระหว่างฟัง คืน true เมื่อควรฟังใหม่ ซึ่งเกิดเฉพาะโหมดฟังตลอดเวลากับอาการชั่วคราว
   * (เครือข่ายสะดุด เบราว์เซอร์ยกเลิกการฟังเอง หรือเริ่มฟังไม่ติด) โดยรอนานขึ้นทีละเท่าตัวในแต่ละครั้ง
   * นอกนั้นจบโหมดเสียงพร้อมบอกสาเหตุ แล้วคืน false
   */
  private async recoverListening(error: unknown, epoch: number): Promise<boolean> {
    const code = error instanceof SpeechError ? error.code : "unknown";
    const transient = code === "network" || code === "aborted" || code === "unknown";
    if (!this.deps.handsFree || !transient) {
      this.failSpeech(error);
      return false;
    }

    this.listenFailures += 1;
    if (this.listenFailures > LISTEN_RETRY_LIMIT) {
      this.fail({ tone: "error", text: code === "aborted" ? NOTICE_TEXT.listenInterrupted : SPEECH_ERROR_TEXT[code] });
      return false;
    }

    this.update({ phase: "starting", partial: "", notice: { tone: "info", text: NOTICE_TEXT.listenRetrying } });
    await this.wait(Math.min(LISTEN_RETRY_BASE_MS * 2 ** (this.listenFailures - 1), LISTEN_RETRY_MAX_MS));
    return epoch === this.epoch;
  }

  /** รับคำพูดหรือข้อความของผู้ใช้: ถ้าเป็นคำยืนยัน/ยกเลิกรายการกรอกฟอร์มให้จัดการเอง ไม่เช่นนั้นส่งไปถาม AI */
  private async handle(userText: string, epoch: number): Promise<void> {
    const decision = this.state.pendingFillId ? interpretFillDecision(userText) : null;
    if (!decision) {
      await this.respond(userText, epoch);
      return;
    }

    this.update({ partial: "" });
    const notice = await this.decideFill(decision);
    if (epoch !== this.epoch) return;

    if (!this.state.active) {
      this.update({ phase: "idle", notice });
      return;
    }
    if (notice && this.voiceReplies) {
      this.update({ phase: "speaking", notice });
      await this.deps.synthesizer.speak(notice.text).catch(() => undefined);
      if (epoch !== this.epoch) return;
    }
    await this.listen(epoch, notice);
  }

  private setFillStatus(id: string, status: FillStatus, filledCount?: number): void {
    this.patchMessage(id, (message) =>
      message.fill ? { ...message, fill: { ...message.fill, status, filledCount } } : message
    );
  }

  /** ทำตามการตัดสินใจของผู้ใช้ต่อรายการกรอกฟอร์มที่รออยู่ คืนข้อความแจ้งผล */
  private async decideFill(decision: FillDecision): Promise<Notice | null> {
    const id = this.state.pendingFillId;
    const request = this.state.messages.find((message) => message.id === id)?.fill;
    if (!id || !request || request.status !== "pending" || this.filling) return null;

    if (decision === "cancel") {
      this.setFillStatus(id, "cancelled");
      this.update({ pendingFillId: null });
      return { tone: "info", text: NOTICE_TEXT.fillCancelled };
    }

    this.filling = true;
    let result: FillResult;
    try {
      result = this.deps.fillPage
        ? await this.deps.fillPage(request.pageUrl, request.fields)
        : { filled: 0, missing: request.fields.map((field) => field.id), failure: "unavailable" };
    } catch {
      result = { filled: 0, missing: request.fields.map((field) => field.id), failure: "unavailable" };
    } finally {
      this.filling = false;
    }

    this.update({ pendingFillId: null });

    if (result.failure || result.filled === 0) {
      this.setFillStatus(id, "failed");
      const text =
        result.failure === "page-changed"
          ? NOTICE_TEXT.fillPageChanged
          : result.failure === "unavailable"
            ? NOTICE_TEXT.fillUnavailable
            : NOTICE_TEXT.fillNothing;
      return { tone: "error", text };
    }

    this.setFillStatus(id, "filled", result.filled);
    const skipped = result.missing.length > 0 ? ` อีก ${result.missing.length} ช่องกรอกไม่ได้` : "";
    return {
      tone: "info",
      text: `กรอกให้แล้ว ${result.filled} ช่องครับ${skipped} กรุณาตรวจความถูกต้อง แล้วกดส่งฟอร์มด้วยตัวเอง`
    };
  }

  private async respond(userText: string, epoch: number): Promise<void> {
    // คำถามใหม่แทนที่รายการกรอกฟอร์มที่ยังไม่ได้ยืนยัน เพื่อไม่ให้มีรายการเก่าค้างรอกดผิด
    if (this.state.pendingFillId) {
      this.setFillStatus(this.state.pendingFillId, "cancelled");
      this.update({ pendingFillId: null });
    }

    const history: ConversationMessage[] = [
      ...this.state.messages,
      { id: this.nextId(), role: "user", text: userText }
    ];
    const replyId = this.nextId();
    this.update({
      phase: "thinking",
      partial: "",
      notice: null,
      messages: [...history, { id: replyId, role: "assistant", text: "" }]
    });

    const request = new AbortController();
    this.request = request;

    const page = (await this.deps.getPageContext?.().catch(() => null)) ?? null;
    if (epoch !== this.epoch) return;

    const speakReply = this.state.active && this.voiceReplies;
    let speech: Promise<void> = Promise.resolve();
    const chunker = createSentenceChunker((sentence) => {
      speech = speech.then(async () => {
        if (epoch !== this.epoch) return;
        this.update({ phase: "speaking" });
        await this.deps.synthesizer.speak(sentence).catch(() => undefined);
      });
    });

    const askedAt = this.clock();
    let answered = false;

    let reply: string;
    try {
      reply = await this.deps.chat(toChatTurns(history), {
        signal: request.signal,
        page,
        memories: this.deps.memory?.list().map(({ id, text }) => ({ id, text })),
        frames: Boolean(this.deps.showPage),
        onEvent: (event) => {
          if (epoch !== this.epoch) return;

          switch (event.type) {
            case "delta":
              if (!answered) {
                // ผู้ใช้รู้สึกว่าได้คำตอบตั้งแต่ข้อความแรกโผล่ จึงวัดถึงตรงนี้ ไม่ใช่จนตอบจบ
                answered = true;
                this.update({ lastReplyMs: Math.max(0, Math.round(this.clock() - askedAt)) });
              }
              if (this.state.searching) this.update({ searching: false });
              this.patchMessage(replyId, (message) => ({ ...message, text: message.text + event.text }));
              if (speakReply) chunker.push(event.text);
              break;

            case "status":
              this.update({ searching: true });
              break;

            case "sources":
              this.patchMessage(replyId, (message) => ({ ...message, sources: event.sources }));
              break;

            case "suggestions":
              this.patchMessage(replyId, (message) => ({ ...message, suggestions: event.html }));
              break;

            case "open": {
              // เปิดให้เองเฉพาะเมื่อ backend ยืนยันว่าลิงก์มาจากคำสั่งของผู้ใช้โดยตรง
              // เจ้าของเว็บยอมให้แสดงในกรอบ และแอปมีกรอบ: แสดงในแอปเลย ผู้ใช้ไม่ต้องออกจากหน้านี้และ Javis ยังฟังต่อได้
              const framed = event.auto && event.embed === true && (this.deps.showPage?.(event.url, event.title) ?? false);
              const opened = framed || (event.auto && this.deps.openPage(event.url));
              // เปิดแท็บใหม่ไม่ได้: พาแท็บนี้ไปแทนเมื่อคำตอบจบ ผู้ใช้สั่งให้เปิดแล้ว จึงไม่ควรต้องแตะลิงก์เองอีก
              const inPlace = event.auto && !opened && Boolean(this.deps.leaveToPage);
              const blocked = event.auto && !opened && !inPlace;
              if (inPlace) this.leaving = { messageId: replyId, url: event.url };
              this.patchMessage(replyId, (message) => ({
                ...message,
                link: { title: event.title, url: event.url, opened, blocked, inPlace, ...(framed ? { framed: true } : {}) }
              }));
              // ผู้ใช้ที่สั่งด้วยเสียงไม่ได้มองจอ: ต้องได้ยินว่ายังไม่ได้เปิด ไม่เช่นนั้นจะรอหน้าเว็บที่ไม่มา
              if (blocked && speakReply) chunker.push(`\n${NOTICE_TEXT.popupBlocked}`);
              break;
            }

            case "fill":
              // รับเฉพาะเมื่อรู้ว่ารายการนี้อ้างถึงหน้าไหน และเก็บไว้รอผู้ใช้ยืนยันเท่านั้น ยังไม่กรอก
              if (!page) break;
              this.patchMessage(replyId, (message) => ({
                ...message,
                fill: { pageUrl: page.url, fields: event.fields, status: "pending" }
              }));
              this.update({ pendingFillId: replyId });
              break;

            case "memory": {
              // บันทึกลงอุปกรณ์ทันที และแนบป้ายไว้กับคำตอบให้ผู้ใช้เห็นและยกเลิกได้
              const memory = this.deps.memory;
              if (!memory) break;

              const notes: MemoryNote[] = [];
              for (const text of event.added) {
                const added = memory.add(text);
                if (added) notes.push({ kind: "added", id: added.id, text: added.text });
              }
              for (const id of event.removed) {
                const removed = memory.remove(id);
                if (removed) notes.push({ kind: "removed", text: removed.text });
              }
              if (notes.length > 0) {
                this.patchMessage(replyId, (message) => ({
                  ...message,
                  memoryNotes: [...(message.memoryNotes ?? []), ...notes]
                }));
              }
              break;
            }
          }
        }
      });
    } catch (error) {
      if (epoch !== this.epoch) return;
      await this.failTurn({
        tone: "error",
        text: error instanceof ChatError ? error.message : NOTICE_TEXT.chatFailed
      });
      return;
    }
    if (epoch !== this.epoch) return;
    if (this.state.searching) this.update({ searching: false });

    if (!reply.trim()) {
      await this.failTurn({ tone: "error", text: NOTICE_TEXT.emptyReply });
      return;
    }

    const leavingAfterReply = () => this.leaving?.messageId === replyId;
    if (leavingAfterReply() && speakReply) {
      // คำตอบที่มีแหล่งที่มาคือเนื้อหาที่ผู้ใช้ขอ จึงอ่านให้จบก่อนออก ส่วนคำตอบของคำสั่งเปิดเว็บเป็นแค่คำรับคำ
      // จึงไม่รออ่าน แต่ไม่ตัดประโยคที่เริ่มอ่านไปแล้วกลางคัน
      const answered = this.state.messages.some((message) => message.id === replyId && Boolean(message.sources?.length));
      if (answered) chunker.flush();
      await speech;
      if (epoch !== this.epoch) return;
    }
    // ตรวจอีกครั้ง เพราะระหว่างอ่านคำตอบ ผู้ใช้อาจแตะลิงก์เปิดเองไปแล้ว
    if (leavingAfterReply()) {
      if (this.leave()) return;
      if (speakReply) chunker.push(`\n${NOTICE_TEXT.popupBlocked}`);
    }

    if (speakReply) {
      chunker.flush();
      await speech;
      if (epoch !== this.epoch) return;
    }

    if (this.state.active) await this.listen(epoch);
    else this.update({ phase: "idle" });
  }
}
