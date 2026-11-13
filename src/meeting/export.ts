/** บันทึกของการประชุมหนึ่งครั้ง สำหรับเขียนเป็นเอกสารให้ผู้ใช้เก็บ */
export interface MeetingDocument {
  /** คำสรุปจาก AI ถ้ายังไม่ได้สรุป เอกสารจะมีเฉพาะบันทึกคำพูด */
  summary?: string;
  /** คำพูดทั้งหมดที่จดได้ บรรทัดละช่วงคำพูด */
  transcript: string;
  /** ความยาวของการประชุมเป็นนาที */
  minutes: number;
  /** เวลาที่เริ่มประชุม (มิลลิวินาทีของนาฬิกาเครื่อง) */
  startedAt: number;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** ความยาวการประชุมเป็นคำอ่าน */
export function describeDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return "ไม่ถึง 1 นาที";

  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} นาที`;
  return rest === 0 ? `${hours} ชั่วโมง` : `${hours} ชั่วโมง ${rest} นาที`;
}

/** ข้อความของผู้ใช้ที่นำหน้าคำสรุปในบทสนทนา */
export function summaryRequestText(minutes: number): string {
  return `สรุปการประชุม (${describeDuration(minutes)})`;
}

/**
 * วันและเวลาเริ่มประชุมแบบไทย
 * @param timeZone เขตเวลาที่ใช้เขียน ค่าเริ่มต้นคือของเครื่อง แยกไว้เพื่อให้ทดสอบได้ผลเดียวกันทุกเครื่อง
 */
export function formatMeetingDate(startedAt: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeStyle: "short", timeZone }).format(new Date(startedAt));
}

/** ชื่อไฟล์ของเอกสาร จากวันและเวลาเริ่มประชุมตามเวลาของเครื่อง ใช้เฉพาะตัวอักษรที่ทุกระบบไฟล์รับได้ */
export function meetingFileName(startedAt: number): string {
  const date = new Date(startedAt);
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `javis-meeting-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.txt`;
}

/**
 * เอกสารข้อความธรรมดาของการประชุม: คำสรุป (ถ้ามี) ตามด้วยบันทึกคำพูดทั้งหมด
 * ขึ้นบรรทัดด้วย CRLF เพื่อให้โปรแกรมบน Windows ทุกรุ่นแสดงบรรทัดถูก
 */
export function buildMeetingDocument({ summary, transcript, minutes, startedAt }: MeetingDocument, timeZone?: string): string {
  const summarized = summary?.trim();
  const lines = [
    summarized ? "สรุปการประชุม" : "บันทึกการประชุม",
    `เริ่มประชุม: ${formatMeetingDate(startedAt, timeZone)} · ความยาว: ${describeDuration(minutes)}`,
    "จัดทำโดย Javis จากเสียงที่แปลงเป็นข้อความอัตโนมัติ อาจมีคำคลาดเคลื่อน ควรตรวจทานก่อนนำไปใช้",
    ""
  ];
  if (summarized) lines.push("คำสรุป", "------", summarized, "");
  lines.push("บันทึกคำพูด", "------", transcript.trim(), "");

  return lines.join("\n").replace(/\r?\n/g, "\r\n");
}
