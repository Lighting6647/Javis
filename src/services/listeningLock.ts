import { browserLocks, createTabLock, type LockManagerLike, type TabLock } from "./tabLock";

export type { LockManagerLike };

/** สิทธิ์เป็นแท็บที่ฟังเสียง */
export type ListeningLock = TabLock;

/**
 * ให้ Javis ฟังอยู่ได้ทีละแท็บ: โหมดฟังตลอดเวลาเริ่มฟังเองทุกแท็บที่เปิด ถ้าไม่กันไว้ สองแท็บจะแย่งไมโครโฟนกัน
 * หรือได้ยินคำสั่งเดียวกันแล้วตอบซ้อนกันสองครั้ง
 * @param locks ระบบล็อกของเบราว์เซอร์ หรือ null ถ้าไม่มี ซึ่งจะถือว่าฟังได้เสมอ
 */
export function createListeningLock(locks: LockManagerLike | null): ListeningLock {
  return createTabLock(locks, "javis.listening");
}

/** ล็อกการฟังของแท็บนี้ */
export const listeningLock: ListeningLock = createListeningLock(browserLocks());
