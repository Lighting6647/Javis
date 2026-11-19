import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../db.js";
import { getJevTelemetry, listReviewQueue, resetJevTelemetry, routeVoiceTurn } from "./index.js";
import { createRouterPersistence } from "./persistence.js";
import { exportJevState, importJevState } from "./queueAndTelemetry.js";

/** ฐานข้อมูลจำลองที่เก็บแถว app_state ไว้ในหน่วยความจำ */
function fakeDb() {
  const table = new Map<string, unknown>();
  const state = { down: false };
  const db: Database = {
    query: async (text, params = []) => {
      if (state.down) throw new Error("down");
      if (text.startsWith("SELECT")) return table.has(String(params[0])) ? [{ data: table.get(String(params[0])) }] : [];
      table.set(String(params[0]), JSON.parse(String(params[1])));
      return [];
    }
  };
  return { db, table, state };
}

describe("export/import สถานะ JEV router", () => {
  afterEach(() => resetJevTelemetry());

  it("ส่งออกแล้วนำเข้าได้สถานะเดิม", () => {
    routeVoiceTurn({ goal: "ช่วยสรุปข่าววันนี้หน่อย" });
    routeVoiceTurn({ goal: "อืม" });
    const exported = exportJevState();
    resetJevTelemetry();
    expect(getJevTelemetry().decisions).toBe(0);
    expect(importJevState(JSON.parse(JSON.stringify(exported)))).toBe(true);
    expect(getJevTelemetry().decisions).toBe(2);
    expect(listReviewQueue()).toEqual(exported.reviewQueue);
  });

  it("ข้อมูลผิดรูปไม่ทำให้ router พัง", () => {
    expect(importJevState(null)).toBe(false);
    expect(importJevState({ version: 2 })).toBe(false);
    expect(importJevState({ version: 1, telemetry: { decisions: "x", queues: null }, reviewQueue: [{ id: "bad" }, { id: "rev_abcd1234", redactedGoal: "โทร 0812345678" }] })).toBe(true);
    expect(getJevTelemetry().decisions).toBe(0);
    expect(listReviewQueue().map((item) => item.redactedGoal)).toEqual(["โทร [phone]"]);
  });
});

describe("createRouterPersistence", () => {
  afterEach(() => {
    resetJevTelemetry();
    vi.restoreAllMocks();
  });

  it("บันทึกแล้ว instance ใหม่ (รีเซ็ต) โหลดกลับมาได้", async () => {
    const fake = fakeDb();
    const persistence = createRouterPersistence(() => fake.db);
    routeVoiceTurn({ goal: "เปิดเว็บข่าว" });
    await persistence.save();
    resetJevTelemetry();
    const fresh = createRouterPersistence(() => fake.db);
    await fresh.load();
    expect(getJevTelemetry().decisions).toBe(1);
  });

  it("โหลดครั้งเดียวต่อ instance เว้นแต่ขอโหลดใหม่", async () => {
    const fake = fakeDb();
    const persistence = createRouterPersistence(() => fake.db);
    await persistence.load();
    routeVoiceTurn({ goal: "ทดสอบ" });
    await persistence.load();
    expect(getJevTelemetry().decisions).toBe(1);
    await persistence.load(true);
    expect(getJevTelemetry().decisions).toBe(1);
  });

  it("ไม่มีฐานข้อมูล: ไม่ทำอะไร router ใช้หน่วยความจำต่อ", async () => {
    const persistence = createRouterPersistence(() => null);
    routeVoiceTurn({ goal: "ทดสอบ" });
    await persistence.save();
    await persistence.load(true);
    expect(persistence.enabled()).toBe(false);
    expect(getJevTelemetry().decisions).toBe(1);
  });

  it("ฐานข้อมูลล่ม: ไม่โยนข้อผิดพลาด และสถานะในหน่วยความจำยังอยู่", async () => {
    const fake = fakeDb();
    fake.state.down = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const persistence = createRouterPersistence(() => fake.db);
    routeVoiceTurn({ goal: "ทดสอบ" });
    await expect(persistence.save()).resolves.toBeUndefined();
    await expect(persistence.load(true)).resolves.toBeUndefined();
    expect(getJevTelemetry().decisions).toBe(1);
  });
});
