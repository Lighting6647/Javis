import { describe, expect, it } from "vitest";
import { micLevelStore, readMicLevelChoice } from "./micLevelStore";

describe("readMicLevelChoice", () => {
  it("ผู้ใช้ปิดไว้: ปิด", () => {
    expect(readMicLevelChoice("off")).toBe(false);
  });

  it.each(["on", null, undefined, "", "OFF", 0, false, {}])("ค่าอื่นหรือยังไม่เคยเลือก (%j): เปิด ซึ่งเป็นค่าเริ่มต้น", (value) => {
    expect(readMicLevelChoice(value)).toBe(true);
  });
});

describe("micLevelStore", () => {
  it("เปิดเป็นค่าเริ่มต้น เปลี่ยนแล้วแจ้งผู้ติดตาม และเลิกแจ้งเมื่อเลิกติดตาม", () => {
    expect(micLevelStore.get()).toBe(true);

    let notified = 0;
    const unsubscribe = micLevelStore.subscribe(() => {
      notified += 1;
    });

    micLevelStore.set(false);
    expect(micLevelStore.get()).toBe(false);
    micLevelStore.set(true);
    expect(micLevelStore.get()).toBe(true);
    expect(notified).toBe(2);

    unsubscribe();
    micLevelStore.set(false);
    expect(notified).toBe(2);
    micLevelStore.set(true);
  });

  it("เก็บลงเครื่องไม่ได้ (การทดสอบนี้ไม่มีที่เก็บของเบราว์เซอร์): ค่ายังมีผลและไม่ล้ม", () => {
    expect(() => micLevelStore.set(false)).not.toThrow();
    expect(micLevelStore.get()).toBe(false);
    micLevelStore.set(true);
  });
});
