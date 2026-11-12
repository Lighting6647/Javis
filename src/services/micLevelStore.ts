const STORAGE_KEY = "javis.micLevels";

/**
 * อ่านตัวเลือกที่เก็บไว้: ให้วงคลื่นเสียงขยับตามเสียงไมโครโฟนจริงหรือไม่
 * เปิดเป็นค่าเริ่มต้น ปิดเฉพาะเมื่อผู้ใช้เลือกปิดเอง
 */
export function readMicLevelChoice(value: unknown): boolean {
  return value !== "off";
}

function load(): boolean {
  try {
    return readMicLevelChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    return true;
  }
}

let current = load();
const listeners = new Set<() => void>();

/**
 * ตัวเลือกของผู้ใช้ว่าจะให้วงคลื่นเสียงของแกนกลางขยับตามเสียงไมโครโฟนจริงไหม เก็บไว้ในเครื่อง
 * มีไว้ให้ปิดได้เอง เพราะตัววัดเปิดไมโครโฟนอีกเส้นคู่กับระบบฟัง ถ้าอุปกรณ์ใดฟังได้แย่ลง ผู้ใช้ไม่ต้องรอรุ่นแก้ไข
 */
export const micLevelStore = {
  get: (): boolean => current,
  set: (enabled: boolean): void => {
    current = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // เก็บลงเครื่องไม่ได้: ตัวเลือกยังมีผลจนกว่าจะปิดหน้า
    }
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
