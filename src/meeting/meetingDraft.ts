import { MAX_TRANSCRIPT_LENGTH, type MeetingEntry, transcriptLength } from "./transcript";

const STORAGE_KEY = "javis.meetingDraft";
/** บันทึกที่ค้างนานกว่านี้ถือว่าเลิกใช้แล้ว จึงไม่นำกลับมา */
export const MEETING_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** บันทึกการประชุมที่ยังไม่ได้สรุป */
export interface MeetingDraft {
  /** เวลาที่เริ่มประชุม (มิลลิวินาทีของนาฬิกาเครื่อง) */
  startedAt: number;
  entries: MeetingEntry[];
}

/** สิ่งที่ตัวจดการประชุมต้องการจากที่เก็บในเครื่อง */
export interface MeetingDraftPort {
  load(): MeetingDraft | null;
  save(draft: MeetingDraft): void;
  clear(): void;
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readEntry(value: unknown): MeetingEntry | null {
  if (!isObject(value)) return null;
  const { at, text } = value;
  if (typeof at !== "number" || !Number.isFinite(at) || at < 0) return null;
  if (typeof text !== "string" || !text.trim()) return null;
  return { at, text: text.trim() };
}

/**
 * ที่เก็บบันทึกการประชุมที่ยังไม่ได้สรุป ไว้ในเครื่องของผู้ใช้
 * การประชุมยาวเป็นชั่วโมง ถ้าหน้าเว็บถูกปิดหรือโหลดใหม่กลางคัน สิ่งที่จดไว้ต้องไม่หาย
 * ของที่เก็บเป็นข้อมูลที่อ่านกลับมาจากเครื่อง จึงตรวจรูปร่างทุกครั้ง และทิ้งถ้าผิดรูป เก่าเกิน หรือยาวเกินเพดาน
 *
 * บันทึกผูกกับเจ้าของ: เครื่องเดียวกันอาจมีหลายคนเข้าสู่ระบบ บันทึกของคนหนึ่งจึงไม่ถูกนำกลับมาให้อีกคนเห็น
 * แต่ก็ไม่ลบ เพราะเจ้าของอาจแค่เซสชันหมดอายุกลางประชุมและกำลังจะกลับมา มีที่เก็บช่องเดียว การประชุมใหม่ของใครก็ตามจึงทับของเดิม
 * @param storage ที่เก็บ ค่าเริ่มต้นคือของเบราว์เซอร์ แยกไว้เพื่อให้ทดสอบได้
 * @param now นาฬิกาของเครื่อง (มิลลิวินาที)
 * @param owner ผู้ใช้ที่เข้าสู่ระบบอยู่ตอนนี้ หรือ null เมื่อไม่มีการเข้าสู่ระบบ
 */
export function createMeetingDraftStore(
  storage?: DraftStorage,
  now: () => number = Date.now,
  owner: () => string | null = () => null
): MeetingDraftPort {
  const target = (): DraftStorage => storage ?? localStorage;

  const clear = (): void => {
    try {
      target().removeItem(STORAGE_KEY);
    } catch {
      // ที่เก็บของเบราว์เซอร์ใช้ไม่ได้: ไม่มีอะไรให้ลบ
    }
  };

  return {
    load() {
      let value: unknown;
      try {
        const raw = target().getItem(STORAGE_KEY);
        if (!raw) return null;
        value = JSON.parse(raw);
      } catch {
        return null;
      }

      if (!isObject(value) || typeof value.startedAt !== "number" || !Array.isArray(value.entries)) {
        clear();
        return null;
      }
      // ของผู้ใช้คนอื่น: ไม่ใช่ของเสีย จึงไม่ลบ แค่ไม่นำกลับมาให้คนนี้
      if ((typeof value.owner === "string" ? value.owner : null) !== owner()) return null;

      const age = now() - value.startedAt;
      const entries = value.entries.map(readEntry).filter((entry): entry is MeetingEntry => entry !== null);
      if (age < 0 || age > MEETING_DRAFT_MAX_AGE_MS || entries.length === 0 || transcriptLength(entries) > MAX_TRANSCRIPT_LENGTH) {
        clear();
        return null;
      }
      return { startedAt: value.startedAt, entries };
    },

    save(draft) {
      try {
        target().setItem(STORAGE_KEY, JSON.stringify({ owner: owner(), startedAt: draft.startedAt, entries: draft.entries }));
      } catch {
        // เก็บลงเครื่องไม่ได้ (เช่นที่เก็บเต็ม): การจดยังทำงานต่อ เพียงแต่กู้คืนไม่ได้ถ้าหน้าเว็บถูกปิด
      }
    },

    clear
  };
}
