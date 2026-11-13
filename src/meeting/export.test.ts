import { describe, expect, it } from "vitest";
import { buildMeetingDocument, describeDuration, formatMeetingDate, meetingFileName, summaryRequestText } from "./export";

/** 13 พฤศจิกายน 2569 เวลา 14:30 ตามเวลาประเทศไทย */
const STARTED_AT = Date.UTC(2026, 10, 13, 7, 30);
const BANGKOK = "Asia/Bangkok";

describe("describeDuration", () => {
  it.each([
    [0, "ไม่ถึง 1 นาที"],
    [1, "1 นาที"],
    [45, "45 นาที"],
    [60, "1 ชั่วโมง"],
    [125, "2 ชั่วโมง 5 นาที"]
  ])("%i นาที เขียนว่า %s", (minutes, text) => {
    expect(describeDuration(minutes)).toBe(text);
  });
});

describe("summaryRequestText", () => {
  it("เป็นข้อความของผู้ใช้ที่นำหน้าคำสรุปในบทสนทนา พร้อมความยาวการประชุม", () => {
    expect(summaryRequestText(45)).toBe("สรุปการประชุม (45 นาที)");
    expect(summaryRequestText(0)).toBe("สรุปการประชุม (ไม่ถึง 1 นาที)");
  });
});

describe("formatMeetingDate", () => {
  it("เขียนวันและเวลาเริ่มประชุมแบบไทย ปีพุทธศักราช", () => {
    const text = formatMeetingDate(STARTED_AT, BANGKOK);

    expect(text).toContain("13 พฤศจิกายน 2569");
    expect(text).toContain("14:30");
  });
});

describe("meetingFileName", () => {
  it("ตั้งชื่อไฟล์จากวันและเวลาเริ่มประชุมตามเวลาของเครื่อง ใช้ตัวอักษรที่ทุกระบบรับได้", () => {
    expect(meetingFileName(new Date(2026, 10, 13, 14, 5).getTime())).toBe("javis-meeting-20261113-1405.txt");
    expect(meetingFileName(new Date(2027, 0, 2, 9, 0).getTime())).toBe("javis-meeting-20270102-0900.txt");
  });
});

describe("buildMeetingDocument", () => {
  const record = { transcript: "[00:05] วันนี้คุยเรื่องเปิดตัวสินค้าใหม่\n[00:21] สมชายรับไปทำใบเสนอราคา", minutes: 45, startedAt: STARTED_AT };

  it("รวมคำสรุปกับบันทึกคำพูดเป็นเอกสารเดียว พร้อมวันเวลา ความยาว และคำเตือนให้ตรวจทาน", () => {
    const text = buildMeetingDocument({ ...record, summary: "ภาพรวม: คุยเรื่องเปิดตัวสินค้า\nงานที่ต้องทำ:\n- สมชายทำใบเสนอราคา" }, BANGKOK);
    const lines = text.split("\r\n");

    expect(lines[0]).toBe("สรุปการประชุม");
    expect(text).toContain("13 พฤศจิกายน 2569");
    expect(text).toContain("45 นาที");
    expect(text).toContain("ควรตรวจทาน");
    expect(lines).toContain("- สมชายทำใบเสนอราคา");
    expect(lines).toContain("[00:21] สมชายรับไปทำใบเสนอราคา");
    expect(lines.indexOf("คำสรุป")).toBeLessThan(lines.indexOf("บันทึกคำพูด"));
  });

  it("ยังไม่มีคำสรุป (เช่น AI ใช้ไม่ได้): เป็นเอกสารบันทึกคำพูดอย่างเดียว", () => {
    const text = buildMeetingDocument(record, BANGKOK);
    const lines = text.split("\r\n");

    expect(lines[0]).toBe("บันทึกการประชุม");
    expect(lines).not.toContain("คำสรุป");
    expect(lines).toContain("[00:05] วันนี้คุยเรื่องเปิดตัวสินค้าใหม่");
  });

  it("ขึ้นบรรทัดแบบที่โปรแกรมบน Windows ทุกรุ่นแสดงถูก", () => {
    const text = buildMeetingDocument({ ...record, summary: "บรรทัดหนึ่ง\r\nบรรทัดสอง\nบรรทัดสาม" }, BANGKOK);

    expect(text).not.toMatch(/[^\r]\n/);
    expect(text).not.toContain("\r\r");
  });
});
