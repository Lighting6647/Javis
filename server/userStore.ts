import { describeDbError, getDatabase, type Database } from "./db.js";
import { cleanMemoryText, isSensitiveMemory, MAX_MEMORY_LENGTH } from "./responseStream.js";

/** ต้องตรงกับเพดานของหน้าเว็บ (src/memory/memoryStore.ts) และของ /api/chat */
export const MAX_STORED_MEMORIES = 50;
export const MEMORY_ID_PATTERN = /^m[a-z0-9]{1,12}$/;
/** ผู้ใช้ที่ไม่ได้เข้าสู่ระบบ (เซิร์ฟเวอร์ไม่บังคับล็อกอิน) ใช้ช่องเก็บร่วม ตรงกับหน้าเว็บ */
export const ANONYMOUS_USER = "_";
export const MAX_FEEDBACK_NOTE = 500;
export const MAX_FEEDBACK_REPLY = 600;
export const MAX_SUMMARY_DAYS = 90;

export type StorageKind = "postgres" | "memory";

export interface StoredMemory {
  id: string;
  text: string;
  createdAt: number;
}

export type FeedbackRating = "up" | "down";

export interface FeedbackInput {
  rating: FeedbackRating;
  note?: string;
  /** ข้อความคำตอบของเดลลูน่าที่ถูกติชม (ตัดให้สั้น) ใช้วิเคราะห์ใน npm run learn */
  reply?: string;
}

export interface FeedbackRecord {
  user: string;
  rating: FeedbackRating;
  note: string;
  reply: string;
  createdAt: number;
}

export interface FeedbackSummary {
  days: number;
  total: number;
  up: number;
  down: number;
  /** สัดส่วน 👍 ต่อทั้งหมด (0–1) หรือ null เมื่อยังไม่มีคำติชม */
  upRatio: number | null;
  byDay: Array<{ date: string; up: number; down: number }>;
  /** หมายเหตุของ 👎 ล่าสุด สูงสุด 10 รายการ */
  recentDownNotes: Array<{ note: string; createdAt: number }>;
}

export interface MemorySaveResult {
  memories: StoredMemory[];
  /** จำนวนเรื่องที่ไม่บันทึกเพราะเป็นข้อมูลอ่อนไหว (รหัสผ่าน OTP เลขบัตร/เลขประจำตัว) */
  rejected: number;
}

/** ประวัติสรุปการประชุมหนึ่งครั้ง (รูปแบบเดียวกับ javis.meetingHistory ในหน้าเว็บ) */
export interface StoredMeeting {
  id: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  summary: string;
  transcript: string;
}

export const MAX_STORED_MEETINGS = 15;
export const MAX_MEETING_SUMMARY = 4000;
/** บันทึกคำพูดเต็มอยู่ในเครื่อง เซิร์ฟเวอร์เก็บส่วนต้นพอให้ค้นและอ่านทวนได้ */
export const MAX_MEETING_TRANSCRIPT = 20_000;
const MEETING_ID_PATTERN = /^mtg-[A-Za-z0-9_-]{1,40}$/;
/** อักขระควบคุมยกเว้นขึ้นบรรทัดใหม่และแท็บ (บันทึกคำพูดมีหลายบรรทัด) */
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface UserStore {
  readonly kind: StorageKind;
  getMemories(user: string): Promise<StoredMemory[]>;
  putMemories(user: string, items: unknown): Promise<MemorySaveResult>;
  getMeetings(user: string): Promise<StoredMeeting[]>;
  putMeetings(user: string, items: unknown): Promise<StoredMeeting[]>;
  addFeedback(user: string, input: FeedbackInput): Promise<FeedbackRecord>;
  /** คำติชมย้อนหลัง user = null คือทุกผู้ใช้ (ใช้ในสคริปต์ npm run learn) */
  listFeedback(options: { user: string | null; days: number; rating?: FeedbackRating }): Promise<FeedbackRecord[]>;
}

