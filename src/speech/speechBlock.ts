/**
 * ติดตามว่าเบราว์เซอร์ยอมให้หน้านี้พูดหรือไม่ จากผลของการสั่งพูดแต่ละครั้ง
 *
 * เบราว์เซอร์ไม่ยอมให้หน้าเว็บส่งเสียงเอง จนกว่าผู้ใช้จะแตะหรือกดอะไรบนหน้านั้นหนึ่งครั้ง
 * โหมดฟังตลอดเวลาเริ่มฟังเองตั้งแต่เปิดหน้า จึงอาจถึงเวลาตอบทั้งที่ผู้ใช้ยังไม่ได้แตะอะไรเลย
 * ตัวนี้ไม่เดาเอง: ดูจากสิ่งที่เกิดจริง เพราะบางกรณีเบราว์เซอร์ยอมให้พูดได้โดยไม่ต้องแตะ
 * (เช่นหน้าที่กำลังเปิดไมโครโฟนอยู่ ตามที่วัดใน Chrome 157)
 */
export interface SpeechBlock {
  isBlocked(): boolean;
  /** การสั่งพูดจบด้วยข้อผิดพลาดรหัสนี้ */
  failed(error: string): void;
  /** เสียงเริ่มออกได้แล้ว */
  started(): void;
  subscribe(listener: () => void): () => void;
}

export function createSpeechBlock(): SpeechBlock {
  let blocked = false;
  const listeners = new Set<() => void>();

  const set = (next: boolean) => {
    if (blocked === next) return;
    blocked = next;
    listeners.forEach((listener) => listener());
  };

  return {
    isBlocked: () => blocked,
    failed: (error) => {
      // รหัสอื่น (เช่นถูกยกเลิกกลางคัน) ไม่ได้บอกอะไรเรื่องสิทธิ์ในการพูด
      if (error === "not-allowed") set(true);
    },
    started: () => set(false),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
