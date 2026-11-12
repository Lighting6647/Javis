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
  type StreamChat
} from "./types";

/** ต้องไม่เกินเพดานที่เซิร์ฟเวอร์ตรวจ (server/chat.ts) */
export const HISTORY_LIMIT = 20;
export const MESSAGE_LENGTH_LIMIT = 2000;

export interface ConversationDeps {
  recognizer: SpeechRecognizer;
  synthesizer: SpeechSynthesizer;
  chat: StreamChat;
  /** เปิดหน้าเว็บให้ผู้ใช้ คืน false ถ้าเปิดไม่ได้ (ผู้ใช้ยังกดลิงก์ในบทสนทนาเองได้) */
  openPage: (url: string) => boolean;
  /** อ่านหน้าเว็บที่เปิดอยู่ในเบราว์เซอร์ในตัว มีเฉพาะในแอปเดสก์ท็อป */
  getPageContext?: () => Promise<PageContext | null>;
  /** กรอกค่าลงฟอร์มของหน้าเว็บที่เปิดอยู่ เรียกหลังผู้ใช้ยืนยันแล้วเท่านั้น */
  fillPage?: (pageUrl: string, values: FillValue[]) => Promise<FillResult>;
  /** ความจำระยะยาวของผู้ใช้ที่เก็บในอุปกรณ์ */
  memory?: MemoryPort;
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
  pendingFillId: null
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

  constructor(private readonly deps: ConversationDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): ConversationState => this.state;

  /** เริ่มสนทนาด้วยเสียง ต้องเรียกจากจังหวะที่ผู้ใช้แตะหน้าจอ */
  start = async (): Promise<void> => {
    if (this.state.active) return;

    const epoch = this.halt();
    this.update({ active: true, phase: "starting", notice: null });

    // สั่งเตรียมตัวพูดก่อน await ใด ๆ เพื่อให้ยังอยู่ในจังหวะแตะของผู้ใช้
    const voiceReady = this.deps.synthesizer.prepare().catch(() => false);

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
    if (this.state.phase === "starting") this.update({ active: false });
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

  /** ผู้ใช้แตะลิงก์หน้าเว็บของข้อความนั้นเอง: ลิงก์ถือว่าเปิดแล้ว และไม่ต้องบอกว่าถูกบล็อกอีก */
  markLinkOpened = (messageId: string): void => {
    this.patchMessage(messageId, (message) =>
      message.link ? { ...message, link: { ...message.link, opened: true, blocked: false } } : message
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
    this.update({
      partial: "",
      searching: false,
      // คำตอบที่ถูกตัดก่อนมีข้อความ ไม่ต้องค้างเป็นกล่องเปล่า
      messages: this.state.messages.filter((message) => message.text.trim())
    });
    return this.epoch;
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

  private async listen(epoch: number, notice: Notice | null = null): Promise<void> {
    this.update({
      phase: "listening",
      partial: "",
      notice: notice ?? (this.voiceReplies ? null : { tone: "info", text: NOTICE_TEXT.noThaiVoice }),
      onDeviceListening: this.deps.recognizer.isOnDevice()
    });

    let heard: string;
    try {
      heard = await this.deps.recognizer.listen((partial) => {
        if (epoch === this.epoch) this.update({ partial });
      });
    } catch (error) {
      if (epoch === this.epoch) this.failSpeech(error);
      return;
    }
    if (epoch !== this.epoch) return;

    const text = heard.trim().slice(0, MESSAGE_LENGTH_LIMIT);
    if (!text) {
      this.fail({ tone: "info", text: NOTICE_TEXT.noSpeech });
      return;
    }
    await this.handle(text, epoch);
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

    let reply: string;
    try {
      reply = await this.deps.chat(toChatTurns(history), {
        signal: request.signal,
        page,
        memories: this.deps.memory?.list().map(({ id, text }) => ({ id, text })),
        onEvent: (event) => {
          if (epoch !== this.epoch) return;

          switch (event.type) {
            case "delta":
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
              const opened = event.auto && this.deps.openPage(event.url);
              const blocked = event.auto && !opened;
              this.patchMessage(replyId, (message) => ({
                ...message,
                link: { title: event.title, url: event.url, opened, blocked }
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
      this.fail({
        tone: "error",
        text: error instanceof ChatError ? error.message : NOTICE_TEXT.chatFailed
      });
      return;
    }
    if (epoch !== this.epoch) return;
    if (this.state.searching) this.update({ searching: false });

    if (!reply.trim()) {
      this.fail({ tone: "error", text: NOTICE_TEXT.emptyReply });
      return;
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
