import { describe, expect, it } from "vitest";
import { buildMorningBriefingPrompt, isMorningBriefingCommand } from "./morningBriefing";

describe("morningBriefing", () => {
  it("matches Thai and English morning briefing voice commands", () => {
    expect(isMorningBriefingCommand("เดลลูน่า สรุปเช้านี้")).toBe(true);
    expect(isMorningBriefingCommand("สรุปเช้านี้ให้หน่อย")).toBe(true);
    expect(isMorningBriefingCommand("มอร์นิ่งบรีฟฟิ่ง")).toBe(true);
    expect(isMorningBriefingCommand("morning briefing")).toBe(true);
    expect(isMorningBriefingCommand("วันนี้อากาศเป็นยังไง")).toBe(false);
  });

  it("formats emails, calendar events, and notes into one briefing prompt", () => {
    const prompt = buildMorningBriefingPrompt({
      ok: true,
      generatedAt: Date.now(),
      google: { configured: true, accountEmail: "Lighting6647@gmail.com", services: { gmail: true, calendar: true, tasks: true } },
      emails: [{ id: "1", from: "boss@ex.com", subject: "ด่วน", date: "", snippet: "ประชุม 10 โมง", unread: true, important: true }],
      events: [{ id: "e1", title: "Standup", start: "2026-11-21T10:00:00+07:00", end: "2026-11-21T10:30:00+07:00" }],
      notes: [{ id: "n1", title: "เช็คเซิร์ฟเวอร์", content: "ตรวจโควตา API", tags: [], createdAt: 1, updatedAt: 1 }],
      spokenSummary: ""
    });

    expect(prompt).toContain("Lighting6647@gmail.com");
    expect(prompt).toContain("ด่วน");
    expect(prompt).toContain("Standup");
    expect(prompt).toContain("เช็คเซิร์ฟเวอร์");
  });
});
