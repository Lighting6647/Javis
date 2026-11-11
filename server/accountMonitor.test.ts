import { describe, expect, it } from "vitest";
import { createOnDemandCheck } from "./accountMonitor.js";

/** สภาพแวดล้อมจำลอง: นับจำนวนรอบที่ตรวจ และควบคุมเวลากับผลการตรวจได้ */
function setup(recheckMs = 300_000) {
  const state = { runs: 0, healthy: false, time: 1_000_000, release: null as (() => void) | null, hold: false, fail: false };
  const check = createOnDemandCheck({
    run: () => {
      state.runs += 1;
      if (state.fail) return Promise.reject(new Error("upstream down"));
      if (!state.hold) return Promise.resolve();
      return new Promise<void>((resolve) => {
        state.release = resolve;
      });
    },
    isHealthy: () => state.healthy,
    recheckMs,
    now: () => state.time
  });
  return { state, check };
}

describe("createOnDemandCheck", () => {
  it("ตรวจครั้งแรกที่มีคนถามสถานะ", async () => {
    const { state, check } = setup();
    await check();
    expect(state.runs).toBe(1);
  });

  it("ตอนปกติไม่ตรวจซ้ำ ไม่ว่าจะถามกี่ครั้งหรือนานแค่ไหน", async () => {
    const { state, check } = setup();
    state.healthy = true;
    await check();
    state.time += 24 * 3_600_000;
    await check();
    await check();
    expect(state.runs).toBe(1);
  });

  it("ระหว่างที่มีปัญหา ตรวจซ้ำได้ถี่สุดตามช่วงที่กำหนด", async () => {
    const { state, check } = setup(300_000);
    await check();
    state.time += 299_000;
    await check();
    expect(state.runs).toBe(1);

    state.time += 1_000;
    await check();
    expect(state.runs).toBe(2);
  });

  it("หลังกลับมาปกติแล้วหยุดตรวจ", async () => {
    const { state, check } = setup(300_000);
    await check();
    state.time += 300_000;
    state.healthy = true;
    await check();
    expect(state.runs).toBe(1);
  });

  it("คำถามที่เข้ามาพร้อมกันรอผลของการตรวจรอบเดียว", async () => {
    const { state, check } = setup();
    state.hold = true;
    const waiting = [check(), check(), check()];
    expect(state.runs).toBe(1);

    state.release?.();
    await Promise.all(waiting);
    expect(state.runs).toBe(1);
  });

  it("การตรวจที่ล้มเหลวไม่ทำให้ตรวจรัว ๆ ในทุกคำถามถัดไป", async () => {
    const { state, check } = setup(300_000);
    state.fail = true;
    await expect(check()).rejects.toThrow("upstream down");
    await check();
    expect(state.runs).toBe(1);

    state.time += 300_000;
    state.fail = false;
    await check();
    expect(state.runs).toBe(2);
  });
});
