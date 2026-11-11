import { describe, expect, it } from "vitest";
import { interpretFillDecision } from "./fillDecision";

describe("interpretFillDecision", () => {
  it.each(["ยืนยัน", "ยืนยันครับ", "ยืนยันเลยค่ะ", " ตกลง ", "กรอกเลย", "กรอกได้เลยครับ", "โอเคครับ", "OK", "ยืนยัน."])(
    "ถือว่ายืนยัน: %s",
    (text) => {
      expect(interpretFillDecision(text)).toBe("confirm");
    }
  );

  it.each(["ยกเลิก", "ยกเลิกครับ", "ยกเลิกก่อนนะ", "ไม่ต้องกรอกเลย", "ไม่กรอกแล้วครับ", "ไม่เอา", "cancel"])(
    "ถือว่ายกเลิก: %s",
    (text) => {
      expect(interpretFillDecision(text)).toBe("cancel");
    }
  );

  it.each([
    "ยืนยันการจองโรงแรมให้หน่อย",
    "ตกลงว่าพรุ่งนี้ฝนตกไหม",
    "ยกเลิกนัดหมอพรุ่งนี้ให้ที",
    "ช่วยกรอกชื่อ สมชาย ให้หน่อย",
    "ไม่แน่ใจว่าถูกไหม",
    "",
    "   "
  ])("ไม่ตีความประโยคอื่นเป็นการตัดสินใจ: %s", (text) => {
    expect(interpretFillDecision(text)).toBeNull();
  });
});
