/**
 * ช่องทางส่งท่ายืนยัน/ยกเลิก (นิ้วโป้งขึ้น/ลง) ไปให้การ์ดที่รอคำตอบอยู่
 * ตัวจับท่ามือส่งเหตุการณ์เข้ามา ส่วนการ์ดแต่ละใบเลือกเองว่าจะรับไหม
 *
 * การ์ดส่งอีเมลและแก้ปฏิทินรับแค่ "cancel" ท่ามือไม่ส่งอีเมลหรือแก้ปฏิทินเอง ผู้ใช้ต้องกดปุ่มยืนยันบนการ์ด (ดู App.tsx)
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
