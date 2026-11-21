import { describe, expect, it } from "vitest";
import { DEFAULT_WAKE_PHRASES, matchWakePhrase, normalizeWakeText, parseWakePhrases } from "./wakeWord";

describe("matchWakePhrase", () => {
  it("ชื่อใหม่ ลูน่า (Luna): เรียกได้ทั้งภาษาไทยและอังกฤษ และชื่อเดิมยังใช้ได้", () => {
    expect(matchWakePhrase("ลูน่า เปิดเว็บข่าว")).toEqual({ command: "เปิดเว็บข่าว" });
    expect(matchWakePhrase("ลูนาเปิดเพลง")).toEqual({ command: "เปิดเพลง" });
    expect(matchWakePhrase("Hey Luna, what time is it")).toEqual({ command: "what time is it" });
    expect(matchWakePhrase("luna")).toEqual({ command: "" });
    expect(matchWakePhrase("lunatic fringe")).toBeNull();
    expect(matchWakePhrase("จาร์วิส เปิดไฟ")).toEqual({ command: "เปิดไฟ" });
  });

  it("ไม่ได้เรียกชื่อ: คืน null", () => {
    expect(matchWakePhrase("ตอนนี้กี่โมงแล้ว")).toBeNull();
    expect(matchWakePhrase("")).toBeNull();
    expect(matchWakePhrase("   ")).toBeNull();
  });

  it("คำเรียกชื่อภาษาไทยพร้อมคำสั่ง: คืนคำสั่งที่ตามหลัง", () => {
    expect(matchWakePhrase("จาร์วิส เปิดเว็บข่าว")).toEqual({ command: "เปิดเว็บข่าว" });
    expect(matchWakePhrase("จาวิสเปิดเพลง")).toEqual({ command: "เปิดเพลง" });
  });

  it("เรียกชื่ออย่างเดียว: คืนคำสั่งว่าง", () => {
    expect(matchWakePhrase("จาร์วิส")).toEqual({ command: "" });
    expect(matchWakePhrase("Hey Jarvis!")).toEqual({ command: "" });
  });

  it("ตัดเครื่องหมายระหว่างคำเรียกชื่อกับคำสั่ง", () => {
    expect(matchWakePhrase("Jarvis, what time is it?")).toEqual({ command: "what time is it?" });
    expect(matchWakePhrase("จาร์วิส... ช่วยหน่อย")).toEqual({ command: "ช่วยหน่อย" });
  });

  it("ไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างซ้ำ", () => {
    expect(matchWakePhrase("HEY   JARVIS open the news")).toEqual({ command: "open the news" });
  });

  it("ทิ้งข้อความก่อนคำเรียกชื่อ", () => {
    expect(matchWakePhrase("เมื่อกี้พูดถึงอะไร จาร์วิส สรุปให้หน่อย")).toEqual({ command: "สรุปให้หน่อย" });
  });

  it("เลือกคำที่ยาวกว่าเมื่อเริ่มที่ตำแหน่งเดียวกัน", () => {
    expect(matchWakePhrase("hey jarvis turn on", ["jarvis", "hey jarvis"])).toEqual({ command: "turn on" });
  });

  it("คำภาษาอังกฤษต้องเป็นคำเต็ม ไม่นับเมื่อติดกับตัวอักษรอื่น", () => {
    expect(matchWakePhrase("jarvisson is here")).toBeNull();
    expect(matchWakePhrase("myjarvis open")).toBeNull();
    expect(matchWakePhrase("jarvisson met jarvis today")).toEqual({ command: "today" });
  });

  it("ใช้รายการคำเรียกชื่อที่กำหนดเอง", () => {
    expect(matchWakePhrase("ฟรายเดย์ เปิดไฟ", ["ฟรายเดย์"])).toEqual({ command: "เปิดไฟ" });
    expect(matchWakePhrase("จาร์วิส เปิดไฟ", ["ฟรายเดย์"])).toBeNull();
  });

  it("รายการว่างหรือมีแต่ช่องว่าง: ไม่มีคำใดตรง", () => {
    expect(matchWakePhrase("จาร์วิส เปิดไฟ", [])).toBeNull();
    expect(matchWakePhrase("จาร์วิส เปิดไฟ", ["  "])).toBeNull();
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
    expect(normalizeWakeText("  Hey\tJARVIS  ")).toBe("hey jarvis");
  });
});
