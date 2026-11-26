/**
 * เลือกนัดที่ผู้ใช้หมายถึงเมื่อสั่งเลื่อนหรือยกเลิกนัด และอธิบายเวลาเป็นภาษาไทยในการ์ด/คำพูด
 * แยกไว้เพื่อทดสอบได้โดยไม่ต้องเรียก Google Calendar
 */
import type { CalendarEventSummary } from "./googleWorkspace.js";

export type EventPick =
  | { kind: "none" }
  | { kind: "one"; event: CalendarEventSummary }
  | { kind: "many"; events: CalendarEventSummary[] };

const normalize = (text: string) => text.normalize("NFC").toLowerCase().replace(/\s+/g, "");

/**
 * หานัดจากคำในชื่อนัด (ไม่สนช่องว่างและตัวพิมพ์) และวันที่ถ้าผู้ใช้บอก
 * ตรงหลายอันคืน many เพื่อให้ถามผู้ใช้ก่อน ไม่เดาเอง
 * @param date YYYY-MM-DD ตามเวลาไทย
 */
export function pickCalendarEvent(events: readonly CalendarEventSummary[], query: string, date?: string): EventPick {
  const needle = normalize(query);
  if (!needle) return { kind: "none" };
  let matches = events.filter((event) => event.id && normalize(event.title).includes(needle));
  if (date) matches = matches.filter((event) => thaiDateOf(event.start) === date);
  if (matches.length === 0) return { kind: "none" };
  return matches.length === 1 ? { kind: "one", event: matches[0]! } : { kind: "many", events: matches };
}

/** วันที่ตามเวลาไทย (YYYY-MM-DD) ของเวลาเริ่มนัด รองรับนัดทั้งวันที่มีแต่วันที่ */
export function thaiDateOf(start: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const time = Date.parse(start);
  if (!Number.isFinite(time)) return "";
  return new Date(time + 7 * 60 * 60_000).toISOString().slice(0, 10);
}

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** เวลาเริ่มนัดเป็นภาษาไทยสั้น ๆ เช่น "22 พ.ย. 14:00 น." หรือ "22 พ.ย. (ทั้งวัน)" */
export function describeEventTime(start: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const [, month, day] = start.split("-").map(Number) as [number, number, number];
    return `${day} ${THAI_MONTHS_SHORT[month - 1] ?? ""} (ทั้งวัน)`;
  }
  const time = Date.parse(start);
  if (!Number.isFinite(time)) return "";
  const local = new Date(time + 7 * 60 * 60_000);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  return `${local.getUTCDate()} ${THAI_MONTHS_SHORT[local.getUTCMonth()]} ${hh}:${mm} น.`;
}
