import { safeHttpUrl } from "../conversation/richText";
import type { ConversationMessage, PageLink, WebSource } from "../conversation/types";

/**
 * เก็บบทสนทนาไว้ในแท็บ ก่อนที่ Javis จะพาแท็บนี้ไปยังเว็บอื่น แล้วคืนให้เมื่อผู้ใช้กลับมา
 * เมื่อผู้ใช้กดย้อนกลับ เบราว์เซอร์มักโหลดหน้า Javis ใหม่ทั้งหน้า (วัดใน Chrome และ Edge หลังแท็บใหม่ถูกบล็อก)
 * ถ้าไม่เก็บไว้ บทสนทนาจะหายทุกครั้งที่สั่งเปิดเว็บ
 *
 * ใช้ที่เก็บของแท็บ (sessionStorage): อยู่เฉพาะแท็บนี้ และหายเมื่อปิดแท็บ คืนให้ครั้งเดียวแล้วลบ
 * การโหลดหน้าซ้ำตามปกติจึงยังเริ่มบทสนทนาใหม่เหมือนเดิม
 */
const KEY = "javis.conversationSnapshot";

/** เก่ากว่านี้ไม่คืน: ผู้ใช้ที่กลับมาหลังผ่านไปนานควรได้เริ่มใหม่ ไม่ใช่เจอบทสนทนาค้างจากเมื่อวาน */
export const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** เก็บเฉพาะข้อความล่าสุด มากกว่าประวัติที่ส่งให้ AI เพื่อให้ผู้ใช้ยังเลื่อนอ่านย้อนได้ */
export const SNAPSHOT_MESSAGE_LIMIT = 60;

const MAX_TEXT_LENGTH = 20_000;
const MAX_TITLE_LENGTH = 300;
const MAX_SOURCES = 12;

type SnapshotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** ที่เก็บของแท็บ หรือ null ถ้าเบราว์เซอร์ไม่มีให้หรือไม่ยอมให้ใช้ */
function tabStorage(): SnapshotStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function readLink(value: unknown): PageLink | undefined {
  if (!isObject(value) || typeof value.title !== "string") return undefined;
  const url = safeHttpUrl(value.url);
  if (!url) return undefined;
  return {
    title: value.title.slice(0, MAX_TITLE_LENGTH),
    url,
    opened: value.opened === true,
    blocked: value.blocked === true,
    inPlace: value.inPlace === true
  };
}

function readSources(value: unknown): WebSource[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const sources: WebSource[] = [];
  for (const entry of value) {
    if (!isObject(entry) || typeof entry.title !== "string") continue;
    const url = safeHttpUrl(entry.url);
    if (url && sources.length < MAX_SOURCES) sources.push({ title: entry.title.slice(0, MAX_TITLE_LENGTH), url });
  }
  return sources.length > 0 ? sources : undefined;
}

/**
 * อ่านข้อความหนึ่งข้อความจากที่เก็บ คืน null ถ้ารูปแบบผิด
 * ที่เก็บของเบราว์เซอร์ถูกแก้จากภายนอกได้ จึงรับเฉพาะช่องที่รู้จัก และลิงก์ต้องเป็นที่อยู่เว็บที่ปลอดภัย
 * ไม่รับแถบคำค้นของ Google (เงื่อนไขของ Google ไม่ให้เก็บ) รายการกรอกฟอร์ม (หน้าที่จะกรอกไม่อยู่แล้ว)
 * และป้ายความจำ (ปุ่มยกเลิกของมันอ้างถึงสถานะที่ไม่ได้เก็บมา)
 */
function readMessage(value: unknown, index: number): ConversationMessage | null {
  if (!isObject(value)) return null;
  if (value.role !== "user" && value.role !== "assistant") return null;
  if (typeof value.text !== "string" || !value.text.trim()) return null;

  const message: ConversationMessage = {
    id: typeof value.id === "string" && value.id ? value.id : `restored-${index + 1}`,
    role: value.role,
    text: value.text.slice(0, MAX_TEXT_LENGTH)
  };
  const sources = readSources(value.sources);
  if (sources) message.sources = sources;
  const link = readLink(value.link);
  if (link) message.link = link;
  return message;
}

