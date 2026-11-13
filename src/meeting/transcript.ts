/**
 * ความยาวสูงสุดของบันทึกการประชุมเมื่อเขียนเป็นข้อความ (ตัวอักษร) พอสำหรับการประชุมราวสองชั่วโมง
 * ต้องตรงกับเพดานที่เซิร์ฟเวอร์รับ (server/meeting.ts)
 */
export const MAX_TRANSCRIPT_LENGTH = 80_000;

/** หนึ่งช่วงคำพูดที่จดได้ระหว่างการประชุม */
export interface MeetingEntry {
  /** เวลาที่ผ่านไปตั้งแต่เริ่มประชุมจนจดช่วงนี้ได้ (มิลลิวินาที) */
  at: number;
  text: string;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** เวลาที่ผ่านไปตั้งแต่เริ่มประชุม เขียนเป็น นาที:วินาที หรือ ชั่วโมง:นาที:วินาที เมื่อเกินหนึ่งชั่วโมง */
export function formatClock(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

const formatEntry = (entry: MeetingEntry): string => `[${formatClock(entry.at)}] ${entry.text}`;

/** บันทึกการประชุมเป็นข้อความ บรรทัดละช่วงคำพูด เป็นรูปแบบที่ส่งให้ AI สรุป และที่ผู้ใช้คัดลอกหรือดาวน์โหลด */
export function formatTranscript(entries: readonly MeetingEntry[]): string {
  return entries.map(formatEntry).join("\n");
}

/** ความยาวของบันทึกเมื่อเขียนเป็นข้อความ โดยไม่ต้องประกอบข้อความทั้งก้อน ใช้เทียบกับเพดานทุกครั้งที่จดเพิ่ม */
export function transcriptLength(entries: readonly MeetingEntry[]): number {
  return entries.reduce((length, entry, index) => length + formatEntry(entry).length + (index > 0 ? 1 : 0), 0);
}

/** ความยาวของการประชุมเป็นนาที ปัดเป็นจำนวนเต็มที่ใกล้ที่สุด */
export function meetingMinutes(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round((endedAt - startedAt) / 60_000));
}
