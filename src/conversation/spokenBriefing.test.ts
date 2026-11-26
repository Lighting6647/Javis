import { describe, expect, it } from "vitest";
import type { MorningBriefingResponse } from "../services/workspaceApi";
import { buildSpokenBriefing, localDateKey, senderName, shouldAutoBrief } from "./spokenBriefing";

const MORNING = new Date(2026, 10, 22, 8, 30);

const data = (overrides: Partial<MorningBriefingResponse> = {}): MorningBriefingResponse => ({
  ok: true,
  generatedAt: MORNING.getTime(),
  google: { configured: true, accountEmail: "owner@example.com", services: { gmail: true, calendar: true, tasks: true } },
  emails: [
    { id: "m1", from: "พี่เอ <a@example.com>", subject: "งานด่วน", date: "", snippet: "เนื้อหาลับ", unread: true, important: true },
    { id: "m2", from: "\"Bank\" <bank@example.com>", subject: "ใบแจ้งยอด", date: "", snippet: "", unread: true, important: true }
  ],
  events: [
    { id: "e1", title: "ประชุมทีม", start: "2026-11-22T14:00:00+07:00", end: "2026-11-22T15:00:00+07:00" },
    { id: "e2", title: "พรุ่งนี้", start: "2026-11-23T09:00:00+07:00", end: "2026-11-23T10:00:00+07:00" }
  ],
  notes: [],
  weather: { temperature: 31, max: 34, min: 26, rainChance: 70, description: "ฝนตก" },
  spokenSummary: "",
  ...overrides
}) as MorningBriefingResponse;

describe("shouldAutoBrief", () => {
  it("สรุปครั้งแรกของวันก่อนเที่ยงเท่านั้น", () => {
    expect(shouldAutoBrief({ enabled: true, now: MORNING, lastDate: null })).toBe(true);
    expect(shouldAutoBrief({ enabled: true, now: MORNING, lastDate: localDateKey(MORNING) })).toBe(false);
    expect(shouldAutoBrief({ enabled: true, now: MORNING, lastDate: "2026-11-21" })).toBe(true);
    expect(shouldAutoBrief({ enabled: true, now: new Date(2026, 10, 22, 12, 0), lastDate: null })).toBe(false);
    expect(shouldAutoBrief({ enabled: false, now: MORNING, lastDate: null })).toBe(false);
  });
});

describe("buildSpokenBriefing", () => {
  it("บอกอากาศ นัดวันนี้ และเมลสำคัญเฉพาะผู้ส่งกับหัวเรื่อง", () => {
    const text = buildSpokenBriefing(data(), MORNING);
    expect(text).toContain("อรุณสวัสดิ์ค่ะ");
    expect(text).toContain("ฝนตก 31 องศา");
    expect(text).toContain("พกร่ม");
    expect(text).toContain("วันนี้มีนัด 1 อย่าง");
    expect(text).toContain("ประชุมทีม 14:00 น.");
    expect(text).not.toContain("พรุ่งนี้ 09");
    expect(text).toContain("มีเมลสำคัญ 2 ฉบับ พี่เอ เรื่อง งานด่วน กับ Bank เรื่อง ใบแจ้งยอด");
    expect(text).not.toContain("เนื้อหาลับ");
    expect(text).not.toContain("a@example.com");
  });

  it("ไม่มีอากาศ ไม่มีนัด ไม่มีเมล", () => {
    const text = buildSpokenBriefing(data({ weather: null, events: [], emails: [] }), MORNING);
    expect(text).not.toContain("อากาศ");
    expect(text).toContain("วันนี้ไม่มีนัดในปฏิทินค่ะ");
    expect(text).toContain("ไม่มีเมลสำคัญที่ยังไม่อ่านค่ะ");
  });

  it("ยังไม่ได้เชื่อม Google: บอกตรง ๆ", () => {
    const text = buildSpokenBriefing(
      data({ google: { configured: false, accountEmail: "owner@example.com", services: { gmail: false, calendar: false, tasks: false } } }),
      MORNING
    );
    expect(text).toContain("ยังไม่ได้เชื่อมต่อ Google");
  });

  it("ชื่อผู้ส่งแบบสั้น", () => {
    expect(senderName("พี่เอ <a@example.com>")).toBe("พี่เอ");
    expect(senderName("<a@example.com>")).toBe("a@example.com");
  });
});