function readMessages(values: unknown[]): ConversationMessage[] {
  return values
    .map(readMessage)
    .filter((message): message is ConversationMessage => message !== null)
    .slice(-SNAPSHOT_MESSAGE_LIMIT);
}

export interface ConversationSnapshot {
  /**
   * ชื่อผู้ใช้ที่เข้าสู่ระบบตอนเก็บ หรือ null เมื่อเว็บเปิดให้ใช้โดยไม่ต้องเข้าสู่ระบบ
   * ใช้กันไม่ให้บทสนทนาของคนหนึ่งไปโผล่ให้อีกคนที่เข้าสู่ระบบในแท็บเดียวกัน
   */
  owner: string | null;
  messages: ConversationMessage[];
}

export function clearConversationSnapshot(storage: SnapshotStorage | null = tabStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // ลบไม่ได้ก็ไม่เป็นไร ของที่ค้างจะหมดอายุเอง
  }
}

/** เก็บบทสนทนาปัจจุบันไว้ เรียกก่อนพาแท็บนี้ไปยังเว็บอื่น */
export function saveConversationSnapshot(
  snapshot: ConversationSnapshot,
  storage: SnapshotStorage | null = tabStorage(),
  now: number = Date.now()
): void {
  // ผ่านตัวอ่านเดียวกับตอนคืน เพื่อให้สิ่งที่เก็บตรงกับสิ่งที่จะรับกลับเสมอ
  const messages = readMessages(snapshot.messages);
  if (messages.length === 0) {
    clearConversationSnapshot(storage);
    return;
  }

  try {
    storage?.setItem(KEY, JSON.stringify({ savedAt: now, owner: snapshot.owner, messages }));
  } catch {
    // เก็บไม่ได้ (ที่เก็บเต็มหรือถูกปิด): ผู้ใช้แค่ไม่ได้บทสนทนาเดิมคืนตอนกลับมา
  }
}

/** คืนบทสนทนาที่เก็บไว้แล้วลบทิ้ง คืน null ถ้าไม่มี หมดอายุ หรืออ่านไม่ได้ */
export function takeConversationSnapshot(
  storage: SnapshotStorage | null = tabStorage(),
  now: number = Date.now()
): ConversationSnapshot | null {
  let raw: string | null;
  try {
    raw = storage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  clearConversationSnapshot(storage);

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(stored) || !Array.isArray(stored.messages)) return null;

  const { savedAt } = stored;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  const age = now - savedAt;
  if (age < 0 || age > SNAPSHOT_MAX_AGE_MS) return null;

  const messages = readMessages(stored.messages);
  if (messages.length === 0) return null;
  return { owner: typeof stored.owner === "string" ? stored.owner : null, messages };
}

/** undefined = ยังไม่ได้อ่านจากที่เก็บในการโหลดหน้าครั้งนี้ */
let taken: ConversationSnapshot | null | undefined;

/**
 * บทสนทนาที่เก็บไว้ก่อนออกจากหน้า สำหรับผู้ใช้คนนี้ คืนรายการว่างถ้าไม่มีหรือเป็นของผู้ใช้อื่น
 * อ่านจากที่เก็บครั้งเดียวต่อการโหลดหน้าหนึ่งครั้ง เรียกซ้ำได้ผลเดิม
 * (React เรียก effect ซ้ำในโหมดตรวจสอบ ซึ่งครั้งที่สองจะไม่เหลืออะไรในที่เก็บให้อ่าน)
 */
export function restoredConversation(owner: string | null): ConversationMessage[] {
  if (taken === undefined) taken = takeConversationSnapshot();
  return taken && taken.owner === owner ? taken.messages : [];
}
