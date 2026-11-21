import { describe, expect, it } from "vitest";
import { DEFAULT_WAKE_PHRASES, matchWakePhrase, normalizeWakeText, parseWakePhrases } from "./wakeWord";

describe("matchWakePhrase", () => {
  it("คำเรียกชื่อเริ่มต้นมีเฉพาะ ลูน่า (Luna) และตัวสะกดที่ระบบฟังถอดผิด ชื่อเดิม จาร์วิส ไม่ปลุกแล้ว", () => {
    expect(DEFAULT_WAKE_PHRASES).toEqual(["hey luna", "ลูน่า", "ลูนา", "luna", "รูน่า", "ลูหน่า", "หลูน่า", "ลูนาร์"]);
    expect(matchWakePhrase("จาร์วิส เปิดไฟ")).toBeNull();
    expect(matchWakePhrase("จาวิส เปิดไฟ")).toBeNull();
    expect(matchWakePhrase("hey jarvis open the news")).toBeNull();
  });

  it.each([
    ["ลูน่า เปิดไฟ", "เปิดไฟ"],
    ["ลูนา เปิดไฟ", "เปิดไฟ"],
    ["ลูน้า เปิดไฟ", "เปิดไฟ"],
    ["ลู่น่า เปิดไฟ", "เปิดไฟ"],
    ["ลู น่า เปิดไฟ", "เปิดไฟ"],
    ["รูน่า เปิดไฟ", "เปิดไฟ"],
    ["ลูหน่า เปิดไฟ", "เปิดไฟ"],
    ["หลูน่า เปิดไฟ", "เปิดไฟ"],
    ["ลูนาร์ เปิดไฟ", "เปิดไฟ"],
    ["ลูนาร์เปิดไฟ", "เปิดไฟ"],
    ["Luna เปิดไฟ", "เปิดไฟ"],
    ["lu na เปิดไฟ", "เปิดไฟ"],
    ["Hey Lu Na, turn on", "turn on"],
    ["ลู​น่า เปิดไฟ", "เปิดไฟ"]
  ])("ระบบฟังถอดชื่อต่างกัน (%s): ยังปลุกได้และได้คำสั่งครบ", (heard, command) => {
    expect(matchWakePhrase(heard)).toEqual({ command });
  });

  it.each(["ลูกหมา เปิดไฟ", "ลูกน้ำ", "หนูนา", "lunatic fringe", "plu na", "ตอนนี้กี่โมง", "ลุงนา"])(
    "คำอื่นที่คล้ายแต่ไม่ใช่ชื่อ (%s): ไม่ปลุก",
    (heard) => {
      expect(matchWakePhrase(heard)).toBeNull();
    }
  );

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
