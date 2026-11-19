import express from "express";
import { rateLimit, type Options } from "express-rate-limit";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "./db.js";
import { PostgresRateLimitStore } from "./rateLimitStore.js";

/**
 * ฐานข้อมูลจำลองที่ทำงานเหมือนตาราง rate_limit_hits จริงพอสำหรับทดสอบ (นับ หมดอายุ ลด ลบ)
 * down = true จำลองฐานข้อมูลล่ม
 */
function fakeDb(clock: () => number) {
  const rows = new Map<string, { hits: number; resetAt: number }>();
  const state = { down: false, hang: false, queries: 0 };
  const db: Database = {
    query: async (text, params = []) => {
      state.queries += 1;
      if (state.hang) return new Promise(() => undefined);
      if (state.down) throw new Error("connect ECONNREFUSED postgres://u:secret@host/db");
      const key = String(params[0]);
      const row = rows.get(key);
      if (text.startsWith("INSERT")) {
        const now = clock();
        const next = !row || row.resetAt <= now ? { hits: 1, resetAt: now + Number(params[1]) } : { hits: row.hits + 1, resetAt: row.resetAt };
        rows.set(key, next);
        return [{ hits: next.hits, reset_at: new Date(next.resetAt) }];
      }
      if (text.startsWith("SELECT")) return row && row.resetAt > clock() ? [{ hits: row.hits, reset_at: new Date(row.resetAt) }] : [];
      if (text.startsWith("UPDATE") && row) row.hits = Math.max(0, row.hits - 1);
      if (text.startsWith("DELETE") && params.length > 0) rows.delete(key);
      return [];
    }
  };
  return { db, rows, state };
}

const initOptions = { windowMs: 60_000 } as Options;

describe("PostgresRateLimitStore", () => {
  afterEach(() => vi.restoreAllMocks());

  it("นับร่วมกันผ่านฐานข้อมูล และเริ่มใหม่เมื่อหมดช่วงเวลา", async () => {
    let now = 1_000_000;
    const fake = fakeDb(() => now);
    const a = new PostgresRateLimitStore(fake.db, "chat", { random: () => 1 });
    const b = new PostgresRateLimitStore(fake.db, "chat", { random: () => 1 });
    a.init(initOptions);
    b.init(initOptions);
    expect((await a.increment("user:light")).totalHits).toBe(1);
    // instance อื่นเห็นตัวนับเดียวกัน
    expect((await b.increment("user:light")).totalHits).toBe(2);
    expect((await a.get("user:light"))?.totalHits).toBe(2);
    now += 60_001;
    expect((await b.increment("user:light")).totalHits).toBe(1);
    expect([...fake.rows.keys()]).toEqual(["rl:chat:user:light"]);
  });

  it("ลดและล้างตัวนับได้", async () => {
    const fake = fakeDb(() => 0);
    const store = new PostgresRateLimitStore(fake.db, "login", { random: () => 1 });
    store.init(initOptions);
    await store.increment("ip");
    await store.increment("ip");
    await store.decrement("ip");
    expect((await store.get("ip"))?.totalHits).toBe(1);
    await store.resetKey("ip");
    expect(await store.get("ip")).toBeUndefined();
  });

  it("ฐานข้อมูลล่ม: นับในหน่วยความจำแทน เตือนครั้งเดียวโดยไม่มีรหัสผ่าน และกลับมาใช้ฐานข้อมูลเมื่อใช้ได้", async () => {
    const fake = fakeDb(() => 0);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new PostgresRateLimitStore(fake.db, "chat", { random: () => 1 });
    store.init(initOptions);
    fake.state.down = true;
    expect((await store.increment("k")).totalHits).toBe(1);
    expect((await store.increment("k")).totalHits).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[1])).not.toContain("secret");
    fake.state.down = false;
    expect((await store.increment("k")).totalHits).toBe(1);
    store.shutdown();
  });

  it("ฐานข้อมูลค้าง: ไม่รอเกินกำหนด นับในหน่วยความจำแทน", async () => {
    const fake = fakeDb(() => 0);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new PostgresRateLimitStore(fake.db, "chat", { timeoutMs: 20, random: () => 1 });
    store.init(initOptions);
    fake.state.hang = true;
    const started = Date.now();
    expect((await store.increment("k")).totalHits).toBe(1);
    expect(Date.now() - started).toBeLessThan(1000);
    store.shutdown();
  });

  it("ใช้กับ express-rate-limit ได้จริง: เกินเพดานได้ 429 และฐานข้อมูลล่มไม่ปิดกั้นผู้ใช้", async () => {
    const fake = fakeDb(() => Date.now());
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, limit: 2, store: new PostgresRateLimitStore(fake.db, "test", { random: () => 1 }) }));
    app.get("/", (_request, response) => {
      response.send("ok");
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    try {
      const statuses = [];
      for (let index = 0; index < 3; index += 1) statuses.push((await fetch(url)).status);
      expect(statuses).toEqual([200, 200, 429]);
      fake.state.down = true;
      // ฐานข้อมูลล่ม: ตัวนับในหน่วยความจำเริ่มใหม่ ผู้ใช้ยังใช้งานได้
      expect((await fetch(url)).status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
