import { safeHttpUrl } from "../conversation/richText";
import type { PageBridge } from "./types";

interface DesktopBridge {
  isDesktop: true;
  platform: string;
}

/** true เมื่อรันในแอปเดสก์ท็อปของ Javis ซึ่งมีเบราว์เซอร์ในตัว */
export function isDesktopApp(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as Window & { javisDesktop?: DesktopBridge }).javisDesktop?.isDesktop === true
  );
}

export interface BrowserState {
  /** หน้าที่สั่งเปิดล่าสุด null = ยังไม่ได้เปิดหน้าเว็บ */
  requestedUrl: string | null;
  /** เพิ่มขึ้นทุกครั้งที่สั่งเปิด เพื่อให้เปิด URL เดิมซ้ำได้ */
  requestId: number;
  /** กำลังแสดงหน้าเว็บแทนบทสนทนา */
  visible: boolean;
  currentUrl: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** โหลดหน้าไม่สำเร็จ พร้อมข้อความสำหรับผู้ใช้ */
  error: string | null;
}

const INITIAL_STATE: BrowserState = {
  requestedUrl: null,
  requestId: 0,
  visible: false,
  currentUrl: "",
  title: "",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  error: null
};

let state = INITIAL_STATE;
let bridge: PageBridge | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<BrowserState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** สถานะของเบราว์เซอร์ในตัวแอปเดสก์ท็อป */
export const browserStore = {
  get: (): BrowserState => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** เปิดหน้าเว็บในตัวแอป คืน false ถ้าไม่ได้อยู่ในแอปเดสก์ท็อปหรือลิงก์ไม่ปลอดภัย */
  open(url: string): boolean {
    const safe = isDesktopApp() ? safeHttpUrl(url) : null;
    if (!safe) return false;
    set({ requestedUrl: safe, requestId: state.requestId + 1, visible: true, currentUrl: safe, error: null });
    return true;
  },
  /**
   * แสดงหน้าเว็บในกรอบของหน้า Javis เอง (เว็บในเบราว์เซอร์) คืน false ถ้าลิงก์ไม่ปลอดภัยหรือไม่ใช่ https
   * ใช้กับหน้าที่เซิร์ฟเวอร์ตรวจแล้วว่าเจ้าของเว็บยอมให้แสดงในกรอบเท่านั้น
   * หน้าในกรอบอยู่คนละเว็บกับ Javis จึงอ่านชื่อหน้าและที่อยู่ปัจจุบันของมันไม่ได้ ชื่อที่แสดงมาจากคำสั่งเปิด
   */
  showFramed(url: string, title: string): boolean {
    const safe = safeHttpUrl(url);
    if (!safe || !safe.startsWith("https://")) return false;
    set({
      requestedUrl: safe,
      requestId: state.requestId + 1,
      visible: true,
      currentUrl: safe,
      title,
      loading: true,
      canGoBack: false,
      canGoForward: false,
      error: null
    });
    return true;
  },
  show: (): void => {
    if (state.requestedUrl) set({ visible: true });
  },
  hide: (): void => set({ visible: false }),
  close: (): void => {
    bridge = null;
    set(INITIAL_STATE);
  },
  update: (patch: Partial<BrowserState>): void => set(patch),

  setBridge: (next: PageBridge | null): void => {
    bridge = next;
  },
  getBridge: (): PageBridge | null => bridge
};
