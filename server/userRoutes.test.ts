import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createMemoryUserStore, setUserStoreForTests, type UserStore } from "./userStore.js";

// ไม่บังคับเข้าสู่ระบบ ไม่มีฐานข้อมูล และไม่มีกุญแจ AI: ไม่มีคำขอใดออกไปข้างนอก
vi.hoisted(() => {
  for (const name of ["ACCESS_CODES", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "DATABASE_URL"]) process.env[name] = "";
});

describe("API ความจำและคำติชมบนเซิร์ฟเวอร์", () => {
  let origin = "";
  let close: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  });
  afterAll(() => close());
  afterEach(() => setUserStoreForTests(null));

  const send = (path: string, method: string, body?: unknown) =>
    fetch(`${origin}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

  it("/api/status บอกว่าใช้ที่เก็บแบบหน่วยความจำเมื่อไม่มี DATABASE_URL", async () => {
    const status = (await (await fetch(`${origin}/api/status`)).json()) as { storage?: string };
    expect(status.storage).toBe("memory");
  });

  it("PUT แล้ว GET /api/memories ได้รายการเดิม โดยไม่จำข้อมูลอ่อนไหว", async () => {
    setUserStoreForTests(createMemoryUserStore());
    const put = await send("/api/memories", "PUT", {
      memories: [
        { id: "m1", text: "ผู้ใช้ชื่อไลท์", createdAt: 1 },
        { id: "m2", text: "OTP คือ 123456", createdAt: 2 }
      ]
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ rejected: 1, storage: "memory" });

    const get = (await (await send("/api/memories", "GET")).json()) as { memories: unknown[] };
    expect(get.memories).toEqual([{ id: "m1", text: "ผู้ใช้ชื่อไลท์", createdAt: 1 }]);
  });

  it("ปฏิเสธเกิน 50 เรื่อง", async () => {
    const memories = Array.from({ length: 51 }, (_, index) => ({ id: `m${index}x`, text: `เรื่อง ${index}` }));
    expect((await send("/api/memories", "PUT", { memories })).status).toBe(400);
  });

  it("ปฏิเสธรูปแบบที่ไม่ใช่รายการ", async () => {
    expect((await send("/api/memories", "PUT", { memories: "x" })).status).toBe(400);
  });

  it("POST /api/feedback แล้วสรุปได้", async () => {
    setUserStoreForTests(createMemoryUserStore());
    expect((await send("/api/feedback", "POST", { rating: "up" })).status).toBe(201);
    expect((await send("/api/feedback", "POST", { rating: "down", note: "ตอบยาวเกินไป" })).status).toBe(201);

    const body = (await (await send("/api/feedback/summary?days=7", "GET")).json()) as {
      summary: { total: number; up: number; down: number; recentDownNotes: Array<{ note: string }> };
    };
    expect(body.summary).toMatchObject({ total: 2, up: 1, down: 1 });
    expect(body.summary.recentDownNotes.map((item) => item.note)).toEqual(["ตอบยาวเกินไป"]);
  });

  it("ปฏิเสธคำติชมที่ไม่ใช่ up/down", async () => {
    expect((await send("/api/feedback", "POST", { rating: "meh" })).status).toBe(400);
  });

  it("ที่เก็บขัดข้องตอบ 503 พร้อมข้อความภาษาไทย ไม่ทำให้เซิร์ฟเวอร์ล้ม", async () => {
    const broken: UserStore = {
      kind: "postgres",
      getMemories: () => Promise.reject(new Error("connect failed postgres://user:pw@host/db")),
      putMemories: () => Promise.reject(new Error("down")),
      addFeedback: () => Promise.reject(new Error("down")),
      listFeedback: () => Promise.reject(new Error("down"))
    };
    setUserStoreForTests(broken);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await send("/api/memories", "GET");
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toContain("ขัดข้อง");
    expect(String(warn.mock.calls[0]?.[1])).not.toContain("pw@");
    warn.mockRestore();
  });
});