/** ตัดอักขระควบคุมและปิดบังข้อมูลอ่อนไหวในข้อความอิสระก่อนเก็บ */
export function redactFreeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\d[\d\s-]{11,}\d/g, (match) => (match.replace(/[\s-]/g, "").length >= 13 ? "[number]" : match))
    .replace(/\b0\d{8,9}\b/g, "[phone]")
    .replace(/\b(?:sk-|AIza)[A-Za-z0-9_-]{8,}\b/g, "[secret]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * ทำรายการความจำที่รับมาให้ปลอดภัยตามกฎเดิม: รหัสถูกรูปแบบ ข้อความไม่เกิน 200 ตัวอักษร ไม่ซ้ำ
 * ไม่เกิน 50 เรื่อง (เก็บเรื่องล่าสุด) และไม่เก็บรหัสผ่าน OTP หรือเลขยาวตั้งแต่ 13 หลัก
 */
export function sanitizeStoredMemories(value: unknown): MemorySaveResult {
  if (!Array.isArray(value)) return { memories: [], rejected: 0 };
  const memories: StoredMemory[] = [];
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  let rejected = 0;

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const { id, text, createdAt } = raw as Record<string, unknown>;
    const clean = cleanMemoryText(text);
    if (typeof id !== "string" || !MEMORY_ID_PATTERN.test(id) || !clean) continue;
    if (isSensitiveMemory(clean)) {
      rejected += 1;
      continue;
    }
    const key = clean.toLowerCase();
    if (seenIds.has(id) || seenTexts.has(key)) continue;
    seenIds.add(id);
    seenTexts.add(key);
    memories.push({
      id,
      text: clean.slice(0, MAX_MEMORY_LENGTH),
      createdAt: typeof createdAt === "number" && Number.isFinite(createdAt) ? createdAt : 0
    });
  }
  return { memories: memories.slice(-MAX_STORED_MEMORIES), rejected };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** ทำประวัติประชุมให้ปลอดภัย: รูปแบบถูกต้อง ไม่ซ้ำ ใหม่สุดก่อน ไม่เกิน 15 ครั้ง และตัดความยาว */
export function sanitizeStoredMeetings(value: unknown): StoredMeeting[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, StoredMeeting>();
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const { id, startedAt, endedAt, minutes, summary, transcript } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !MEETING_ID_PATTERN.test(id) || !finite(startedAt) || !finite(minutes)) continue;
    const cleanSummary = typeof summary === "string" ? summary.replace(CONTROL_EXCEPT_NEWLINE, "").trim().slice(0, MAX_MEETING_SUMMARY) : "";
    if (!cleanSummary || byId.has(id)) continue;
    byId.set(id, {
      id,
      startedAt,
      endedAt: finite(endedAt) ? endedAt : startedAt,
      minutes: Math.min(Math.max(0, Math.round(minutes)), 1440),
      summary: cleanSummary,
      transcript: typeof transcript === "string" ? transcript.replace(CONTROL_EXCEPT_NEWLINE, "").trim().slice(0, MAX_MEETING_TRANSCRIPT) : ""
    });
  }
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_STORED_MEETINGS);
}

/** ชื่อผู้ใช้สำหรับแยกข้อมูล: ชื่อที่เข้าสู่ระบบ หรือช่องร่วมเมื่อเซิร์ฟเวอร์ไม่บังคับล็อกอิน */
export function ownerOf(userName: unknown): string {
  return typeof userName === "string" && userName ? userName : ANONYMOUS_USER;
}

function cleanFeedback(user: string, input: FeedbackInput, createdAt: number): FeedbackRecord {
  return {
    user,
    rating: input.rating,
    note: redactFreeText(input.note, MAX_FEEDBACK_NOTE),
    reply: redactFreeText(input.reply, MAX_FEEDBACK_REPLY),
    createdAt
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function clampDays(value: unknown, fallback = 7): number {
  const days = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(days) || days < 1) return fallback;
  return Math.min(Math.floor(days), MAX_SUMMARY_DAYS);
}

/** สรุปคำติชมเป็นรายวัน (ตามเวลาไทย) และหมายเหตุของ 👎 ล่าสุด */
export function summarizeFeedback(records: FeedbackRecord[], days: number): FeedbackSummary {
  const up = records.filter((record) => record.rating === "up").length;
  const down = records.length - up;
  const perDay = new Map<string, { up: number; down: number }>();
  for (const record of records) {
    // วันที่ตามเวลาประเทศไทย (UTC+7) เพื่อให้ตรงกับวันที่ผู้ใช้เห็น
    const date = new Date(record.createdAt + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const bucket = perDay.get(date) ?? { up: 0, down: 0 };
    bucket[record.rating] += 1;
    perDay.set(date, bucket);
  }
  return {
    days,
    total: records.length,
    up,
    down,
    upRatio: records.length > 0 ? Number((up / records.length).toFixed(3)) : null,
    byDay: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({ date, ...counts })),
    recentDownNotes: records
      .filter((record) => record.rating === "down" && record.note)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((record) => ({ note: record.note, createdAt: record.createdAt }))
  };
}

/** เก็บในหน่วยความจำของกระบวนการ: ระบบเดิมเมื่อไม่มี DATABASE_URL (หายเมื่อรีสตาร์ต) */
export function createMemoryUserStore(now: () => number = Date.now): UserStore {
  const memories = new Map<string, StoredMemory[]>();
  const meetings = new Map<string, StoredMeeting[]>();
  const feedback: FeedbackRecord[] = [];
  const MAX_FEEDBACK_IN_MEMORY = 2000;

  return {
    kind: "memory",
    getMemories: async (user) => [...(memories.get(user) ?? [])],
    putMemories: async (user, items) => {
      const result = sanitizeStoredMemories(items);
      memories.set(user, result.memories);
      return { memories: [...result.memories], rejected: result.rejected };
    },
    getMeetings: async (user) => [...(meetings.get(user) ?? [])],
    putMeetings: async (user, items) => {
      const clean = sanitizeStoredMeetings(items);
      meetings.set(user, clean);
      return [...clean];
    },
    addFeedback: async (user, input) => {
      const record = cleanFeedback(user, input, now());
      feedback.push(record);
      if (feedback.length > MAX_FEEDBACK_IN_MEMORY) feedback.splice(0, feedback.length - MAX_FEEDBACK_IN_MEMORY);
      return { ...record };
    },
    listFeedback: async ({ user, days, rating }) => {
      const since = now() - days * DAY_MS;
      return feedback
        .filter((record) => record.createdAt >= since)
        .filter((record) => user === null || record.user === user)
        .filter((record) => !rating || record.rating === rating)
        .map((record) => ({ ...record }));
    }
  };
}

const toMillis = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") return new Date(value).getTime();
  return 0;
};

