import { fetchSessionStatus } from "./authApi";

/** ที่เก็บในเครื่องที่ซิงก์กับเซิร์ฟเวอร์ได้ */
export interface SyncableStore<T> {
  get: () => readonly T[];
  /** แทนที่ทั้งรายการด้วยข้อมูลที่รวมแล้ว (ไม่นับเป็นการเปลี่ยนของผู้ใช้) */
  replace: (next: T[]) => void;
  /** ผู้ใช้ปัจจุบัน ใช้ตรวจว่าผลจากเซิร์ฟเวอร์ยังเป็นของคนเดิม */
  owner: () => string;
  /** แจ้งเมื่อผู้ใช้เพิ่ม/ลบเอง พร้อมรหัสที่ถูกลบ */
  subscribeMutations: (listener: (removedIds: string[]) => void) => () => void;
}

export interface ListSyncDeps<T> {
  fetchRemote: () => Promise<T[]>;
  saveRemote: (items: T[]) => Promise<unknown>;
  store: SyncableStore<T>;
  onSessionChange: (listener: () => void) => () => void;
  /** รวมรายการในเครื่องกับบนเซิร์ฟเวอร์ โดยตัดรายการที่ผู้ใช้ลบในเครื่องแล้ว */
  merge: (local: readonly T[], remote: readonly T[], removedIds: ReadonlySet<string>) => T[];
  same: (a: readonly T[], b: readonly T[]) => boolean;
  /** เลือกรายการที่จะส่งขึ้นเซิร์ฟเวอร์ (ค่าเริ่มต้น: ทั้งหมด) */
  toRemote?: (local: readonly T[], owner: string) => T[];
  /**
   * เซิร์ฟเวอร์ยอมให้ผู้ใช้ปัจจุบันใช้ข้อมูลบนเซิร์ฟเวอร์ไหม (ไม่บังคับล็อกอิน หรือล็อกอินแล้ว)
   * ยังไม่ล็อกอินบนเซิร์ฟเวอร์ที่บังคับ: ไม่ต้องลองเรียก เพราะจะได้ 401 ทุกครั้ง
   */
  canSync?: () => Promise<boolean>;
}

/** ถามเซิร์ฟเวอร์ครั้งเดียวว่าผู้ใช้ปัจจุบันใช้ข้อมูลบนเซิร์ฟเวอร์ได้ไหม */
export async function sessionAllowsSync(): Promise<boolean> {
  const status = await fetchSessionStatus();
  return !status.authRequired || status.authenticated;
}

/**
 * ซิงก์รายการในเครื่องกับเซิร์ฟเวอร์: ดึงมารวมตอนเริ่มและตอนเปลี่ยนผู้ใช้ แล้วบันทึกกลับทุกครั้งที่ผู้ใช้เพิ่มหรือลบ
 * เซิร์ฟเวอร์ไม่ตอบ (ออฟไลน์ ยังไม่เข้าสู่ระบบ ฐานข้อมูลล่ม) ข้อมูลในเครื่องยังใช้ได้ตามเดิม
 */
export function startListSync<T>(deps: ListSyncDeps<T>) {
  const removedIds = new Set<string>();
  const toRemote = deps.toRemote ?? ((local: readonly T[]) => [...local]);
  let saving: Promise<unknown> = Promise.resolve();

  /** ผลตรวจสิทธิ์ของผู้ใช้ปัจจุบัน ตรวจครั้งเดียวต่อผู้ใช้ */
  let allowed: { owner: string; result: Promise<boolean> } | null = null;
  const canSync = () => {
    const owner = deps.store.owner();
    if (allowed?.owner !== owner) {
      allowed = { owner, result: (deps.canSync?.() ?? Promise.resolve(true)).catch(() => false) };
    }
    return allowed.result;
  };

  /** บันทึกตามลำดับ เพื่อไม่ให้คำขอเก่าที่มาถึงช้าทับรายการใหม่ */
  const save = () => {
    const owner = deps.store.owner();
    saving = saving
      .catch(() => undefined)
      .then(async () =>
        deps.store.owner() === owner && (await canSync()) ? deps.saveRemote(toRemote(deps.store.get(), owner)) : undefined
      )
      .catch(() => undefined);
    return saving;
  };

  const pull = async () => {
    const owner = deps.store.owner();
    let remote: T[];
    try {
      if (!(await canSync())) return;
      remote = await deps.fetchRemote();
    } catch {
      return;
    }
    // เปลี่ยนผู้ใช้ระหว่างรอ: ผลนี้ไม่ใช่ของผู้ใช้ปัจจุบัน
    if (deps.store.owner() !== owner) return;
    const local = deps.store.get();
    const merged = deps.merge(local, remote, removedIds);
    if (!deps.same(merged, local)) deps.store.replace(merged);
    if (!deps.same(toRemote(merged, owner), deps.merge([], remote, new Set()))) await save();
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
