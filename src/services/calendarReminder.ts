import type { AssistantIdentity } from "../conversation/types";
import type { WorkspaceCalendarEvent } from "./workspaceApi";

export const REMINDER_LEAD_MINUTES = 10;
const PAST_GRACE_MS = 60_000;

export interface DueCalendarReminder {
  eventId: string;
  title: string;
  minutesUntil: number;
  spokenText: string;
}

/**
 * ค้นหานัดหมายที่กำลังจะเริ่มภายใน leadMinutes นาทีข้างหน้า (ค่าเริ่มต้น 10 นาที)
 * โดยไม่แจ้งเตือนซ้ำสำหรับ eventId ที่เคยแจ้งไปแล้ว
 */
export function findDueCalendarReminders(
  events: readonly WorkspaceCalendarEvent[],
  nowMs: number,
  remindedIds: ReadonlySet<string>,
  identity: AssistantIdentity = "delluna",
  leadMinutes = REMINDER_LEAD_MINUTES
): DueCalendarReminder[] {
  const windowMs = leadMinutes * 60_000;
  const due: DueCalendarReminder[] = [];

  for (const event of events) {
    if (!event.id || remindedIds.has(event.id) || !event.start || !event.start.includes("T")) continue;
    const startMs = Date.parse(event.start);
    if (Number.isNaN(startMs)) continue;

    const diffMs = startMs - nowMs;
    if (diffMs > windowMs || diffMs < -PAST_GRACE_MS) continue;

    const minutesUntil = Math.max(0, Math.round(diffMs / 60_000));
    const timing = minutesUntil <= 1 ? "กำลังจะเริ่มในอีกไม่กี่นาทีนี้" : `อีก ${minutesUntil} นาทีจะมีนัด`;
    const locationPart = event.location ? ` ที่ ${event.location}` : "";
    const spokenText =
      identity === "javis"
        ? `แจ้งเตือนนัดหมายค่ะ ${timing} ${event.title}${locationPart} ค่ะ`
        : `แจ้งเตือนนัดหมายค่ะ ${timing} ${event.title}${locationPart} นะคะ`;

    due.push({
      eventId: event.id,
      title: event.title,
      minutesUntil,
      spokenText
    });
  }

  return due;
}
