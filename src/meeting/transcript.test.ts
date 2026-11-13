import { describe, expect, it } from "vitest";
import { isMeetingStartCommand } from "./commands";
import { formatClock, formatTranscript, meetingMinutes, transcriptLength } from "./transcript";

describe("formatClock", () => {
  it.each([
    [0, "00:00"],
    [5_400, "00:05"],
    [61_000, "01:01"],
    [59 * 60_000 + 59_000, "59:59"],
    [60 * 60_000, "1:00:00"],
    [2 * 3_600_000 + 5 * 60_000 + 9_000, "2:05:09"],
    [-50, "00:00"]
  ])("%i มิลลิวินาที = %s", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe("formatTranscript", () => {
  it("เขียนบรรทัดละช่วงคำพูด นำหน้าด้วยเวลาที่ผ่านไปตั้งแต่เริ่มประชุม", () => {
    const entries = [
      { at: 5_000, text: "วันนี้คุยเรื่องเปิดตัวสินค้าใหม่" },
      { at: 21_000, text: "สมชายรับไปทำใบเสนอราคา" }
    ];

    expect(formatTranscript(entries)).toBe("[00:05] วันนี้คุยเรื่องเปิดตัวสินค้าใหม่\n[00:21] สมชายรับไปทำใบเสนอราคา");
  });

  it("ยังไม่ได้จดอะไร: ข้อความว่าง", () => {
    expect(formatTranscript([])).toBe("");
  });

  it("ความยาวที่นับไว้ตรงกับข้อความที่เขียนออกมาจริง", () => {
    const entries = [
      { at: 0, text: "หนึ่ง" },
      { at: 75_000, text: "สอง สาม" },
      { at: 3_700_000, text: "สี่" }
    ];

    expect(transcriptLength(entries)).toBe(formatTranscript(entries).length);
    expect(transcriptLength([])).toBe(0);
  });
});

describe("meetingMinutes", () => {
  it.each([
    [0, 0],
    [29_000, 0],
    [31_000, 1],
    [42 * 60_000 + 10_000, 42],
    [-5, 0]
  ])("ยาว %i มิลลิวินาที = %i นาที", (ms, minutes) => {
    expect(meetingMinutes(1_000_000, 1_000_000 + ms)).toBe(minutes);
  });
});

describe("isMeetingStartCommand", () => {
  it.each([
    "เริ่มโหมดประชุม",
    "เริ่มโหมดสรุปการประชุม",
    "เปิดโหมดประชุมหน่อย",
    "เข้าโหมดสรุปการประชุมเลย",
    "เริ่มจดการประชุม",
    "เริ่มบันทึกการประชุมได้เลย",
    "ช่วยจดการประชุมหน่อย",
    "ช่วยจดประชุมให้หน่อยครับ",
    "  เริ่ม โหมด ประชุม  ",
    "จาวิสเริ่มโหมดประชุม"
  ])("%j: เป็นคำสั่งเริ่มจดการประชุม", (text) => {
    expect(isMeetingStartCommand(text)).toBe(true);
  });

  it.each([
    "สรุปการประชุมเมื่อวานให้หน่อย",
    "พรุ่งนี้มีประชุมกี่โมง",
    "ช่วยร่างวาระการประชุมให้หน่อย",
    "การประชุมเริ่มสิบโมง",
    "เปิดเว็บประชุมออนไลน์",
    "เริ่มเลย",
    ""
  ])("%j: ไม่ใช่คำสั่งเริ่มจดการประชุม จึงส่งไปถาม AI ตามปกติ", (text) => {
    expect(isMeetingStartCommand(text)).toBe(false);
  });
});
