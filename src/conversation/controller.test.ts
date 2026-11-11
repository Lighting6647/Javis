import { describe, expect, it } from "vitest";
import { SpeechError, type SpeechRecognizer, type SpeechSynthesizer } from "../speech/types";
import { ConversationController, HISTORY_LIMIT } from "./controller";
import { NOTICE_TEXT, SPEECH_ERROR_TEXT } from "./messages";
import { ChatError, type ChatStreamOptions, type ChatTurn, type StreamChat } from "./types";

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
    deltas.forEach((delta) => this.current.options.onDelta(delta));
    this.current.result.resolve(deltas.join(""));
  }
}

function setup() {
  const recognizer = new FakeRecognizer();
  const synthesizer = new FakeSynthesizer();
  const chat = new FakeChat();
  const controller = new ConversationController({ recognizer, synthesizer, chat: chat.stream });
  return { recognizer, synthesizer, chat, controller };
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
    firstCall.options.onDelta("กาลครั้งหนึ่งนานมาแล้ว\n");
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
    firstCall.options.onDelta("มีกระต่ายตัวหนึ่ง");
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
    pending.options.onDelta("คำตอบบางส่วน");

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
      onDeviceListening: false
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
