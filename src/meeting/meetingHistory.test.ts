import { describe, expect, it } from "vitest";
import { meetingHistoryStore, searchMeetingHistory } from "./meetingHistory";

describe("meetingHistoryStore", () => {
  it("บันทึกประวัติสรุปการประชุม เรียงจากล่าสุด จำกัดสูงสุด 15 รายการ และลบ/ล้างได้", () => {
    meetingHistoryStore.clear();
    expect(meetingHistoryStore.get()).toEqual([]);

    const first = meetingHistoryStore.add({
      startedAt: 1_000,
      minutes: 12,
      summary: "สรุปครั้งที่ 1",
      transcript: "[00:05] ไลท์: สวัสดี"
    });
    expect(meetingHistoryStore.get()).toHaveLength(1);
    expect(meetingHistoryStore.get()[0]?.id).toBe(first.id);

    // บันทึกซ้ำด้วย startedAt เดิมต้องเขียนทับแทนการซ้ำซ้อน
    meetingHistoryStore.add({
      startedAt: 1_000,
      minutes: 15,
      summary: "สรุปครั้งที่ 1 (ปรับปรุง)",
      transcript: "[00:05] ไลท์: สวัสดี\n[00:20] คุณเอ: ครับ"
    });
    expect(meetingHistoryStore.get()).toHaveLength(1);
    expect(meetingHistoryStore.get()[0]?.minutes).toBe(15);

    // เพิ่มจนเกินเพดาน 15 รายการ ต้องเก็บเฉพาะ 15 รายการล่าสุด
    for (let i = 2; i <= 18; i += 1) {
      meetingHistoryStore.add({
        startedAt: i * 1_000,
        minutes: i,
        summary: `สรุปครั้งที่ ${i}`,
        transcript: `[00:01] ข้อความ ${i}`
      });
    }
    expect(meetingHistoryStore.get()).toHaveLength(15);
    expect(meetingHistoryStore.get()[0]?.startedAt).toBe(18_000);

    meetingHistoryStore.remove("mtg-18000");
    expect(meetingHistoryStore.get()).toHaveLength(14);

    meetingHistoryStore.clear();
    expect(meetingHistoryStore.get()).toEqual([]);
  });

  it("ค้นหาประวัติการประชุมตามคำสำคัญและชื่อผู้พูด พร้อมรองรับคำว่า ครั้งก่อน", () => {
    meetingHistoryStore.clear();
    meetingHistoryStore.add({
      startedAt: 10_000,
      minutes: 20,
      summary: "สรุป: คุณเอทำสไลด์นำเสนอ",
      transcript: "[00:05] คุณเอ: ผมทำสไลด์ให้พรุ่งนี้"
    });
    meetingHistoryStore.add({
      startedAt: 20_000,
      minutes: 15,
      summary: "สรุป: ไลท์ตรวจระบบบัญชี",
      transcript: "[00:10] ไลท์: ตรวจบัญชีประจำเดือนเรียบร้อย"
    });

    const foundBySpeaker = searchMeetingHistory("คุณเอ สไลด์");
    expect(foundBySpeaker).toHaveLength(1);
    expect(foundBySpeaker[0]?.startedAt).toBe(10_000);

    expect(searchMeetingHistory("ครั้งก่อน")).toHaveLength(2);
    expect(searchMeetingHistory("")).toHaveLength(2);
    meetingHistoryStore.clear();
  });
});
