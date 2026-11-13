import { describe, expect, it } from "vitest";
import { createSpeechBlock } from "./speechBlock";

describe("createSpeechBlock", () => {
  it("เริ่มต้น: ถือว่าพูดได้", () => {
    expect(createSpeechBlock().isBlocked()).toBe(false);
  });

  it("เบราว์เซอร์ปฏิเสธการสั่งพูดเพราะผู้ใช้ยังไม่ได้แตะหน้า: ถูกบล็อก และแจ้งผู้ติดตามครั้งเดียว", () => {
    const block = createSpeechBlock();
    let notified = 0;
    block.subscribe(() => {
      notified += 1;
    });

    block.failed("not-allowed");
    block.failed("not-allowed");

    expect(block.isBlocked()).toBe(true);
    expect(notified).toBe(1);
  });

  it.each(["interrupted", "canceled", "synthesis-failed", "network", ""])("ข้อผิดพลาดอื่น (%j): ไม่ถือว่าถูกบล็อก", (error) => {
    const block = createSpeechBlock();

    block.failed(error);

    expect(block.isBlocked()).toBe(false);
  });

  it("เสียงเริ่มออกได้: เลิกถูกบล็อก และแจ้งผู้ติดตาม", () => {
    const block = createSpeechBlock();
    block.failed("not-allowed");
    let notified = 0;
    block.subscribe(() => {
      notified += 1;
    });

    block.started();
    block.started();

    expect(block.isBlocked()).toBe(false);
    expect(notified).toBe(1);
  });

  it("ข้อผิดพลาดอื่นระหว่างที่ถูกบล็อกอยู่: ยังถูกบล็อก", () => {
    const block = createSpeechBlock();
    block.failed("not-allowed");

    block.failed("interrupted");

    expect(block.isBlocked()).toBe(true);
  });

  it("เลิกติดตามแล้วไม่ถูกแจ้งอีก", () => {
    const block = createSpeechBlock();
    let notified = 0;
    const unsubscribe = block.subscribe(() => {
      notified += 1;
    });

    unsubscribe();
    block.failed("not-allowed");

    expect(notified).toBe(0);
  });
});
