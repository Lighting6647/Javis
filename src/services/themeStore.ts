const STORAGE_KEY = "javis.theme";

/** holo: จอโฮโลแกรมแบบ HUD (ค่าเริ่มต้น) · plain: หน้าจอเรียบ สว่างหรือมืดตามอุปกรณ์ */
export type Theme = "holo" | "plain";

export const DEFAULT_THEME: Theme = "holo";

/** สีแถบระบบของเบราว์เซอร์และแอปที่ติดตั้ง ให้เข้ากับพื้นหลังของแต่ละธีม */
const THEME_COLOR: Record<Theme, string> = { holo: "#020b14", plain: "#09090b" };

export function sanitizeTheme(value: unknown): Theme {
  return value === "plain" || value === "holo" ? value : DEFAULT_THEME;
}

function load(): Theme {
  try {
    return sanitizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function apply(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

let current = load();
const listeners = new Set<() => void>();

/** รูปแบบหน้าจอที่ผู้ใช้เลือก เก็บไว้ในเครื่องและมีผลทันที */
export const themeStore = {
  get: (): Theme => current,
  /** ใส่ธีมที่เลือกไว้ให้หน้าเว็บ เรียกก่อนวาดหน้าจอครั้งแรกเพื่อไม่ให้สีกระพริบ */
  init: (): void => apply(current),
  set: (theme: Theme): void => {
    current = sanitizeTheme(theme);
    apply(current);
    try {
      localStorage.setItem(STORAGE_KEY, current);
    } catch {
      // เก็บลงเครื่องไม่ได้: ธีมยังมีผลจนกว่าจะปิดหน้า
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
