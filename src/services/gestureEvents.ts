/**
 * ช่องทางส่งท่ายืนยัน/ยกเลิก (นิ้วโป้งขึ้น/ลง) ไปให้การ์ดที่รอคำตอบอยู่
 * ตัวจับท่ามือส่งเหตุการณ์เข้ามา ส่วนการ์ดแต่ละใบเลือกเองว่าจะรับไหม
 *
 * TODO(mail PR): เมื่อ PR อีเมล/ปฏิทิน (feat/luna-mail-calendar-briefing) เข้า main แล้ว
 * ให้ CalendarChangeCard และ EmailDraftCard สมัครรับ "cancel" ได้เลย
 * ส่วน "confirm" ห้ามส่งอีเมลหรือแก้ปฏิทินเองจากท่ามือ: ให้แค่ย้ายโฟกัสไปที่ปุ่มยืนยัน แล้วให้ผู้ใช้กดเอง
 */
export type GestureIntent = "confirm" | "cancel";

type Listener = (intent: GestureIntent) => void;

const listeners = new Set<Listener>();

export const gestureIntents = {
  /** รับเหตุการณ์ท่ายืนยัน/ยกเลิก คืนฟังก์ชันเลิกรับ */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** ส่งเหตุการณ์ไปให้ทุกคนที่รับอยู่ คืนจำนวนผู้รับ */
  emit(intent: GestureIntent): number {
    listeners.forEach((listener) => listener(intent));
    return listeners.size;
  }
};
