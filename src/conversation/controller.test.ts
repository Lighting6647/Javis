import { describe, expect, it } from "vitest";
import type { FillResult, FillValue, PageContext } from "../browser/types";
import { SpeechError, type SpeechRecognizer, type SpeechSynthesizer } from "../speech/types";
import { ConversationController, HISTORY_LIMIT, type MemoryPort } from "./controller";
import { NOTICE_TEXT, SPEECH_ERROR_TEXT } from "./messages";
import {
  ChatError,
  type ChatStreamOptions,
  type ChatTurn,
  type ConversationMessage,
  type MemoryEntry,
  type StreamChat
} from "./types";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** รอให้งานอะซิงก์ที่ค้างอยู่เดินจนสุด */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class FakeRecognizer implements SpeechRecognizer {
  prepareError: SpeechError | null = null;
  onDevice = false;
  stopCalls = 0;
  readonly listens: Array<{ onPartial: (text: string) => void; result: Deferred<string> }> = [];

  async prepare(): Promise<void> {
    if (this.prepareError) throw this.prepareError;
  }

  isOnDevice(): boolean {
    return this.onDevice;
  }

  listen(onPartial: (text: string) => void): Promise<string> {
    const result = deferred<string>();
    this.listens.push({ onPartial, result });
    return result.promise;
  }

  stop(): void {
    this.stopCalls += 1;
  }

  cancel(): void {
    this.listens.at(-1)?.result.reject(new SpeechError("aborted"));
  }

  get current() {
    const session = this.listens.at(-1);
    if (!session) throw new Error("ยังไม่ได้เริ่มฟัง");
    return session;
  }
}

class FakeSynthesizer implements SpeechSynthesizer {
  hasThaiVoice = true;
  holdSpeech = false;
  cancelCalls = 0;
  readonly spoken: string[] = [];
  readonly held: Array<Deferred<void>> = [];

  async listVoices() {
    return this.hasThaiVoice ? [{ id: "fake-thai", name: "Fake Thai" }] : [];
  }

  applySettings(): void {
    // ตัวจำลองไม่สนใจการตั้งค่าเสียง
  }

  async prepare(): Promise<boolean> {
    return this.hasThaiVoice;
  }

  speak(text: string): Promise<void> {
    this.spoken.push(text);
    if (!this.holdSpeech) return Promise.resolve();
    const speech = deferred<void>();
    this.held.push(speech);
    return speech.promise;
  }

  cancel(): void {
    this.cancelCalls += 1;
  }
}

class FakeChat {
  readonly calls: Array<{ messages: ChatTurn[]; options: ChatStreamOptions; result: Deferred<string> }> = [];

  readonly stream: StreamChat = (messages, options) => {
    const result = deferred<string>();
    this.calls.push({ messages, options, result });
    return result.promise;
  };

  get current() {
    const call = this.calls.at(-1);
    if (!call) throw new Error("ยังไม่ได้ขอคำตอบ");
    return call;
  }

  /** จำลองคำตอบที่สตรีมเข้ามาทีละส่วนจนจบ */
  reply(...deltas: string[]): void {
    deltas.forEach((delta) => this.current.options.onEvent({ type: "delta", text: delta }));
    this.current.result.resolve(deltas.join(""));
  }
}

/** ตัวเปิดหน้าเว็บจำลอง: จดไว้ว่าถูกสั่งเปิดอะไร และกำหนดได้ว่าเปิดสำเร็จหรือถูกบล็อก */
class FakeBrowser {
  succeeds = true;
  /** การพาแท็บนี้ไปยังหน้าเว็บสำเร็จหรือไม่ */
  leaveSucceeds = true;
  readonly opened: string[] = [];
  /** หน้าที่แท็บนี้ถูกพาไป พร้อมบทสนทนาที่เห็นในจังหวะนั้น (สิ่งที่จะถูกเก็บไว้คืนให้ตอนผู้ใช้กลับมา) */
  readonly left: Array<{ url: string; messages: ConversationMessage[] }> = [];

  readonly open = (url: string): boolean => {
    this.opened.push(url);
    return this.succeeds;
  };
}

interface SetupOptions {
  /** เบราว์เซอร์ทั่วไป: เมื่อเปิดแท็บใหม่ไม่ได้ พาแท็บนี้ไปยังหน้านั้นแทนได้ */
  canLeave?: boolean;
}

function setup(options: SetupOptions = {}) {
  const recognizer = new FakeRecognizer();
  const synthesizer = new FakeSynthesizer();
  const chat = new FakeChat();
  const browser = new FakeBrowser();
  const controller: ConversationController = new ConversationController({
    recognizer,
    synthesizer,
    chat: chat.stream,
    openPage: browser.open,
    leaveToPage: options.canLeave
      ? (url) => {
          if (browser.leaveSucceeds) browser.left.push({ url, messages: controller.getState().messages });
          return browser.leaveSucceeds;
        }
      : undefined
  });
  return { recognizer, synthesizer, chat, browser, controller };
}

