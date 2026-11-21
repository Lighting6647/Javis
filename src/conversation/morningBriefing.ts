import type { MorningBriefingResponse } from "../services/workspaceApi";

const BRIEFING_PATTERN =
  /^(?:(?:เดลลูน่า|เดลูนา|ลูน่า|delluna|จาวิส|javis|นีน่า|nina)\s*)?(?:ช่วย)?(?:สรุปเช้านี้|สรุปงานเช้านี้|เช็คงานเช้านี้|เช็กงานเช้านี้|มอร์นิ่ง\s*บรีฟ(?:ฟิ่ง|ฟิง)?|morning\s*briefing)(?:\s*(?:ให้หน่อย|หน่อย|ให้ฟังหน่อย|ด้วย|ค่ะ|ครับ|นะคะ|นะ))?$/i;

/** ตรวจว่าคำพูดเป็นคำสั่ง Morning Briefing อัตโนมัติหรือไม่ */
export function isMorningBriefingCommand(text: string): boolean {
  const clean = text.trim().replace(/[?.!,]/g, "");
  return BRIEFING_PATTERN.test(clean);
}

/** สร้างข้อความสำหรับส่งให้ AI สรุปอ่านออกเสียงใน 1 เทิร์นจากข้อมูล Morning Briefing */
export function buildMorningBriefingPrompt(data: MorningBriefingResponse): string {
  const emailLines =
    data.emails.length > 0
      ? data.emails.map((e) => `- ${e.subject} (จาก ${e.from}): ${e.snippet}`).join("\n")
      : data.google.configured
        ? "- ไม่มีอีเมลสำคัญหรือยังไม่อ่านใหม่"
        : `- ยังไม่ได้เชื่อมต่อ Google OAuth สำหรับ ${data.google.accountEmail}`;

  const eventLines =
    data.events.length > 0
      ? data.events.map((ev) => `- ${ev.title} (${ev.start})`).join("\n")
      : data.google.configured
        ? "- ไม่มีนัดหมายช่วงวันนี้และพรุ่งนี้"
        : "- ยังไม่ได้เชื่อมต่อ Google Calendar";

  const noteLines =
    data.notes.length > 0
      ? data.notes.map((n) => `- ${n.title}: ${n.content.slice(0, 120)}`).join("\n")
      : "- ยังไม่มีโน้ตค้างไว้";

  return [
    "ช่วยสรุป Morning Briefing เช้านี้ให้ฟังแบบสั้น กระชับ เป็นภาษาพูดธรรมชาติในรอบเดียวจากข้อมูลจริงด้านล่าง:",
    `อีเมลสำคัญ (${data.google.accountEmail}):\n${emailLines}`,
    `ตารางนัดหมาย:\n${eventLines}`,
    `โน้ตค้างไว้:\n${noteLines}`
  ].join("\n\n");
}
