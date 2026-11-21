import { describe, expect, it } from "vitest";
import { findDueCalendarReminders } from "./calendarReminder";

describe("findDueCalendarReminders", () => {
  const now = Date.parse("2026-11-21T13:50:00+07:00");

  it("triggers reminder for events starting within 10 minutes and skips already reminded or far events", () => {
    const events = [
      {
        id: "ev-soon",
        title: "ประชุมทีม AI",
        start: "2026-11-21T14:00:00+07:00",
        end: "2026-11-21T15:00:00+07:00",
        location: "Google Meet"
      },
      {
        id: "ev-reminded",
        title: "นัดที่แจ้งไปแล้ว",
        start: "2026-11-21T13:55:00+07:00",
        end: "2026-11-21T14:30:00+07:00"
      },
      {
        id: "ev-later",
        title: "นัดเย็น",
        start: "2026-11-21T17:00:00+07:00",
        end: "2026-11-21T18:00:00+07:00"
      }
    ];

    const dueLuna = findDueCalendarReminders(events, now, new Set(["ev-reminded"]), "delluna");
    expect(dueLuna).toHaveLength(1);
    expect(dueLuna[0]?.eventId).toBe("ev-soon");
    expect(dueLuna[0]?.minutesUntil).toBe(10);
    expect(dueLuna[0]?.spokenText).toContain("แจ้งเตือนนัดหมายค่ะ");
    expect(dueLuna[0]?.spokenText).toContain("ประชุมทีม AI");

    const dueJavis = findDueCalendarReminders(events, now, new Set(["ev-reminded"]), "javis");
    expect(dueJavis[0]?.spokenText).toContain("แจ้งเตือนนัดหมายค่ะ");
  });
});
