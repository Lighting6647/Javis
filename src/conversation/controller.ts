import { SpeechError, type SpeechRecognizer, type SpeechSynthesizer } from "../speech/types";
import { NOTICE_TEXT, SPEECH_ERROR_TEXT } from "./messages";
import { createSentenceChunker } from "./sentenceChunker";
import {
  ChatError,
  type ChatTurn,
  type ConversationMessage,
  type ConversationState,
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
}

const INITIAL_STATE: ConversationState = {
  phase: "idle",
  active: false,
  messages: [],
  partial: "",
  notice: null,
  onDeviceListening: false
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
    void this.respond(clean, epoch);
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
      // คำตอบที่ถูกตัดก่อนมีข้อความ ไม่ต้องค้างเป็นกล่องเปล่า
      messages: this.state.messages.filter((message) => message.text.trim())
    });
    return this.epoch;
  }

  private fail(notice: Notice | null): void {
    this.halt();
    this.update({ active: false, phase: "idle", notice });
  }

  private failSpeech(error: unknown): void {
    const code = error instanceof SpeechError ? error.code : "unknown";
    this.fail(code === "aborted" ? null : { tone: "error", text: SPEECH_ERROR_TEXT[code] });
  }

  private async listen(epoch: number): Promise<void> {
    this.update({
      phase: "listening",
      partial: "",
      notice: this.voiceReplies ? null : { tone: "info", text: NOTICE_TEXT.noThaiVoice },
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
    await this.respond(text, epoch);
  }

  private async respond(userText: string, epoch: number): Promise<void> {
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
        onDelta: (delta) => {
          if (epoch !== this.epoch) return;
          this.update({
            messages: this.state.messages.map((message) =>
              message.id === replyId ? { ...message, text: message.text + delta } : message
            )
          });
          if (speakReply) chunker.push(delta);
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
