import { fetchSessionStatus } from "../services/authApi";
import { sessionStore } from "../services/sessionStore";
import { fetchServerMemories, saveServerMemories, type ServerMemory } from "../services/userDataApi";
import { MAX_MEMORIES, memoryStore, sanitizeMemories, type MemoryItem } from "./memoryStore";

/**
 * รวมความจำจากเครื่องกับจากเซิร์ฟเวอร์: รวมทุกเรื่องตามรหัส ตัดเรื่องที่ข้อความซ้ำ
 * ตัดเรื่องที่ผู้ใช้ลบไปแล้วในเครื่องนี้ เรียงตามเวลาที่จำ และเก็บเฉพาะ 50 เรื่องล่าสุด
 */
export function mergeMemories(local: MemoryItem[], remote: MemoryItem[], removedIds: ReadonlySet<string> = new Set()): MemoryItem[] {
  const byId = new Map<string, MemoryItem>();
  for (const item of [...sanitizeMemories(remote), ...sanitizeMemories(local)]) {
    if (!removedIds.has(item.id)) byId.set(item.id, item);
  }
  const seenTexts = new Set<string>();
  const merged = [...byId.values()]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .filter((item) => {
      const key = item.text.toLowerCase();
      if (seenTexts.has(key)) return false;
      seenTexts.add(key);
      return true;
    });
  return merged.slice(-MAX_MEMORIES);
}

const sameList = (a: MemoryItem[], b: MemoryItem[]) =>
  a.length === b.length && a.every((item, index) => item.id === b[index]?.id && item.text === b[index]?.text);

export interface MemorySyncDeps {
  fetchRemote: () => Promise<ServerMemory[]>;
  saveRemote: (items: ServerMemory[]) => Promise<unknown>;
  store: Pick<typeof memoryStore, "get" | "replace" | "owner" | "subscribeMutations">;
  onSessionChange: (listener: () => void) => () => void;
  /**
   * เซิร์ฟเวอร์ยอมให้ผู้ใช้ปัจจุบันใช้ข้อมูลบนเซิร์ฟเวอร์ไหม (ไม่บังคับล็อกอิน หรือล็อกอินแล้ว)
   * ยังไม่ล็อกอินบนเซิร์ฟเวอร์ที่บังคับ: ไม่ต้องลองเรียก เพราะจะได้ 401 ทุกครั้ง
   */
  canSync?: () => Promise<boolean>;
}

/**
 * ซิงก์ความจำกับเซิร์ฟเวอร์: ดึงมารวมตอนเปิดแอปและตอนเปลี่ยนผู้ใช้ แล้วบันทึกกลับทุกครั้งที่จำหรือลืม
 * เซิร์ฟเวอร์ไม่ตอบ (ออฟไลน์ ยังไม่เข้าสู่ระบบ ฐานข้อมูลล่ม) ความจำในเครื่องยังใช้ได้ตามเดิม
 * คืนฟังก์ชันหยุดซิงก์ และ promise ของการดึงครั้งแรก (ใช้ในเทสต์)
 */
export function startMemorySync(deps: MemorySyncDeps = defaultDeps()) {
  const removedIds = new Set<string>();
  let saving: Promise<unknown> = Promise.resolve();
  /** ขอบันทึกตามลำดับ เพื่อไม่ให้คำขอเก่าที่มาถึงช้าทับรายการใหม่ */
  /** ผลตรวจสิทธิ์ของผู้ใช้ปัจจุบัน ตรวจครั้งเดียวต่อผู้ใช้ */
  let allowed: { owner: string; result: Promise<boolean> } | null = null;
  const canSync = () => {
    const owner = deps.store.owner();
    if (allowed?.owner !== owner) {
      allowed = { owner, result: (deps.canSync?.() ?? Promise.resolve(true)).catch(() => false) };
    }
    return allowed.result;
  };

  const save = () => {
    const owner = deps.store.owner();
    saving = saving
      .catch(() => undefined)
      .then(async () => (deps.store.owner() === owner && (await canSync()) ? deps.saveRemote(deps.store.get()) : undefined))
      .catch(() => undefined);
    return saving;
  };

  const pull = async () => {
    const owner = deps.store.owner();
    let remote: ServerMemory[];
    try {
      if (!(await canSync())) return;
      remote = await deps.fetchRemote();
    } catch {
      return;
    }
    // เปลี่ยนผู้ใช้ระหว่างรอ: ผลนี้ไม่ใช่ของผู้ใช้ปัจจุบัน
    if (deps.store.owner() !== owner) return;
    const local = deps.store.get();
    const merged = mergeMemories(local, remote, removedIds);
    if (!sameList(merged, local)) deps.store.replace(merged);
    if (!sameList(merged, sanitizeMemories(remote))) await save();
  };

  const stopMutations = deps.store.subscribeMutations((removed) => {
    removed.forEach((id) => removedIds.add(id));
    void save();
  });
  const stopSession = deps.onSessionChange(() => {
    removedIds.clear();
    allowed = null;
    void pull();
  });
  const initial = pull();

  return {
    ready: initial,
    flush: () => saving,
    stop: () => {
      stopMutations();
      stopSession();
    }
  };
}

function defaultDeps(): MemorySyncDeps {
  return {
    fetchRemote: fetchServerMemories,
    saveRemote: saveServerMemories,
    store: memoryStore,
    onSessionChange: sessionStore.subscribe,
    canSync: async () => {
      const status = await fetchSessionStatus();
      return !status.authRequired || status.authenticated;
    }
  };
}