/** เก็บใน Postgres: ข้อมูลอยู่ถาวร ใช้ร่วมกันได้ทุก instance และทุกอุปกรณ์ของผู้ใช้คนเดียวกัน */
export function createPostgresUserStore(db: Database, now: () => number = Date.now): UserStore {
  const readDocument = async (user: string, kind: string): Promise<unknown> => {
    const rows = await db.query("SELECT data FROM user_documents WHERE user_name = $1 AND kind = $2", [user, kind]);
    return rows[0]?.data ?? null;
  };
  const writeDocument = async (user: string, kind: string, data: unknown): Promise<void> => {
    await db.query(
      `INSERT INTO user_documents (user_name, kind, data, updated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (user_name, kind) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [user, kind, JSON.stringify(data)]
    );
  };

  return {
    kind: "postgres",
    getMemories: async (user) => sanitizeStoredMemories(await readDocument(user, "memories")).memories,
    putMemories: async (user, items) => {
      const result = sanitizeStoredMemories(items);
      await writeDocument(user, "memories", result.memories);
      return result;
    },
    getMeetings: async (user) => sanitizeStoredMeetings(await readDocument(user, "meetings")),
    putMeetings: async (user, items) => {
      const clean = sanitizeStoredMeetings(items);
      await writeDocument(user, "meetings", clean);
      return clean;
    },
    addFeedback: async (user, input) => {
      const record = cleanFeedback(user, input, now());
      await db.query(
        "INSERT INTO feedback (user_name, rating, note, reply, created_at) VALUES ($1, $2, $3, $4, $5)",
        [record.user, record.rating, record.note, record.reply, new Date(record.createdAt).toISOString()]
      );
      return record;
    },
    listFeedback: async ({ user, days, rating }) => {
      const since = new Date(now() - days * DAY_MS).toISOString();
      const rows = await db.query(
        `SELECT user_name, rating, note, reply, created_at FROM feedback
         WHERE created_at >= $1 AND ($2::text IS NULL OR user_name = $2) AND ($3::text IS NULL OR rating = $3)
         ORDER BY created_at DESC LIMIT 5000`,
        [since, user, rating ?? null]
      );
      return rows.map((row) => ({
        user: String(row.user_name ?? ""),
        rating: row.rating === "up" ? "up" : "down",
        note: String(row.note ?? ""),
        reply: String(row.reply ?? ""),
        createdAt: toMillis(row.created_at)
      }));
    }
  };
}

let shared: UserStore | null = null;

/** ที่เก็บของเซิร์ฟเวอร์: Postgres เมื่อตั้ง DATABASE_URL ไม่อย่างนั้นเก็บในหน่วยความจำเหมือนเดิม */
export function getUserStore(): UserStore {
  if (shared) return shared;
  const db = getDatabase();
  shared = db ? createPostgresUserStore(db) : createMemoryUserStore();
  return shared;
}

/** ใช้ในเทสต์เพื่อสลับที่เก็บ */
export function setUserStoreForTests(store: UserStore | null): void {
  shared = store;
}

export { describeDbError };
