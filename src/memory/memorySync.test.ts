import { describe, expect, it } from "vitest";
import type { MemoryItem } from "./memoryStore";
import { mergeMemories, startMemorySync, type MemorySyncDeps } from "./memorySync";

const item = (id: string, text: string, createdAt: number): MemoryItem => ({ id, text, createdAt });

describe("mergeMemories", () => {
  it("รวมความจำจากเครื่องและเซิร์ฟเวอร์ เรียงตามเวลา", () => {
    const merged = mergeMemories([item("m1", "ชอบกาแฟ", 1), item("m3", "ชื่อไลท์", 3)], [item("m2", "ทำงานไอที", 2)]);
    expect(merged.map((entry) => entry.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("ข้อความซ้ำเก็บเรื่องที่จำก่อน และรหัสเดียวกันใช้ข้อความในเครื่อง", () => {
    const merged = mergeMemories([item("m1", "ชอบกาแฟดำ", 1), item("m5", "ชอบชา", 5)], [item("m1", "ชอบกาแฟ", 1), item("m2", "ชอบชา", 2)]);
    expect(merged).toEqual([item("m1", "ชอบกาแฟดำ", 1), item("m2", "ชอบชา", 2)]);
  });

  it("ไม่นำเรื่องที่ลบในเครื่องกลับมาจากเซิร์ฟเวอร์", () => {
    expect(mergeMemories([], [item("m1", "เก่า", 1)], new Set(["m1"]))).toEqual([]);
  });

  it("เก็บไม่เกิน 50 เรื่องล่าสุด", () => {
    const remote = Array.from({ length: 40 }, (_, index) => item(`mr${index}`, `r${index}`, index));
    const local = Array.from({ length: 20 }, (_, index) => item(`ml${index}`, `l${index}`, 100 + index));
    const merged = mergeMemories(local, remote);
    expect(merged).toHaveLength(50);
    expect(merged[0]?.id).toBe("mr10");
  });
});

/** ที่เก็บจำลองสำหรับทดสอบตัวซิงก์ */
function harness(initialLocal: MemoryItem[], remote: MemoryItem[] | Error) {
  let local = initialLocal;
  let owner = "light";
  const saved: MemoryItem[][] = [];
  const mutationListeners: Array<(ids: string[]) => void> = [];
  const sessionListeners: Array<() => void> = [];
  const deps: MemorySyncDeps = {
    fetchRemote: async () => {
      if (remote instanceof Error) throw remote;
      return remote;
    },
    saveRemote: async (items) => {
      saved.push(items);
    },
    store: {
      get: () => local,
      replace: (next) => {
        local = next;
      },
      owner: () => owner,
      subscribeMutations: (listener) => {
        mutationListeners.push(listener);
        return () => undefined;
      }
    },
    onSessionChange: (listener) => {
      sessionListeners.push(listener);
      return () => undefined;
    }
  };
  return {
    deps,
    saved,
    local: () => local,
    setLocal: (next: MemoryItem[]) => {
      local = next;
    },
    setOwner: (next: string) => {
      owner = next;
    },
    mutate: (removed: string[]) => mutationListeners.forEach((listener) => listener(removed)),
    switchSession: () => sessionListeners.forEach((listener) => listener())
  };
}

describe("startMemorySync", () => {
  it("ดึงจากเซิร์ฟเวอร์มารวม แล้วบันทึกกลับเมื่อเครื่องมีเรื่องที่เซิร์ฟเวอร์ยังไม่มี", async () => {
    const h = harness([item("m2", "เครื่อง", 2)], [item("m1", "เซิร์ฟเวอร์", 1)]);
    const sync = startMemorySync(h.deps);
    await sync.ready;
    expect(h.local().map((entry) => entry.id)).toEqual(["m1", "m2"]);
    expect(h.saved.at(-1)?.map((entry) => entry.id)).toEqual(["m1", "m2"]);
  });

  it("ข้อมูลตรงกันแล้วไม่บันทึกซ้ำ", async () => {
    const same = [item("m1", "เหมือนกัน", 1)];
    const h = harness(same, same);
    await startMemorySync(h.deps).ready;
    expect(h.saved).toEqual([]);
  });

  it("บันทึกกลับทุกครั้งที่จำหรือลืม", async () => {
    const h = harness([], []);
    const sync = startMemorySync(h.deps);
    await sync.ready;
    h.setLocal([item("m1", "ใหม่", 1)]);
    h.mutate([]);
    await sync.flush();
    h.setLocal([]);
    h.mutate(["m1"]);
    await sync.flush();
    expect(h.saved).toEqual([[item("m1", "ใหม่", 1)], []]);
  });

  it("เซิร์ฟเวอร์ไม่ตอบ: ความจำในเครื่องคงเดิม", async () => {
    const h = harness([item("m1", "ในเครื่อง", 1)], new Error("offline"));
    await startMemorySync(h.deps).ready;
    expect(h.local()).toEqual([item("m1", "ในเครื่อง", 1)]);
    expect(h.saved).toEqual([]);
  });

  it("ผลจากเซิร์ฟเวอร์ของผู้ใช้คนก่อนไม่ถูกนำมารวม", async () => {
    let release: (value: MemoryItem[]) => void = () => undefined;
    const h = harness([], []);
    h.deps.fetchRemote = () => new Promise((resolve) => (release = resolve));
    const sync = startMemorySync(h.deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.setOwner("nurse");
    release([item("m9", "ของไลท์", 1)]);
    await sync.ready;
    expect(h.local()).toEqual([]);
  });

  it("เซิร์ฟเวอร์บังคับล็อกอินแต่ยังไม่ล็อกอิน: ไม่เรียกเซิร์ฟเวอร์เลย", async () => {
    const h = harness([item("m1", "ในเครื่อง", 1)], [item("m2", "ไม่ควรเห็น", 2)]);
    let fetched = 0;
    const fetchRemote = h.deps.fetchRemote;
    h.deps.fetchRemote = () => {
      fetched += 1;
      return fetchRemote();
    };
    h.deps.canSync = async () => false;
    const sync = startMemorySync(h.deps);
    await sync.ready;
    h.mutate([]);
    await sync.flush();
    expect(fetched).toBe(0);
    expect(h.saved).toEqual([]);
    expect(h.local()).toEqual([item("m1", "ในเครื่อง", 1)]);
  });

  it("เปลี่ยนผู้ใช้แล้วดึงความจำของผู้ใช้ใหม่", async () => {
    const h = harness([], [item("m1", "ของผู้ใช้ใหม่", 1)]);
    const sync = startMemorySync(h.deps);
    await sync.ready;
    h.setLocal([]);
    h.switchSession();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.local()).toEqual([item("m1", "ของผู้ใช้ใหม่", 1)]);
  });
});
