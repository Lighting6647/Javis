import { sessionStore } from "../services/sessionStore";
import { sessionAllowsSync, startListSync, type ListSyncDeps } from "../services/serverSync";
import { fetchServerMemories, saveServerMemories } from "../services/userDataApi";
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

const sameList = (a: readonly MemoryItem[], b: readonly MemoryItem[]) =>
  a.length === b.length && a.every((item, index) => item.id === b[index]?.id && item.text === b[index]?.text);

export type MemorySyncDeps = Omit<ListSyncDeps<MemoryItem>, "merge" | "same">;

/**
 * ซิงก์ความจำกับเซิร์ฟเวอร์: ดึงมารวมตอนเปิดแอปและตอนเปลี่ยนผู้ใช้ แล้วบันทึกกลับทุกครั้งที่จำหรือลืม
 * เซิร์ฟเวอร์ไม่ตอบ (ออฟไลน์ ยังไม่เข้าสู่ระบบ ฐานข้อมูลล่ม) ความจำในเครื่องยังใช้ได้ตามเดิม
 */
export function startMemorySync(deps: MemorySyncDeps = defaultDeps()) {
  return startListSync<MemoryItem>({
    ...deps,
    merge: (local, remote, removed) => mergeMemories([...local], [...remote], removed),
    same: sameList
  });
}

function defaultDeps(): MemorySyncDeps {
  return {
    fetchRemote: fetchServerMemories,
    saveRemote: saveServerMemories,
    store: memoryStore,
    onSessionChange: sessionStore.subscribe,
    canSync: sessionAllowsSync
  };
}
