/** ส่วนของที่เก็บของเบราว์เซอร์ที่ตัวเลือกใช้ */
type FlagStorage = Pick<Storage, "getItem" | "setItem">;

export interface FlagStore {
  get(): boolean;
  set(enabled: boolean): void;
  subscribe(listener: () => void): () => void;
}

/** อ่านค่าที่เก็บไว้ของตัวเลือกที่เปิดเป็นค่าเริ่มต้น: ปิดเฉพาะเมื่อผู้ใช้เลือกปิดเอง */
export function readFlagChoice(value: unknown): boolean {
  return value !== "off";
}

/**
 * ตัวเลือกเปิด/ปิดหนึ่งข้อของผู้ใช้ เปิดเป็นค่าเริ่มต้น เก็บไว้ในเครื่อง และแจ้งผู้ติดตามเมื่อเปลี่ยน
 * ถ้าที่เก็บของเบราว์เซอร์ใช้ไม่ได้ ตัวเลือกยังมีผลจนกว่าจะปิดหน้า
 * @param storage ที่เก็บ ค่าเริ่มต้นคือของเบราว์เซอร์ แยกไว้เพื่อให้ทดสอบได้
 */
export function createFlagStore(storageKey: string, storage?: FlagStorage): FlagStore {
  const read = (): boolean => {
    try {
      return readFlagChoice((storage ?? localStorage).getItem(storageKey));
    } catch {
      return true;
    }
  };

  let current = read();
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    set: (enabled) => {
      current = enabled;
      try {
        (storage ?? localStorage).setItem(storageKey, enabled ? "on" : "off");
      } catch {
        // เก็บลงเครื่องไม่ได้: ตัวเลือกยังมีผลจนกว่าจะปิดหน้า
      }
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
