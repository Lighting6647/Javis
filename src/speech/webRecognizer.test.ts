import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STABLE_TRANSCRIPT_MS, WebSpeechRecognizer } from "./webRecognizer";

type Result = { 0: { transcript: string }; length: 1; isFinal?: boolean };

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: { results: Result[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    FakeRecognition.last = this;
  }
  start(): void {}
  emit(text: string, isFinal = false): void {
    this.onresult?.({ results: [{ 0: { transcript: text }, length: 1, isFinal }] });
  }
}

describe("WebSpeechRecognizer.listen: ตัดจบเร็ว", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { SpeechRecognition: FakeRecognition });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ได้ผลสุดท้าย (isFinal) แล้วส่งข้อความทันที ไม่รอเบราว์เซอร์จบการฟัง", async () => {
    const recognizer = new WebSpeechRecognizer();
    const heard = recognizer.listen(() => undefined);
    const recognition = FakeRecognition.last as FakeRecognition;
    recognition.emit("สวัสดีลูน่า", true);
    await expect(heard).resolves.toBe("สวัสดีลูน่า");
    expect(recognition.abort).toHaveBeenCalled();
  });

  it("ข้อความนิ่งไม่เปลี่ยนครบเวลาที่กำหนด สั่งหยุดฟังเพื่อสรุปผล", () => {
    const recognizer = new WebSpeechRecognizer();
    void recognizer.listen(() => undefined);
    const recognition = FakeRecognition.last as FakeRecognition;
    recognition.emit("ช่วย");
    vi.advanceTimersByTime(STABLE_TRANSCRIPT_MS - 100);
    recognition.emit("ช่วยเปิดเพลง");
    vi.advanceTimersByTime(STABLE_TRANSCRIPT_MS - 100);
    expect(recognition.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(recognition.stop).toHaveBeenCalledTimes(1);
  });

  it("ยังไม่มีคำพูด ไม่สั่งหยุดเอง", () => {
    const recognizer = new WebSpeechRecognizer();
    void recognizer.listen(() => undefined);
    const recognition = FakeRecognition.last as FakeRecognition;
    recognition.emit("");
    vi.advanceTimersByTime(STABLE_TRANSCRIPT_MS * 3);
    expect(recognition.stop).not.toHaveBeenCalled();
  });

  it("จบการฟังตามปกติยังส่งข้อความล่าสุด", async () => {
    const recognizer = new WebSpeechRecognizer();
    const heard = recognizer.listen(() => undefined);
    const recognition = FakeRecognition.last as FakeRecognition;
    recognition.emit("เปิดไฟ");
    recognition.onend?.();
    await expect(heard).resolves.toBe("เปิดไฟ");
  });
});
