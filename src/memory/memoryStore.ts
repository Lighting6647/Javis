import { sessionStore } from "../services/sessionStore";

const STORAGE_PREFIX = "javis.memories";
/** ผู้ใช้ที่ไม่ได้เข้าสู่ระบบ (เซิร์ฟเวอร์ไม่บังคับล็อกอิน) ใช้ช่องเก็บร่วมของอุปกรณ์ */
const ANONYMOUS_OWNER = "_";

/** ต้องไม่เกินเพดานที่เซิร์ฟเวอร์ตรวจ (server/chat.ts และ server/responseStream.ts) */
export const MAX_MEMORIES = 50;
export const MAX_MEMORY_LENGTH = 200;
export const MEMORY_ID_PATTERN = /^m[a-z0-9]{1,12}$/;

/** เรื่องหนึ่งเรื่องที่ Javis จำเกี่ยวกับผู้ใช้ เก็บในอุปกรณ์ และซิงก์ขึ้นเซิร์ฟเวอร์ (src/memory/memorySync.ts) */
export interface MemoryItem {
  id: string;
  text: string;
  createdAt: number;
}

export function cleanMemoryText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MEMORY_LENGTH);
}

/** แปลงข้อมูลที่อ่านจากเครื่อง (ซึ่งอาจเสียหายหรือถูกแก้) ให้เป็นรายการความจำที่ใช้ได้เสมอ */
export function sanitizeMemories(value: unknown): MemoryItem[] {
  if (!Array.isArray(value)) return [];

  const items: MemoryItem[] = [];
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const { id, text, createdAt } = raw as Record<string, unknown>;
    const clean = cleanMemoryText(text);
    if (typeof id !== "string" || !MEMORY_ID_PATTERN.test(id) || !clean) continue;
    if (seenIds.has(id) || seenTexts.has(clean.toLowerCase())) continue;

    seenIds.add(id);
    seenTexts.add(clean.toLowerCase());
    items.push({ id, text: clean, createdAt: typeof createdAt === "number" ? createdAt : 0 });
  }
  // เก็บเฉพาะเรื่องล่าสุดเมื่อเกินเพดาน
  return items.slice(-MAX_MEMORIES);
}

let lastStamp = "";
let sequence = 0;

/**
 * รหัสความจำไม่ซ้ำกันตลอดอายุการใช้งาน (เวลา + ลำดับภายในมิลลิวินาทีเดียวกัน) และไม่ถูกนำกลับมาใช้
 * เพื่อให้ปุ่มยกเลิกของข้อความเก่าไม่ไปลบความจำเรื่องอื่นที่มาใช้รหัสเดิม
 */
function nextId(): string {
  const stamp = Date.now().toString(36);
  sequence = stamp === lastStamp ? sequence + 1 : 0;
  lastStamp = stamp;
  return `m${stamp}${sequence.toString(36)}`;
}

function storageKey(): string {
  return `${STORAGE_PREFIX}:${sessionStore.get()?.name ?? ANONYMOUS_OWNER}`;
}

function load(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? sanitizeMemories(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

let items = load();
const listeners = new Set<() => void>();

/** การเปลี่ยนแปลงที่ผู้ใช้ทำเอง (จำ ลืม ล้าง) ส่งรหัสของเรื่องที่ถูกลบไปด้วย ให้ตัวซิงก์บันทึกขึ้นเซิร์ฟเวอร์ */
export type MemoryMutationListener = (removedIds: string[]) => void;
const mutationListeners = new Set<MemoryMutationListener>();
const notifyMutation = (removedIds: string[]) => mutationListeners.forEach((listener) => listener(removedIds));

function commit(next: MemoryItem[]): void {
  items = next;
  try {
    if (next.length > 0) localStorage.setItem(storageKey(), JSON.stringify(next));
    else localStorage.removeItem(storageKey());
  } catch {
    // เก็บลงเครื่องไม่ได้: ความจำยังใช้ได้จนกว่าจะปิดหน้า
  }
  listeners.forEach((listener) => listener());
}

// เปลี่ยนผู้ใช้ (เข้าหรือออกจากระบบ): สลับไปใช้ความจำของผู้ใช้คนนั้น
sessionStore.subscribe(() => {
  items = load();
  listeners.forEach((listener) => listener());
});

/** ความจำระยะยาวของ Javis เก็บในอุปกรณ์ แยกตามผู้ใช้ที่เข้าสู่ระบบ และซิงก์กับเซิร์ฟเวอร์ */
export const memoryStore = {
  get: (): MemoryItem[] => items,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** จำเรื่องใหม่ คืนรายการที่บันทึก หรือ null ถ้าข้อความว่างหรือมีอยู่แล้ว */
  add(text: string): MemoryItem | null {
    const clean = cleanMemoryText(text);
    if (!clean || items.some((item) => item.text.toLowerCase() === clean.toLowerCase())) return null;

    const item: MemoryItem = { id: nextId(), text: clean, createdAt: Date.now() };
    const next = [...items, item];
    const dropped = next.slice(0, Math.max(0, next.length - MAX_MEMORIES)).map((entry) => entry.id);
    commit(next.slice(-MAX_MEMORIES));
    notifyMutation(dropped);
    return item;
  },

  /** ลืมเรื่องหนึ่งเรื่อง คืนรายการที่ถูกลบ หรือ null ถ้าไม่พบ */
  remove(id: string): MemoryItem | null {
    const found = items.find((item) => item.id === id) ?? null;
    if (found) {
      commit(items.filter((item) => item.id !== id));
      notifyMutation([id]);
    }
    return found;
  },

  clear: (): void => {
    const removed = items.map((item) => item.id);
    commit([]);
    notifyMutation(removed);
  },

  /** แทนที่ทั้งรายการด้วยข้อมูลที่รวมกับเซิร์ฟเวอร์แล้ว (ไม่นับเป็นการเปลี่ยนของผู้ใช้ จึงไม่บันทึกกลับซ้ำ) */
  replace: (next: MemoryItem[]): void => commit(sanitizeMemories(next)),

  /** ผู้ใช้ปัจจุบัน (ชื่อที่เข้าสู่ระบบ หรือ _ ) ใช้ตรวจว่าผลจากเซิร์ฟเวอร์ยังเป็นของคนเดิม */
  owner: (): string => sessionStore.get()?.name ?? ANONYMOUS_OWNER,

  subscribeMutations: (listener: MemoryMutationListener): (() => void) => {
    mutationListeners.add(listener);
    return () => {
      mutationListeners.delete(listener);
    };
  }
};