describe("ConversationController", () => {
  it("ฟัง ตอบด้วยเสียงทีละประโยค แล้วกลับมาฟังต่อเอง", async () => {
    const { recognizer, synthesizer, chat, controller } = setup();

    void controller.start();
    await settle();
    expect(controller.getState()).toMatchObject({ phase: "listening", active: true, notice: null });

    recognizer.current.onPartial("สวัส");
    expect(controller.getState().partial).toBe("สวัส");

    recognizer.current.result.resolve("สวัสดี");
    await settle();
    expect(controller.getState()).toMatchObject({ phase: "thinking", partial: "" });
    expect(chat.current.messages).toEqual([{ role: "user", content: "สวัสดี" }]);

    chat.reply("สวัสดีครับ\n", "วันนี้ให้ช่วยอะไรดีครับ");
    await settle();

    expect(synthesizer.spoken).toEqual(["สวัสดีครับ", "วันนี้ให้ช่วยอะไรดีครับ"]);
    expect(controller.getState().messages.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: "user", text: "สวัสดี" },
      { role: "assistant", text: "สวัสดีครับ\nวันนี้ให้ช่วยอะไรดีครับ" }
    ]);
    expect(controller.getState().phase).toBe("listening");
    expect(recognizer.listens).toHaveLength(2);
  });

  it("ส่งประวัติบทสนทนาก่อนหน้าไปพร้อมคำถามใหม่", async () => {
    const { recognizer, chat, controller } = setup();

    void controller.start();
    await settle();
    recognizer.current.result.resolve("ชื่ออะไร");
    await settle();
    chat.reply("ผมชื่อ Javis ครับ");
    await settle();
    recognizer.current.result.resolve("ทำอะไรได้บ้าง");
    await settle();

    expect(chat.current.messages).toEqual([
      { role: "user", content: "ชื่ออะไร" },
      { role: "assistant", content: "ผมชื่อ Javis ครับ" },
      { role: "user", content: "ทำอะไรได้บ้าง" }
    ]);
  });

  it("จบโหมดเสียงพร้อมคำแนะนำเมื่อไม่ได้ยินเสียงพูด", async () => {
    const { recognizer, chat, controller } = setup();

    void controller.start();
    await settle();
    recognizer.current.result.resolve("   ");
    await settle();

    expect(controller.getState()).toMatchObject({
      phase: "idle",
      active: false,
      notice: { tone: "info", text: NOTICE_TEXT.noSpeech }
    });
    expect(chat.calls).toHaveLength(0);
  });

  it("แจ้งเตือนเมื่อไม่ได้รับสิทธิ์ไมโครโฟน", async () => {
    const { recognizer, controller } = setup();
    recognizer.prepareError = new SpeechError("permission-denied");

    await controller.start();

    expect(controller.getState()).toMatchObject({
      phase: "idle",
      active: false,
      notice: { tone: "error", text: SPEECH_ERROR_TEXT["permission-denied"] }
    });
    expect(recognizer.listens).toHaveLength(0);
  });

  it("แจ้งเตือนเมื่อระบบฟังเสียงขัดข้องระหว่างฟัง", async () => {
    const { recognizer, controller } = setup();

    void controller.start();
    await settle();
    recognizer.current.result.reject(new SpeechError("network"));
    await settle();

    expect(controller.getState()).toMatchObject({
      phase: "idle",
      active: false,
      notice: { tone: "error", text: SPEECH_ERROR_TEXT.network }
    });
  });

  it("ตอบเป็นข้อความอย่างเดียวเมื่ออุปกรณ์ไม่มีเสียงภาษาไทย", async () => {
    const { recognizer, synthesizer, chat, controller } = setup();
    synthesizer.hasThaiVoice = false;

    void controller.start();
    await settle();
    expect(controller.getState().notice).toEqual({ tone: "info", text: NOTICE_TEXT.noThaiVoice });

    recognizer.current.result.resolve("สวัสดี");
    await settle();
    chat.reply("สวัสดีครับ");
    await settle();

    expect(synthesizer.spoken).toEqual([]);
    expect(controller.getState().phase).toBe("listening");
  });

  it("พูดแทรกได้: หยุดเสียง ยกเลิกคำขอ แล้วกลับมาฟังทันที", async () => {
    const { recognizer, synthesizer, chat, controller } = setup();
    synthesizer.holdSpeech = true;

    void controller.start();
    await settle();
    recognizer.current.result.resolve("เล่านิทานหน่อย");
    await settle();

    const firstCall = chat.current;
    firstCall.options.onEvent({ type: "delta", text: "กาลครั้งหนึ่งนานมาแล้ว\n" });
    await settle();
    expect(controller.getState().phase).toBe("speaking");

    const cancelsBefore = synthesizer.cancelCalls;
    controller.interrupt();
    await settle();

    expect(firstCall.options.signal.aborted).toBe(true);
    expect(synthesizer.cancelCalls).toBeGreaterThan(cancelsBefore);
    expect(controller.getState().phase).toBe("listening");
    expect(recognizer.listens).toHaveLength(2);

    // ผลลัพธ์ที่ตามมาจากรอบเก่าต้องไม่เปลี่ยนสถานะปัจจุบัน
    const snapshot = controller.getState();
    firstCall.options.onEvent({ type: "delta", text: "มีกระต่ายตัวหนึ่ง" });
    firstCall.options.onEvent({ type: "open", url: "https://example.com/", title: "ตัวอย่าง", auto: true });
    firstCall.result.resolve("กาลครั้งหนึ่งนานมาแล้ว\nมีกระต่ายตัวหนึ่ง");
    synthesizer.held.forEach((speech) => speech.resolve());
    await settle();

    expect(controller.getState()).toBe(snapshot);
    expect(synthesizer.spoken).toEqual(["กาลครั้งหนึ่งนานมาแล้ว"]);
  });

  it("แสดงข้อความผิดพลาดจากเซิร์ฟเวอร์ และไม่ทิ้งกล่องคำตอบเปล่าไว้", async () => {
    const { recognizer, chat, controller } = setup();

    void controller.start();
    await settle();
    recognizer.current.result.resolve("สวัสดี");
    await settle();
    chat.current.result.reject(new ChatError("ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"));
    await settle();

    expect(controller.getState()).toMatchObject({
      phase: "idle",
      active: false,
      notice: { tone: "error", text: "ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" }
    });
    expect(controller.getState().messages.map((message) => message.role)).toEqual(["user"]);
  });

  it("แจ้งเตือนเมื่อ AI ตอบกลับมาว่างเปล่า", async () => {
    const { chat, controller } = setup();

    controller.sendText("สวัสดี");
    await settle();
    chat.current.result.resolve("");
    await settle();

    expect(controller.getState().notice).toEqual({ tone: "error", text: NOTICE_TEXT.emptyReply });
    expect(controller.getState().phase).toBe("idle");
  });

  it("ข้อความที่พิมพ์ตอนไม่ได้เปิดโหมดเสียง ได้คำตอบเป็นข้อความโดยไม่เปิดไมโครโฟน", async () => {
    const { recognizer, synthesizer, chat, controller } = setup();

    controller.sendText("  สรุปงานวันนี้ให้หน่อย  ");
    await settle();
    expect(controller.getState().phase).toBe("thinking");
    expect(chat.current.messages).toEqual([{ role: "user", content: "สรุปงานวันนี้ให้หน่อย" }]);

    chat.reply("ได้เลยครับ");
    await settle();

    expect(controller.getState()).toMatchObject({ phase: "idle", active: false });
    expect(synthesizer.spoken).toEqual([]);
    expect(recognizer.listens).toHaveLength(0);
  });

  it("ไม่ส่งข้อความที่มีแต่ช่องว่าง", async () => {
    const { chat, controller } = setup();

    controller.sendText("   ");
    await settle();

    expect(chat.calls).toHaveLength(0);
    expect(controller.getState().messages).toEqual([]);
  });

  it("ส่งประวัติไม่เกินจำนวนที่เซิร์ฟเวอร์รับ", async () => {
    const { chat, controller } = setup();

    for (let round = 0; round < HISTORY_LIMIT; round += 1) {
      controller.sendText(`คำถามที่ ${round + 1}`);
      await settle();
      chat.reply(`คำตอบที่ ${round + 1}`);
      await settle();
    }
    controller.sendText("คำถามสุดท้าย");
    await settle();

    expect(chat.current.messages).toHaveLength(HISTORY_LIMIT);
    expect(chat.current.messages.at(-1)).toEqual({ role: "user", content: "คำถามสุดท้าย" });
  });

  it("จบการสนทนาแล้วหยุดฟังและล้างข้อความที่ได้ยินค้างไว้", async () => {
    const { recognizer, controller } = setup();

    void controller.start();
    await settle();
    recognizer.current.onPartial("กำลังจะถาม");
    controller.stop();
    await settle();

    expect(controller.getState()).toMatchObject({ phase: "idle", active: false, partial: "", notice: null });
    expect(recognizer.listens).toHaveLength(1);
  });

  it("บอกหน้าจอเมื่อเสียงถูกแปลงเป็นข้อความในเครื่อง", async () => {
    const { recognizer, controller } = setup();
    expect(controller.getState().onDeviceListening).toBe(false);

    recognizer.onDevice = true;
    void controller.start();
    await settle();

    expect(controller.getState().onDeviceListening).toBe(true);
  });

  it("ล้างบทสนทนาและหยุดทุกอย่างเมื่อออกจากระบบ", async () => {
    const { recognizer, chat, controller } = setup();
    recognizer.onDevice = true;

    void controller.start();
    await settle();
    recognizer.current.result.resolve("ข้อมูลส่วนตัวของผู้ใช้คนแรก");
    await settle();
    const pending = chat.current;
    pending.options.onEvent({ type: "delta", text: "คำตอบบางส่วน" });

    controller.reset();
    pending.result.resolve("คำตอบบางส่วน ที่ตามมาทีหลัง");
    await settle();

    expect(pending.options.signal.aborted).toBe(true);
    expect(controller.getState()).toEqual({
      phase: "idle",
      active: false,
      messages: [],
      partial: "",
      notice: null,
      onDeviceListening: false,
      searching: false,
      pendingFillId: null
    });
  });

  describe("ความจำ", () => {
    /** คลังความจำจำลอง */
    function setupWithMemory(initial: MemoryEntry[] = []) {
      const recognizer = new FakeRecognizer();
      const synthesizer = new FakeSynthesizer();
      const chat = new FakeChat();
      let items = [...initial];
      let counter = 100;
      const memory: MemoryPort = {
        list: () => items,
        add: (text) => {
          if (items.some((item) => item.text === text)) return null;
          const item = { id: `m${(counter += 1)}`, text };
          items = [...items, item];
          return item;
        },
        remove: (id) => {
          const found = items.find((item) => item.id === id) ?? null;
          items = items.filter((item) => item.id !== id);
          return found;
        }
      };
      const controller = new ConversationController({ recognizer, synthesizer, chat: chat.stream, openPage: () => true, memory });
      return { recognizer, synthesizer, chat, controller, memory };
    }

    it("ส่งความจำที่มีอยู่ไปกับคำถาม", async () => {
      const { chat, controller } = setupWithMemory([{ id: "m1", text: "ผู้ใช้ชื่อไลท์" }]);

      controller.sendText("สวัสดี");
      await settle();

      expect(chat.current.options.memories).toEqual([{ id: "m1", text: "ผู้ใช้ชื่อไลท์" }]);
    });

    it("บันทึกสิ่งที่ AI ขอจำ และแนบป้ายไว้กับคำตอบ", async () => {
      const { chat, controller, memory } = setupWithMemory();

      controller.sendText("ผมชื่อไลท์ ทำงานด้านไอที");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "ยินดีที่ได้รู้จักครับคุณไลท์" });
      chat.current.options.onEvent({ type: "memory", added: ["ผู้ใช้ชื่อไลท์", "ทำงานด้านไอที"], removed: [] });
      chat.current.result.resolve("ยินดีที่ได้รู้จักครับคุณไลท์");
      await settle();

      expect(memory.list().map((item) => item.text)).toEqual(["ผู้ใช้ชื่อไลท์", "ทำงานด้านไอที"]);
      expect(controller.getState().messages.at(-1)?.memoryNotes).toEqual([
        { kind: "added", id: "m101", text: "ผู้ใช้ชื่อไลท์" },
        { kind: "added", id: "m102", text: "ทำงานด้านไอที" }
      ]);
    });

    it("ไม่แสดงป้ายสำหรับเรื่องที่จำไว้อยู่แล้ว", async () => {
      const { chat, controller, memory } = setupWithMemory([{ id: "m1", text: "ผู้ใช้ชื่อไลท์" }]);

      controller.sendText("ผมชื่อไลท์");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "ครับคุณไลท์" });
      chat.current.options.onEvent({ type: "memory", added: ["ผู้ใช้ชื่อไลท์"], removed: [] });
      chat.current.result.resolve("ครับคุณไลท์");
      await settle();

      expect(memory.list()).toHaveLength(1);
      expect(controller.getState().messages.at(-1)?.memoryNotes).toBeUndefined();
    });

    it("ลืมเรื่องที่ AI ขอลืม และบอกผู้ใช้ว่าลืมเรื่องอะไร", async () => {
      const { chat, controller, memory } = setupWithMemory([
        { id: "m1", text: "ผู้ใช้ชื่อไลท์" },
        { id: "m2", text: "ชอบกาแฟดำ" }
      ]);

      controller.sendText("ลืมเรื่องกาแฟไปได้เลย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "ลืมให้แล้วครับ" });
      chat.current.options.onEvent({ type: "memory", added: [], removed: ["m2", "m99"] });
      chat.current.result.resolve("ลืมให้แล้วครับ");
      await settle();

      expect(memory.list()).toEqual([{ id: "m1", text: "ผู้ใช้ชื่อไลท์" }]);
      expect(controller.getState().messages.at(-1)?.memoryNotes).toEqual([{ kind: "removed", text: "ชอบกาแฟดำ" }]);
    });

    it("กดยกเลิกแล้วลบเรื่องที่เพิ่งจำ และทำเครื่องหมายที่ป้าย", async () => {
      const { chat, controller, memory } = setupWithMemory();

      controller.sendText("ผมชื่อไลท์");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "ครับ" });
      chat.current.options.onEvent({ type: "memory", added: ["ผู้ใช้ชื่อไลท์"], removed: [] });
      chat.current.result.resolve("ครับ");
      await settle();

      const message = controller.getState().messages.at(-1);
      controller.undoMemory(message?.id ?? "", "m101");

      expect(memory.list()).toEqual([]);
      expect(controller.getState().messages.at(-1)?.memoryNotes).toEqual([
        { kind: "added", id: "m101", text: "ผู้ใช้ชื่อไลท์", undone: true }
      ]);
    });

    it("ไม่ทำอะไรกับเหตุการณ์ความจำเมื่ออุปกรณ์ไม่มีคลังความจำ", async () => {
      const { chat, controller } = setup();

      controller.sendText("ผมชื่อไลท์");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "ครับ" });
      chat.current.options.onEvent({ type: "memory", added: ["ผู้ใช้ชื่อไลท์"], removed: [] });
      chat.current.result.resolve("ครับ");
      await settle();

      expect(chat.current.options.memories).toBeUndefined();
      expect(controller.getState().messages.at(-1)?.memoryNotes).toBeUndefined();
    });
  });

  describe("การกรอกฟอร์มของหน้าเว็บ", () => {
    const PAGE: PageContext = {
      url: "https://clinic.example.com/register",
      title: "ลงทะเบียนผู้ป่วยใหม่",
      fields: [
        { id: "f1", label: "ชื่อ-นามสกุล", type: "text" },
        { id: "f2", label: "เบอร์โทรศัพท์", type: "tel" }
      ]
    };
    const PROPOSAL: FillValue[] = [
      { id: "f1", label: "ชื่อ-นามสกุล", value: "สมชาย ใจดี" },
      { id: "f2", label: "เบอร์โทรศัพท์", value: "0812345678" }
    ];

    /** ตัวจำลองหน้าเว็บที่เปิดอยู่ในแอปเดสก์ท็อป */
    function setupWithPage(result: FillResult = { filled: 2, missing: [] }) {
      const recognizer = new FakeRecognizer();
      const synthesizer = new FakeSynthesizer();
      const chat = new FakeChat();
      const fills: Array<{ pageUrl: string; values: FillValue[] }> = [];
      const controller = new ConversationController({
        recognizer,
        synthesizer,
        chat: chat.stream,
        openPage: () => true,
        getPageContext: async () => PAGE,
        fillPage: async (pageUrl, values) => {
          fills.push({ pageUrl, values });
          return result;
        }
      });
      return { recognizer, synthesizer, chat, controller, fills };
    }

    /** พิมพ์สั่งกรอก แล้วให้ AI เสนอรายการ */
    async function propose(controller: ConversationController, chat: FakeChat) {
      controller.sendText("กรอกชื่อ สมชาย ใจดี เบอร์ 0812345678");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "เตรียมไว้ให้แล้วครับ" });
      chat.current.options.onEvent({ type: "fill", fields: PROPOSAL });
      chat.current.result.resolve("เตรียมไว้ให้แล้วครับ");
      await settle();
    }

    const lastFill = (controller: ConversationController) => controller.getState().messages.at(-1)?.fill;

    it("ส่งข้อมูลหน้าเว็บไปกับคำถาม และเก็บรายการที่เสนอไว้รอยืนยันโดยยังไม่กรอก", async () => {
      const { chat, controller, fills } = setupWithPage();

      await propose(controller, chat);

      expect(chat.current.options.page).toEqual(PAGE);
      expect(fills).toEqual([]);
      expect(lastFill(controller)).toEqual({ pageUrl: PAGE.url, fields: PROPOSAL, status: "pending" });
      expect(controller.getState().pendingFillId).toBe(controller.getState().messages.at(-1)?.id);
    });

    it("กรอกเฉพาะรายการที่เสนอ เมื่อผู้ใช้กดยืนยัน", async () => {
      const { chat, controller, fills } = setupWithPage();
      await propose(controller, chat);

      controller.confirmFill();
      await settle();

      expect(fills).toEqual([{ pageUrl: PAGE.url, values: PROPOSAL }]);
      expect(lastFill(controller)).toMatchObject({ status: "filled", filledCount: 2 });
      expect(controller.getState().pendingFillId).toBeNull();
      expect(controller.getState().notice).toEqual({
        tone: "info",
        text: "กรอกให้แล้ว 2 ช่องครับ กรุณาตรวจความถูกต้อง แล้วกดส่งฟอร์มด้วยตัวเอง"
      });
    });

    it("กดยืนยันซ้ำไม่ทำให้กรอกซ้ำ", async () => {
      const { chat, controller, fills } = setupWithPage();
      await propose(controller, chat);

      controller.confirmFill();
      controller.confirmFill();
      await settle();
      controller.confirmFill();
      await settle();

      expect(fills).toHaveLength(1);
    });

    it("ไม่กรอกอะไรเมื่อผู้ใช้กดยกเลิก", async () => {
      const { chat, controller, fills } = setupWithPage();
      await propose(controller, chat);

      controller.cancelFill();
      await settle();

      expect(fills).toEqual([]);
      expect(lastFill(controller)).toMatchObject({ status: "cancelled" });
      expect(controller.getState().notice).toEqual({ tone: "info", text: NOTICE_TEXT.fillCancelled });
    });

    it("พิมพ์หรือพูดว่า ยืนยัน แล้วกรอกทันทีโดยไม่ถาม AI ซ้ำ", async () => {
      const { chat, controller, fills } = setupWithPage();
      await propose(controller, chat);

      controller.sendText("ยืนยันครับ");
      await settle();

      expect(fills).toHaveLength(1);
      expect(chat.calls).toHaveLength(1);
      expect(lastFill(controller)).toMatchObject({ status: "filled" });
    });

    it("ระหว่างสนทนาด้วยเสียง พูดว่า ยืนยัน แล้วอ่านผลให้ฟังและกลับมาฟังต่อ", async () => {
      const { recognizer, synthesizer, chat, controller, fills } = setupWithPage();

      void controller.start();
      await settle();
      recognizer.current.result.resolve("กรอกชื่อ สมชาย ใจดี เบอร์ 0812345678");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "เตรียมไว้ให้แล้วครับ" });
      chat.current.options.onEvent({ type: "fill", fields: PROPOSAL });
      chat.current.result.resolve("เตรียมไว้ให้แล้วครับ");
      await settle();

      recognizer.current.result.resolve("ยืนยัน");
      await settle();

      expect(fills).toHaveLength(1);
      expect(chat.calls).toHaveLength(1);
      expect(synthesizer.spoken.at(-1)).toContain("กรอกให้แล้ว 2 ช่อง");
      expect(controller.getState()).toMatchObject({ phase: "listening", active: true });
      expect(controller.getState().notice?.text).toContain("กดส่งฟอร์มด้วยตัวเอง");
    });

    it("คำถามใหม่ยกเลิกรายการที่ยังไม่ได้ยืนยัน", async () => {
      const { chat, controller, fills } = setupWithPage();
      await propose(controller, chat);
      const proposalId = controller.getState().pendingFillId;

      controller.sendText("ยืนยันการจองโรงแรมให้หน่อย");
      await settle();

      expect(fills).toEqual([]);
      expect(chat.calls).toHaveLength(2);
      expect(controller.getState().pendingFillId).toBeNull();
      expect(controller.getState().messages.find((message) => message.id === proposalId)?.fill?.status).toBe("cancelled");
    });

    it.each([
      ["หน้าเว็บเปลี่ยนไปแล้ว", { filled: 0, missing: ["f1", "f2"], failure: "page-changed" }, NOTICE_TEXT.fillPageChanged],
      ["หน้าเว็บถูกปิดไปแล้ว", { filled: 0, missing: ["f1", "f2"], failure: "unavailable" }, NOTICE_TEXT.fillUnavailable],
      ["หาช่องไม่เจอเลย", { filled: 0, missing: ["f1", "f2"] }, NOTICE_TEXT.fillNothing]
    ] as Array<[string, FillResult, string]>)("แจ้งว่ายังไม่ได้กรอกเมื่อ%s", async (_name, result, text) => {
      const { chat, controller } = setupWithPage(result);
      await propose(controller, chat);

      controller.confirmFill();
      await settle();

      expect(lastFill(controller)).toMatchObject({ status: "failed" });
      expect(controller.getState().notice).toEqual({ tone: "error", text });
    });

    it("บอกจำนวนช่องที่กรอกไม่ได้เมื่อกรอกได้บางส่วน", async () => {
      const { chat, controller } = setupWithPage({ filled: 1, missing: ["f2"] });
      await propose(controller, chat);

      controller.confirmFill();
      await settle();

      expect(lastFill(controller)).toMatchObject({ status: "filled", filledCount: 1 });
      expect(controller.getState().notice?.text).toContain("อีก 1 ช่องกรอกไม่ได้");
    });

    it("ไม่รับรายการเสนอกรอกเมื่อไม่มีหน้าเว็บเปิดอยู่", async () => {
      const { chat, controller } = setup();

      controller.sendText("กรอกชื่อให้หน่อย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "ได้ครับ" });
      chat.current.options.onEvent({ type: "fill", fields: PROPOSAL });
      chat.current.result.resolve("ได้ครับ");
      await settle();

      expect(lastFill(controller)).toBeUndefined();
      expect(controller.getState().pendingFillId).toBeNull();
    });
  });

  it("แจ้งว่ากำลังค้นเว็บ แล้วแนบแหล่งที่มากับคำตอบ โดยไม่อ่านลิงก์ออกเสียง", async () => {
    const { recognizer, synthesizer, chat, controller } = setup();

    void controller.start();
    await settle();
    recognizer.current.result.resolve("ข่าววันนี้มีอะไรบ้าง");
    await settle();

    chat.current.options.onEvent({ type: "status", status: "searching" });
    expect(controller.getState()).toMatchObject({ phase: "thinking", searching: true });

    const answer = "วันนี้ฝนตกหนักในกรุงเทพครับ ([ข่าวสด](https://news.example.com/rain))\n";
    chat.current.options.onEvent({ type: "delta", text: answer });
    expect(controller.getState().searching).toBe(false);

    const sources = [{ title: "ข่าวสด", url: "https://news.example.com/rain" }];
    chat.current.options.onEvent({ type: "sources", sources });
    chat.current.result.resolve(answer);
    await settle();

    expect(controller.getState().messages.at(-1)).toMatchObject({ role: "assistant", text: answer, sources });
    expect(synthesizer.spoken).toEqual(["วันนี้ฝนตกหนักในกรุงเทพครับ"]);
  });

  it("เปิดหน้าเว็บให้เมื่อ backend ยืนยันว่าเป็นคำสั่งของผู้ใช้ และแนบลิงก์ไว้ในคำตอบ", async () => {
    const { chat, browser, controller } = setup();

    controller.sendText("เปิดเว็บกรมอุตุฯ ให้หน่อย");
    await settle();
    chat.current.options.onEvent({ type: "delta", text: "ได้เลยครับ" });
    chat.current.options.onEvent({ type: "open", url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา", auto: true });
    chat.current.result.resolve("ได้เลยครับ");
    await settle();

    expect(browser.opened).toEqual(["https://www.tmd.go.th/"]);
    expect(controller.getState().messages.at(-1)?.link).toEqual({
      title: "กรมอุตุนิยมวิทยา",
      url: "https://www.tmd.go.th/",
      opened: true,
      blocked: false,
      inPlace: false
    });
  });

  it("ไม่เปิดหน้าเว็บเองเมื่อลิงก์มาหลังการอ่านเนื้อหาเว็บ แต่แสดงลิงก์ให้ผู้ใช้กด", async () => {
    const { chat, browser, controller } = setup();

    controller.sendText("ค้นแล้วเปิดให้ด้วย");
    await settle();
    chat.current.options.onEvent({ type: "delta", text: "นี่ครับ" });
    chat.current.options.onEvent({ type: "open", url: "https://unknown.example.net/", title: "ผลลัพธ์", auto: false });
    chat.current.result.resolve("นี่ครับ");
    await settle();

    expect(browser.opened).toEqual([]);
    // ลิงก์ที่ตั้งใจให้ผู้ใช้กดเองไม่ใช่การถูกบล็อก จึงไม่ต้องสอนวิธีอนุญาตป๊อปอัป
    expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: false, blocked: false });
  });

  describe("เบราว์เซอร์บล็อกแท็บใหม่", () => {
    const OPEN = { type: "open", url: "https://www.google.com/search?q=%E0%B8%81", title: "ผลค้นหา ก", auto: true } as const;
    const SAID = "ได้เลยครับ นี่คือหน้า ผลค้นหา ก ครับ";

    it("พิมพ์สั่ง: ลิงก์ถูกทำเครื่องหมายว่าถูกบล็อก ให้ผู้ใช้แตะเปิดเอง", async () => {
      const { synthesizer, chat, browser, controller } = setup();
      browser.succeeds = false;

      controller.sendText("หาข้อมูลเรื่อง ก ให้หน่อย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      chat.current.result.resolve(SAID);
      await settle();

      expect(browser.opened).toEqual([OPEN.url]);
      expect(controller.getState().messages.at(-1)?.link).toEqual({
        title: "ผลค้นหา ก",
        url: OPEN.url,
        opened: false,
        blocked: true,
        inPlace: false
      });
      // ไม่ได้เปิดโหมดเสียง จึงไม่มีอะไรถูกอ่านออกเสียง
      expect(synthesizer.spoken).toEqual([]);
      expect(controller.getState().notice).toBeNull();
    });

    it("สั่งด้วยเสียง: บอกผู้ใช้ด้วยเสียงว่าต้องแตะลิงก์เอง ไม่เช่นนั้นจะเข้าใจว่าเปิดให้แล้ว", async () => {
      const { recognizer, synthesizer, chat, browser, controller } = setup();
      browser.succeeds = false;

      void controller.start();
      await settle();
      recognizer.current.result.resolve("หาข้อมูลเรื่อง ก ให้หน่อย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      chat.current.result.resolve(SAID);
      await settle();

      expect(synthesizer.spoken).toEqual([SAID, NOTICE_TEXT.popupBlocked]);
      // ข้อความในบทสนทนายังเป็นคำตอบของ Javis ตามเดิม ส่วนที่ถูกบล็อกบอกไว้ที่ลิงก์
      expect(controller.getState().messages.at(-1)).toMatchObject({ text: SAID, link: { opened: false, blocked: true } });
      expect(controller.getState().phase).toBe("listening");
    });

    it("เปิดสำเร็จ: ไม่พูดอะไรเพิ่ม", async () => {
      const { recognizer, synthesizer, chat, controller } = setup();

      void controller.start();
      await settle();
      recognizer.current.result.resolve("หาข้อมูลเรื่อง ก ให้หน่อย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      chat.current.result.resolve(SAID);
      await settle();

      expect(synthesizer.spoken).toEqual([SAID]);
      expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: true, blocked: false });
    });

    it("ผู้ใช้แตะลิงก์เปิดเองแล้ว: ลิงก์นั้นไม่ถูกแสดงว่าถูกบล็อกอีก", async () => {
      const { chat, browser, controller } = setup();
      browser.succeeds = false;

      controller.sendText("หาข้อมูลเรื่อง ก ให้หน่อย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      chat.current.result.resolve(SAID);
      await settle();

      const reply = controller.getState().messages.at(-1);
      controller.markLinkOpened(reply?.id ?? "");

      expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: true, blocked: false });
      // ข้อความที่ไม่มีลิงก์หรือไม่มีอยู่จริง: ไม่เกิดอะไรขึ้น
      controller.markLinkOpened("message-1");
      controller.markLinkOpened("ไม่มีข้อความนี้");
      expect(controller.getState().messages[0]?.link).toBeUndefined();
    });
  });

  describe("เปิดแท็บใหม่ไม่ได้ แต่พาแท็บนี้ไปยังหน้านั้นได้", () => {
    const OPEN = { type: "open", url: "https://pantip.com/", title: "Pantip", auto: true } as const;
    const SAID = "ได้เลยครับ นี่คือหน้า Pantip ครับ";
    const ANSWER = "ราคาทองคำแท่งวันนี้ขายออก 62,350 บาทครับ\n";
    const SOURCES = [{ title: "สมาคมค้าทองคำ", url: "https://www.goldtraders.or.th/" }];

    it("พิมพ์สั่ง: พาแท็บนี้ไปทันทีที่คำตอบจบ ไม่ทิ้งลิงก์ไว้ให้แตะ", async () => {
      const { chat, browser, controller } = setup({ canLeave: true });
      browser.succeeds = false;

      controller.sendText("เข้าเว็บไซต์ pantip");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      // ระหว่างรอคำตอบจบ ลิงก์บอกว่ากำลังจะเปิดในแท็บนี้ ไม่ใช่ให้ผู้ใช้แตะเอง
      expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: false, blocked: false, inPlace: true });
      expect(browser.left).toEqual([]);

      chat.current.result.resolve(SAID);
      await settle();

      expect(browser.opened).toEqual([OPEN.url]);
      expect(browser.left.map((entry) => entry.url)).toEqual([OPEN.url]);
      // บทสนทนาในจังหวะที่ออก คือสิ่งที่ถูกเก็บไว้คืนให้ตอนกลับมา: ต้องบอกแล้วว่าหน้านี้เปิดในแท็บนี้
      expect(browser.left[0]?.messages.at(-1)).toMatchObject({
        text: SAID,
        link: { title: "Pantip", url: OPEN.url, opened: true, blocked: false, inPlace: true }
      });
      // ถ้าเบราว์เซอร์คืนหน้าเดิมให้ตอนผู้ใช้กดย้อนกลับ ต้องอยู่ในสภาพพร้อมใช้ ไม่ค้างว่ากำลังคิดหรือกำลังฟัง
      expect(controller.getState()).toMatchObject({ phase: "idle", active: false, notice: null });
    });

    it("สั่งด้วยเสียง: ออกเลยโดยไม่รออ่านคำรับคำ ไม่บอกว่าเบราว์เซอร์บล็อก และไม่กลับไปฟังต่อ", async () => {
      const { recognizer, synthesizer, chat, browser, controller } = setup({ canLeave: true });
      browser.succeeds = false;

      void controller.start();
      await settle();
      recognizer.current.result.resolve("เข้าเว็บไซต์ pantip");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      chat.current.result.resolve(SAID);
      await settle();

      expect(browser.left.map((entry) => entry.url)).toEqual([OPEN.url]);
      expect(synthesizer.spoken).toEqual([]);
      expect(recognizer.listens).toHaveLength(1);
      expect(controller.getState()).toMatchObject({ phase: "idle", active: false });
    });

    it("คำตอบที่มีแหล่งที่มา: อ่านคำตอบให้จบก่อน แล้วจึงพาไปยังหน้าแหล่งข้อมูล", async () => {
      const { recognizer, synthesizer, chat, browser, controller } = setup({ canLeave: true });
      browser.succeeds = false;
      synthesizer.holdSpeech = true;

      void controller.start();
      await settle();
      recognizer.current.result.resolve("หาข้อมูลราคาทองวันนี้ให้หน่อย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: ANSWER });
      chat.current.options.onEvent({ type: "sources", sources: SOURCES });
      chat.current.options.onEvent({ ...OPEN, url: SOURCES[0].url, title: SOURCES[0].title });
      chat.current.result.resolve(ANSWER);
      await settle();

      // ยังอ่านคำตอบไม่จบ: ยังไม่ออกจากหน้า
      expect(synthesizer.spoken).toEqual(["ราคาทองคำแท่งวันนี้ขายออก 62,350 บาทครับ"]);
      expect(browser.left).toEqual([]);

      synthesizer.held[0]?.resolve();
      await settle();
      expect(browser.left.map((entry) => entry.url)).toEqual([SOURCES[0].url]);
    });

    it("ผู้ใช้พูดแทรกก่อนอ่านคำตอบจบ: ไม่ออกจากหน้า และลิงก์กลับเป็นให้แตะเอง", async () => {
      const { recognizer, synthesizer, chat, browser, controller } = setup({ canLeave: true });
      browser.succeeds = false;
      synthesizer.holdSpeech = true;

      void controller.start();
      await settle();
      recognizer.current.result.resolve("หาข้อมูลราคาทองวันนี้ให้หน่อย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: ANSWER });
      chat.current.options.onEvent({ type: "sources", sources: SOURCES });
      chat.current.options.onEvent({ ...OPEN, url: SOURCES[0].url, title: SOURCES[0].title });
      chat.current.result.resolve(ANSWER);
      await settle();

      controller.interrupt();
      synthesizer.held[0]?.resolve();
      await settle();

      expect(browser.left).toEqual([]);
      expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: false, blocked: false, inPlace: false });
      expect(controller.getState().phase).toBe("listening");
    });

    it("พาแท็บนี้ไปไม่สำเร็จ: กลับไปบอกว่าถูกบล็อกและให้ผู้ใช้แตะลิงก์เอง", async () => {
      const { recognizer, synthesizer, chat, browser, controller } = setup({ canLeave: true });
      browser.succeeds = false;
      browser.leaveSucceeds = false;

      void controller.start();
      await settle();
      recognizer.current.result.resolve("เข้าเว็บไซต์ pantip");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      chat.current.result.resolve(SAID);
      await settle();

      expect(browser.left).toEqual([]);
      expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: false, blocked: true, inPlace: false });
      expect(synthesizer.spoken).toEqual([SAID, NOTICE_TEXT.popupBlocked]);
      expect(controller.getState().phase).toBe("listening");
    });

    it("เปิดแท็บใหม่สำเร็จ: แท็บนี้อยู่ที่เดิม", async () => {
      const { chat, browser, controller } = setup({ canLeave: true });

      controller.sendText("เข้าเว็บไซต์ pantip");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      chat.current.result.resolve(SAID);
      await settle();

      expect(browser.opened).toEqual([OPEN.url]);
      expect(browser.left).toEqual([]);
      expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: true, blocked: false, inPlace: false });
    });

    it("ลิงก์ที่ระบบไม่ได้สั่งให้เปิดเอง: ไม่พาแท็บนี้ไป ผู้ใช้เป็นคนแตะเอง", async () => {
      const { chat, browser, controller } = setup({ canLeave: true });

      controller.sendText("ค้นแล้วเปิดให้ด้วย");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: "นี่ครับ" });
      chat.current.options.onEvent({ ...OPEN, auto: false });
      chat.current.result.resolve("นี่ครับ");
      await settle();

      expect(browser.opened).toEqual([]);
      expect(browser.left).toEqual([]);
      expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: false, blocked: false, inPlace: false });
    });

    it("ผู้ใช้แตะลิงก์เปิดเองระหว่างรอ: ถือว่าเปิดในแท็บใหม่แล้ว ไม่ใช่ในแท็บนี้", async () => {
      const { chat, browser, controller } = setup({ canLeave: true });
      browser.succeeds = false;

      controller.sendText("เข้าเว็บไซต์ pantip");
      await settle();
      chat.current.options.onEvent({ type: "delta", text: SAID });
      chat.current.options.onEvent(OPEN);
      controller.markLinkOpened(controller.getState().messages.at(-1)?.id ?? "");
      chat.current.result.resolve(SAID);
      await settle();

      expect(controller.getState().messages.at(-1)?.link).toMatchObject({ opened: true, blocked: false, inPlace: false });
      // หน้านั้นเปิดในแท็บใหม่ไปแล้ว ถ้าพาแท็บนี้ไปอีกจะเปิดซ้ำสองที่
      expect(browser.left).toEqual([]);
    });
  });

  describe("กลับมาหลังออกจากหน้าไปยังเว็บอื่น", () => {
    const BEFORE: ConversationMessage[] = [
      { id: "message-7", role: "user", text: "เข้าเว็บไซต์ pantip" },
      {
        id: "message-8",
        role: "assistant",
        text: "ได้เลยครับ นี่คือหน้า Pantip ครับ",
        link: { title: "Pantip", url: "https://pantip.com/", opened: true, blocked: false, inPlace: true }
      }
    ];

    it("แสดงบทสนทนาเดิมต่อ และส่งเป็นประวัติให้คำถามถัดไป", async () => {
      const { chat, controller } = setup();
      controller.restore(BEFORE);

      expect(controller.getState()).toMatchObject({ phase: "idle", active: false });
      expect(controller.getState().messages.map(({ role, text, link }) => ({ role, text, link }))).toEqual(
        BEFORE.map(({ role, text, link }) => ({ role, text, link }))
      );

      controller.sendText("ขอบคุณ");
      await settle();
      expect(chat.current.messages).toEqual([
        { role: "user", content: "เข้าเว็บไซต์ pantip" },
        { role: "assistant", content: "ได้เลยครับ นี่คือหน้า Pantip ครับ" },
        { role: "user", content: "ขอบคุณ" }
      ]);
    });

    it("ข้อความใหม่ได้รหัสที่ไม่ซ้ำกับข้อความเดิม", async () => {
      const { chat, controller } = setup();
      controller.restore(BEFORE);

      controller.sendText("ขอบคุณ");
      await settle();
      chat.reply("ยินดีครับ");
      await settle();

      const ids = controller.getState().messages.map((message) => message.id);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
    });

    it("ไม่รับข้อความว่างที่ค้างมา", () => {
      const { controller } = setup();
      controller.restore([...BEFORE, { id: "message-9", role: "assistant", text: "  " }]);

      expect(controller.getState().messages).toHaveLength(2);
    });

    it("ไม่ทับบทสนทนาที่เริ่มไปแล้ว", async () => {
      const { chat, controller } = setup();

      controller.sendText("สวัสดี");
      await settle();
      chat.reply("สวัสดีครับ");
      await settle();
      controller.restore(BEFORE);

      expect(controller.getState().messages.map((message) => message.text)).toEqual(["สวัสดี", "สวัสดีครับ"]);
    });

    it("ไม่แทรกเข้ามาระหว่างที่กำลังฟังหรือรอคำตอบ", async () => {
      const { controller } = setup();

      void controller.start();
      await settle();
      controller.restore(BEFORE);

      expect(controller.getState()).toMatchObject({ phase: "listening", messages: [] });
    });

    it("ผู้ใช้ออกจากระบบ: บทสนทนาที่รับกลับมาถูกล้างเหมือนบทสนทนาอื่น", () => {
      const { controller } = setup();
      controller.restore(BEFORE);

      controller.reset();

      expect(controller.getState().messages).toEqual([]);
    });
  });

  it("สั่งจบการฟังเองได้เฉพาะตอนกำลังฟัง", async () => {
    const { recognizer, controller } = setup();

    controller.finishListening();
    expect(recognizer.stopCalls).toBe(0);

    void controller.start();
    await settle();
    controller.finishListening();
    expect(recognizer.stopCalls).toBe(1);
  });
});
