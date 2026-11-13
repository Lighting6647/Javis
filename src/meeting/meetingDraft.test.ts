import { describe, expect, it } from "vitest";
import { createMeetingDraftStore, MEETING_DRAFT_MAX_AGE_MS } from "./meetingDraft";
import { MAX_TRANSCRIPT_LENGTH } from "./transcript";

const KEY = "javis.meetingDraft";
const NOW = 2_000_000_000_000;

/** ที่เก็บจำลองของเบราว์เซอร์ */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    }
  };
}

const draft = { startedAt: NOW - 10 * 60_000, entries: [{ at: 5_000, text: "วันนี้คุยเรื่องเปิดตัวสินค้าใหม่" }] };

describe("createMeetingDraftStore", () => {
  it("เก็บบันทึกแล้วอ่านกลับมาได้เหมือนเดิม", () => {
    const storage = fakeStorage();
    const store = createMeetingDraftStore(storage, () => NOW);

    store.save(draft);

    expect(store.load()).toEqual(draft);
    expect(storage.items.has(KEY)).toBe(true);
  });

  it("ยังไม่เคยเก็บ: ไม่มีอะไรให้นำกลับมา", () => {
    expect(createMeetingDraftStore(fakeStorage(), () => NOW).load()).toBeNull();
  });

  it("ล้างแล้วไม่เหลืออะไรในเครื่อง", () => {
    const storage = fakeStorage();
    const store = createMeetingDraftStore(storage, () => NOW);

    store.save(draft);
    store.clear();

    expect(store.load()).toBeNull();
    expect(storage.items.has(KEY)).toBe(false);
  });

  it.each([
    ["ไม่ใช่ JSON", "{เสีย"],
    ["ไม่ใช่ออบเจกต์", JSON.stringify([1, 2])],
    ["ไม่มีเวลาเริ่ม", JSON.stringify({ entries: draft.entries })],
    ["รายการไม่ใช่อาร์เรย์", JSON.stringify({ startedAt: draft.startedAt, entries: "ทั้งหมด" })],
    ["ไม่มีช่วงคำพูดที่ใช้ได้", JSON.stringify({ startedAt: draft.startedAt, entries: [{ at: -1, text: "ก" }, { at: 1, text: "  " }, { at: "1", text: "ก" }, null] })],
    ["เก่าเกินหนึ่งวัน", JSON.stringify({ ...draft, startedAt: NOW - MEETING_DRAFT_MAX_AGE_MS - 1 })],
    ["เวลาเริ่มอยู่ในอนาคต", JSON.stringify({ ...draft, startedAt: NOW + 60_000 })],
    ["ยาวเกินเพดาน", JSON.stringify({ startedAt: draft.startedAt, entries: [{ at: 0, text: "ก".repeat(MAX_TRANSCRIPT_LENGTH + 1) }] })]
  ])("ของที่เก็บไว้%s: ไม่นำกลับมา", (_name, raw) => {
    const storage = fakeStorage({ [KEY]: raw });

    expect(createMeetingDraftStore(storage, () => NOW).load()).toBeNull();
  });

  it("ทิ้งเฉพาะช่วงคำพูดที่ผิดรูป ส่วนที่ใช้ได้ยังนำกลับมา และตัดช่องว่างหัวท้าย", () => {
    const raw = JSON.stringify({ startedAt: draft.startedAt, entries: [{ at: 1_000, text: "  ใช้ได้  " }, { at: -5, text: "เวลาติดลบ" }, { text: "ไม่มีเวลา" }, { at: 9_000, text: "ใช้ได้อีกช่วง" }] });
    const storage = fakeStorage({ [KEY]: raw });

    expect(createMeetingDraftStore(storage, () => NOW).load()).toEqual({
      startedAt: draft.startedAt,
      entries: [
        { at: 1_000, text: "ใช้ได้" },
        { at: 9_000, text: "ใช้ได้อีกช่วง" }
      ]
    });
  });

  describe("เจ้าของบันทึก", () => {
    it("บันทึกของผู้ใช้คนอื่น: ไม่นำกลับมา และไม่ลบของเขา", () => {
      const storage = fakeStorage();
      createMeetingDraftStore(storage, () => NOW, () => "สมชาย").save(draft);

      expect(createMeetingDraftStore(storage, () => NOW, () => "สมหญิง").load()).toBeNull();
      expect(createMeetingDraftStore(storage, () => NOW, () => null).load()).toBeNull();
      expect(createMeetingDraftStore(storage, () => NOW, () => "สมชาย").load()).toEqual(draft);
    });

    it("บันทึกที่จดตอนไม่มีการเข้าสู่ระบบ: ผู้ที่เข้าสู่ระบบทีหลังไม่ได้เห็น", () => {
      const storage = fakeStorage();
      createMeetingDraftStore(storage, () => NOW).save(draft);

      expect(createMeetingDraftStore(storage, () => NOW, () => "สมชาย").load()).toBeNull();
      expect(createMeetingDraftStore(storage, () => NOW).load()).toEqual(draft);
    });

    it("อ่านเจ้าของ ณ เวลาที่เก็บและนำกลับมา เพราะผู้ใช้เปลี่ยนได้โดยไม่โหลดหน้าใหม่", () => {
      const storage = fakeStorage();
      let owner: string | null = "สมชาย";
      const store = createMeetingDraftStore(storage, () => NOW, () => owner);

      store.save(draft);
      owner = "สมหญิง";
      expect(store.load()).toBeNull();
      owner = "สมชาย";
      expect(store.load()).toEqual(draft);
    });
  });

  it("ที่เก็บของเบราว์เซอร์ใช้ไม่ได้: ไม่ล้ม และถือว่าไม่มีบันทึกค้าง", () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: (): void => {
        throw new Error("quota");
      },
      removeItem: (): void => {
        throw new Error("blocked");
      }
    };
    const store = createMeetingDraftStore(broken, () => NOW);

    expect(() => store.save(draft)).not.toThrow();
    expect(store.load()).toBeNull();
    expect(() => store.clear()).not.toThrow();
  });
});
