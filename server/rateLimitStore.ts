import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from "express-rate-limit";
import { describeDbError, getDatabase, type Database } from "./db.js";

/** รอฐานข้อมูลไม่เกินนี้ เกินแล้วนับในหน่วยความจำแทน เพื่อไม่ให้ผู้ใช้รอเพราะฐานข้อมูลช้า */
const DB_TIMEOUT_MS = 1500;
/** โอกาสที่คำขอหนึ่งครั้งจะลบแถวที่หมดอายุแล้ว (ไม่ต้องมีงานตั้งเวลา) */
const CLEANUP_CHANCE = 0.01;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`database timeout ${ms}ms`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/**
 * ตัวนับของ express-rate-limit ที่เก็บใน Postgres: ทุก instance บน Vercel นับร่วมกัน และไม่รีเซ็ตเมื่อ instance ใหม่เริ่ม
 * ฐานข้อมูลล่มหรือช้า: ถอยไปนับในหน่วยความจำของ instance (แบบเดิม) ไม่ปิดกั้นผู้ใช้ และกลับมาใช้ฐานข้อมูลเองเมื่อใช้ได้
 */
export class PostgresRateLimitStore implements Store {
  /** คีย์ถูกนับร่วมกันข้าม instance */
  localKeys = false;
  readonly prefix: string;
  private windowMs = 60_000;
  private readonly fallback = new MemoryStore();
  private warned = false;

  constructor(
    private readonly db: Database,
    prefix: string,
    private readonly options: { timeoutMs?: number; random?: () => number } = {}
  ) {
    this.prefix = `rl:${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  private async run<T>(action: string, task: () => Promise<T>, onFallback: () => T | Promise<T>): Promise<T> {
    try {
      const result = await withTimeout(task(), this.options.timeoutMs ?? DB_TIMEOUT_MS);
      this.warned = false;
      return result;
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        console.warn(`ตัวจำกัดความถี่${action}ฐานข้อมูลไม่สำเร็จ นับในหน่วยความจำแทน`, describeDbError(error));
      }
      return onFallback();
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    return this.run(
      "อ่าน",
      async () => {
        const rows = await this.db.query("SELECT hits, reset_at FROM rate_limit_hits WHERE key = $1 AND reset_at > now()", [this.prefix + key]);
        return rows[0] ? toInfo(rows[0]) : undefined;
      },
      () => this.fallback.get(key)
    );
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    return this.run(
      "นับ",
      async () => {
        const rows = await this.db.query(
          `INSERT INTO rate_limit_hits (key, hits, reset_at) VALUES ($1, 1, now() + ($2::bigint * interval '1 millisecond'))
           ON CONFLICT (key) DO UPDATE SET
             hits = CASE WHEN rate_limit_hits.reset_at <= now() THEN 1 ELSE rate_limit_hits.hits + 1 END,
             reset_at = CASE WHEN rate_limit_hits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limit_hits.reset_at END
           RETURNING hits, reset_at`,
          [this.prefix + key, this.windowMs]
        );
        if ((this.options.random ?? Math.random)() < CLEANUP_CHANCE) {
          void this.db.query("DELETE FROM rate_limit_hits WHERE reset_at < now() - interval '1 hour'").catch(() => undefined);
        }
        const row = rows[0];
        if (!row) throw new Error("no row returned");
        return toInfo(row);
      },
      () => this.fallback.increment(key)
    );
  }

  async decrement(key: string): Promise<void> {
    await this.run(
      "ลดตัวนับใน",
      async () => {
        await this.db.query("UPDATE rate_limit_hits SET hits = GREATEST(hits - 1, 0) WHERE key = $1", [this.prefix + key]);
      },
      () => this.fallback.decrement(key)
    );
  }

  async resetKey(key: string): Promise<void> {
    this.fallback.resetKey(key);
    await this.run(
      "ล้างตัวนับใน",
      async () => {
        await this.db.query("DELETE FROM rate_limit_hits WHERE key = $1", [this.prefix + key]);
      },
      () => undefined
    );
  }

  shutdown(): void {
    this.fallback.shutdown();
  }
}

function toInfo(row: Record<string, unknown>): ClientRateLimitInfo {
  const resetAt = row.reset_at instanceof Date ? row.reset_at : new Date(String(row.reset_at));
  return { totalHits: Number(row.hits), resetTime: resetAt };
}

/**
 * ตัวนับของตัวจำกัดความถี่หนึ่งตัว: Postgres เมื่อมี DATABASE_URL ไม่อย่างนั้นใช้ MemoryStore ค่าเริ่มต้นของ express-rate-limit (คืน undefined)
 * แต่ละตัวจำกัดต้องมี store และ prefix ของตัวเอง
 */
export function rateLimitStore(prefix: string): Store | undefined {
  const db = getDatabase();
  return db ? new PostgresRateLimitStore(db, prefix) : undefined;
}
