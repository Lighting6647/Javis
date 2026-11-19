import { neon } from "@neondatabase/serverless";

/** รันคำสั่ง SQL หนึ่งคำสั่งพร้อมพารามิเตอร์ $1, $2, ... คืนแถวผลลัพธ์ */
export type SqlQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/**
 * ตารางทั้งหมดที่เซิร์ฟเวอร์ใช้ สร้างเองครั้งแรกที่ต่อฐานข้อมูล (IF NOT EXISTS จึงรันซ้ำได้ปลอดภัย)
 * - user_documents: ข้อมูลรายผู้ใช้ที่เก็บเป็นก้อน JSON ต่อชนิด (ความจำ ประวัติประชุม)
 * - feedback: คำติชม 👍/👎 ของแต่ละคำตอบ
 * - app_state: สถานะรวมของเซิร์ฟเวอร์ (คิวรออนุมัติและ telemetry ของ JEV router)
 * - rate_limit_hits: ตัวนับจำนวนคำขอของ express-rate-limit
 */
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS user_documents (
    user_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_name, kind)
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY,
    user_name TEXT NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    note TEXT NOT NULL DEFAULT '',
    reply TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at)`,
  `CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limit_hits (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL,
    reset_at TIMESTAMPTZ NOT NULL
  )`
];

/** ตัวต่อฐานข้อมูลพร้อมสร้างตารางครั้งเดียวต่อ instance */
export interface Database {
  query: SqlQuery;
}

/**
 * ห่อคำสั่ง SQL ให้สร้างตารางก่อนใช้ครั้งแรก ถ้าสร้างไม่สำเร็จ (ฐานข้อมูลล่ม) ครั้งถัดไปจะลองใหม่
 */
export function createDatabase(run: SqlQuery): Database {
  let ready: Promise<void> | null = null;
  const ensureSchema = () => {
    ready ??= (async () => {
      for (const statement of SCHEMA_STATEMENTS) await run(statement);
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    });
    return ready;
  };
  return {
    query: async (text, params = []) => {
      await ensureSchema();
      return run(text, params);
    }
  };
}

let shared: Database | null | undefined;

/**
 * ฐานข้อมูลของเซิร์ฟเวอร์จาก DATABASE_URL (Neon/Postgres ผ่าน HTTP ใช้ได้ทั้งบน Vercel และเครื่องที่รันค้าง)
 * คืน null เมื่อไม่ได้ตั้งค่า ผู้เรียกต้องถอยไปเก็บในหน่วยความจำ
 */
export function getDatabase(env: NodeJS.ProcessEnv = process.env): Database | null {
  if (shared !== undefined) return shared;
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    shared = null;
    return shared;
  }
  const sql = neon(url);
  shared = createDatabase((text, params) => sql.query(text, params) as Promise<Record<string, unknown>[]>);
  return shared;
}

/** ข้อความสั้นของข้อผิดพลาดสำหรับ log โดยไม่มีที่อยู่หรือรหัสผ่านของฐานข้อมูล */
export function describeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown";
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[database-url]").slice(0, 200);
}
