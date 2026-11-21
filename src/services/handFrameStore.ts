import type { HandFrame } from "./handControl";

/**
 * เฟรมโครงมือล่าสุด เก็บนอก React เพราะเปลี่ยนราว 30 ครั้งต่อวินาที
 * ตัววาดบน canvas อ่านจากที่นี่เอง ทั้งแอปจึงไม่ต้องวาดใหม่ทุกเฟรม
 */
let current: HandFrame | null = null;
const listeners = new Set<() => void>();

export const handFrameStore = {
  get: (): HandFrame | null => current,
  set(frame: HandFrame | null): void {
    current = frame;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
