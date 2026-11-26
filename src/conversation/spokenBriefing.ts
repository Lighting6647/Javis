import type { MorningBriefingResponse } from "../services/workspaceApi";

/** สรุปเช้าอัตโนมัติพูดเฉพาะช่วงเช้า (ก่อนเที่ยงตามเวลาเครื่อง) */
export const AUTO_BRIEFING_BEFORE_HOUR = 12;

/** วันที่ตามเวลาเครื่อง YYYY-MM-DD ใช้จำว่าวันนี้สรุปไปแล้ว */
export function localDateKey(now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ควรพูดสรุปเช้าอัตโนมัติตอนนี้ไหม: เปิดไว้ ยังไม่เคยสรุปวันนี้ และยังไม่เที่ยง */
export function shouldAutoBrief(options: { enabled: boolean; now: Date; lastDate: string | null }): boolean {
  return options.enabled && options.now.getHours() < AUTO_BRIEFING_BEFORE_HOUR && options.lastDate !== localDateKey(options.now);
}

/** ชื่อผู้ส่งจากหัว From แบบสั้น: "พี่เอ <a@x.com>" ได้ "พี่เอ" */
export function senderName(from: string): string {
  const name = from.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  return name || from.replace(/[<>]/g, "").trim();
}

/** เวลาเริ่มนัดเป็น "14:00 น." ตามเวลาไทย หรือ "ทั้งวัน" */
function eventTime(start: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return "ทั้งวัน";
  const time = Date.parse(start);
  if (!Number.isFinite(time)) return "";
  return `${new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(time)} น.`;
}

/** นัดของวันนี้ (ตามเวลาไทย) จากรายการวันนี้และพรุ่งนี้ */
function todaysEvents(data: MorningBriefingResponse, now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
  return data.events.filter((event) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(event.start)) return event.start === today;
    const time = Date.parse(event.start);
    return Number.isFinite(time) && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(time) === today;
  });
}

/**
 * ข้อความสรุปเช้าที่แอปเรียบเรียงเอง (ไม่ใช้ AI จึงไม่เสียโควตาและใช้ได้แม้ยังไม่มีกุญแจ)
 * บอกเฉพาะผู้ส่งและหัวเรื่องของอีเมล ไม่อ่านเนื้อหาออกเสียง
 */
export function buildSpokenBriefing(data: MorningBriefingResponse, now: Date): string {
  const parts = ["อรุณสวัสดิ์ค่ะคุณไลท์"];

  if (data.weather) {
    const { description, temperature, max, min, rainChance } = data.weather;
    parts.push(
      `อากาศตอนนี้${description} ${temperature} องศา วันนี้ ${min} ถึง ${max} องศา` + (rainChance >= 40 ? ` มีโอกาสฝนตก ${rainChance} เปอร์เซ็นต์ พกร่มด้วยนะคะ` : "")
    );
  }

  if (!data.google.configured) {
    parts.push("ยังไม่ได้เชื่อมต่อ Google ลูน่าเลยยังเช็คนัดกับเมลให้ไม่ได้ค่ะ");
    return parts.join(" ");
  }

  const events = todaysEvents(data, now);
  if (events.length === 0) {
    parts.push("วันนี้ไม่มีนัดในปฏิทินค่ะ");
  } else {
    const listed = events.slice(0, 3).map((event) => `${event.title} ${eventTime(event.start)}`.trim());
    parts.push(`วันนี้มีนัด ${events.length} อย่างค่ะ ${listed.join(" แล้วก็ ")}${events.length > 3 ? " และอื่น ๆ" : ""}`);
  }

  const emails = data.emails;
  if (emails.length === 0) {
    parts.push("ไม่มีเมลสำคัญที่ยังไม่อ่านค่ะ");
  } else {
    const top = emails.slice(0, 3).map((email) => `${senderName(email.from)} เรื่อง ${email.subject}`);
    parts.push(`มีเมลสำคัญ ${emails.length} ฉบับ ${top.join(" กับ ")}`);
  }

  parts.push("วันนี้สู้ ๆ นะคะ");
  return parts.join(" ");
}
