const STORAGE_KEY = "javis.session";

export interface StoredSession {
  token: string;
  name: string;
  expiresAt: number;
}

function isValid(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) return false;
  const { token, name, expiresAt } = value as Record<string, unknown>;
  return (
    typeof token === "string" &&
    token.length > 0 &&
    typeof name === "string" &&
    typeof expiresAt === "number" &&
    expiresAt > Date.now()
  );
}

function load(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isValid(parsed) ? parsed : null;
  } catch {
    // เปิดแบบส่วนตัวหรือถูกปิดการเก็บข้อมูล: ทำงานต่อได้ แต่ต้องเข้าสู่ระบบใหม่ทุกครั้ง
    return null;
  }
}

function persist(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // เก็บลงเครื่องไม่ได้: ยังใช้งานได้จนกว่าจะปิดหน้า
  }
}

let current = load();
const listeners = new Set<() => void>();

function replace(session: StoredSession | null): void {
  if (session === current) return;
  current = session;
  persist(session);
  listeners.forEach((listener) => listener());
}

/** โทเค็นเข้าใช้งานของผู้ใช้ปัจจุบัน เก็บไว้ในเครื่องเพื่อไม่ต้องเข้าสู่ระบบซ้ำ */
export const sessionStore = {
  get: (): StoredSession | null => current,
  set: (session: StoredSession): void => replace(session),
  clear: (): void => replace(null),
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  authHeaders: (): Record<string, string> =>
    current ? { Authorization: `Bearer ${current.token}` } : {}
};
