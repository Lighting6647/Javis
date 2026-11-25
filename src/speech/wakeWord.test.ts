import { describe, expect, it } from "vitest";
import { DEFAULT_WAKE_PHRASES, matchWakePhrase, normalizeWakeText, parseWakePhrases } from "./wakeWord";

describe("matchWakePhrase", () => {
  it("คำเรียกชื่อเริ่มต้นมีเฉพาะ ลูน่า (Luna) ชื่อเดิม จาร์วิส ไม่ปลุกแล้ว", () => {
    expect(DEFAULT_WAKE_PHRASES).toEqual(["hey luna", "ลูน่า", "ลูนา", "luna"]);
    expect(matchWakePhrase("จาร์วิส เปิดไฟ")).toBeNull();
    expect(matchWakePhrase("จาวิส เปิดไฟ")).toBeNull();
    expect(matchWakePhrase("hey jarvis open the news")).toBeNull();
  });

  it("ไม่ได้เรียกชื่อ: คืน null", () => {
    expect(matchWakePhrase("ตอนนี้กี่โมงแล้ว")).toBeNull();
    expect(matchWakePhrase("")).toBeNull();
    expect(matchWakePhrase("   ")).toBeNull();
  });

  it("คำเรียกชื่อภาษาไทยพร้อมคำสั่ง: คืนคำสั่งที่ตามหลัง", () => {
    expect(matchWakePhrase("ลูน่า เปิดเว็บข่าว")).toEqual({ command: "เปิดเว็บข่าว" });
    expect(matchWakePhrase("ลูนาเปิดเพลง")).toEqual({ command: "เปิดเพลง" });
  });

  it("เรียกชื่ออย่างเดียว: คืนคำสั่งว่าง", () => {
    expect(matchWakePhrase("ลูน่า")).toEqual({ command: "" });
    expect(matchWakePhrase("Hey Luna!")).toEqual({ command: "" });
    expect(matchWakePhrase("luna")).toEqual({ command: "" });
  });

  it("Chrome ได้ยินชื่อเพี้ยน (ลูนน่า รูน่า ลูน้า): ยังนับว่าเรียกชื่อ", () => {
    expect(matchWakePhrase("ลูนน่า เปิดเพลง")).toEqual({ command: "เปิดเพลง" });
    expect(matchWakePhrase("รูน่า")).toEqual({ command: "" });
    expect(matchWakePhrase("ลูน้า กี่โมงแล้ว")).toEqual({ command: "กี่โมงแล้ว" });
    expect(matchWakePhrase("รูน่า เปิดไฟ", ["ฟรายเดย์"])).toBeNull();
  });

  it("เรียกชื่อไว้ท้ายประโยค: ทั้งประโยคเป็นคำสั่ง", () => {
    expect(matchWakePhrase("สวัสดีลูน่า")).toEqual({ command: "สวัสดีลูน่า" });
    expect(matchWakePhrase("เปิดเพลงหน่อย ลูน่า!")).toEqual({ command: "เปิดเพลงหน่อย ลูน่า" });
    expect(matchWakePhrase("... ลูน่า")).toEqual({ command: "" });
  });

  it("ตัดเครื่องหมายระหว่างคำเรียกชื่อกับคำสั่ง", () => {
    expect(matchWakePhrase("Luna, what time is it?")).toEqual({ command: "what time is it?" });
    expect(matchWakePhrase("ลูน่า... ช่วยหน่อย")).toEqual({ command: "ช่วยหน่อย" });
  });

  it("ไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างซ้ำ", () => {
    expect(matchWakePhrase("HEY   LUNA open the news")).toEqual({ command: "open the news" });
  });

  it("ทิ้งข้อความก่อนคำเรียกชื่อ", () => {
    expect(matchWakePhrase("เมื่อกี้พูดถึงอะไร ลูน่า สรุปให้หน่อย")).toEqual({ command: "สรุปให้หน่อย" });
  });

  it("เลือกคำที่ยาวกว่าเมื่อเริ่มที่ตำแหน่งเดียวกัน", () => {
    expect(matchWakePhrase("hey luna turn on", ["luna", "hey luna"])).toEqual({ command: "turn on" });
  });

  it("คำภาษาอังกฤษต้องเป็นคำเต็ม ไม่นับเมื่อติดกับตัวอักษรอื่น", () => {
    expect(matchWakePhrase("lunatic fringe")).toBeNull();
    expect(matchWakePhrase("selunar open")).toBeNull();
    expect(matchWakePhrase("lunatic met luna today")).toEqual({ command: "today" });
  });

  it("ใช้รายการคำเรียกชื่อที่กำหนดเอง", () => {
    expect(matchWakePhrase("ฟรายเดย์ เปิดไฟ", ["ฟรายเดย์"])).toEqual({ command: "เปิดไฟ" });
    expect(matchWakePhrase("ลูน่า เปิดไฟ", ["ฟรายเดย์"])).toBeNull();
  });

  it("รายการว่างหรือมีแต่ช่องว่าง: ไม่มีคำใดตรง", () => {
    expect(matchWakePhrase("ลูน่า เปิดไฟ", [])).toBeNull();
    expect(matchWakePhrase("ลูน่า เปิดไฟ", ["  "])).toBeNull();
  });
});

describe("parseWakePhrases", () => {
  it("ค่าว่างได้ค่าเริ่มต้น", () => {
    expect(parseWakePhrases(undefined)).toBe(DEFAULT_WAKE_PHRASES);
    expect(parseWakePhrases(" , ,")).toBe(DEFAULT_WAKE_PHRASES);
  });

  it("แยกด้วยจุลภาค ตัดช่องว่าง ทำเป็นตัวพิมพ์เล็ก และตัดคำซ้ำ", () => {
    expect(parseWakePhrases(" Friday , ฟรายเดย์,friday ")).toEqual(["friday", "ฟรายเดย์"]);
  });
});

describe("normalizeWakeText", () => {
  it("ยุบช่องว่างและเป็นตัวพิมพ์เล็ก", () => {
    expect(normalizeWakeText("  Hey\tLUNA  ")).toBe("hey luna");
  });
});
