/**
 * ป้ายท่ามือชั่วคราว เช่น "ดีดนิ้ว · เรียกลูน่า" หลังท่าสั่งงานสำเร็จ แสดงค้างสั้น ๆ แทนป้ายของท่าปัจจุบัน
 */
export const HINT_FLASH_MS = 1400;

let flash: { text: string; until: number } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const gestureHintStore = {
  /** ป้ายชั่วคราวที่ยังไม่หมดเวลา */
  get(now = performance.now()): string | null {
    return flash && now < flash.until ? flash.text : null;
  },
  flash(text: string | null): void {
    if (!text) return;
    flash = { text, until: performance.now() + HINT_FLASH_MS };
    clearTimeout(timer);
    timer = setTimeout(() => {
      flash = null;
      notify();
    }, HINT_FLASH_MS);
    notify();
  },
  clear(): void {
    flash = null;
    clearTimeout(timer);
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
