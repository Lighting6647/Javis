import { describe, expect, it, vi } from "vitest";
import { checkOnce, checkWithRetries, evaluateHealth } from "./uptime-check.mjs";

const HEALTHY_BODY = {
  ok: true,
  service: "javis-voice-agent",
  ai: { status: "ok", chat: "ok", transcribe: "unsupported", checkedAt: "2026-11-15T01:07:19.405Z" }
};

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("evaluateHealth", () => {
  it("นับว่าปกติเมื่อเซิร์ฟเวอร์ตอบ ok และบัญชี AI ใช้ได้ แม้ถอดเสียงจะไม่รองรับ", () => {
    expect(evaluateHealth(200, HEALTHY_BODY)).toEqual({ healthy: true, reason: "ใช้งานได้ปกติ" });
  });

  it("ยังไม่ได้ตรวจบัญชี AI (unknown) ไม่นับว่าล่ม", () => {
    expect(evaluateHealth(200, { ok: true, ai: { status: "unknown", chat: "unchecked" } }).healthy).toBe(true);
  });

  it("แจ้งรหัส HTTP เมื่อไม่ได้ 200", () => {
    expect(evaluateHealth(404, null)).toEqual({ healthy: false, reason: "/health ตอบ HTTP 404" });
    expect(evaluateHealth(500, HEALTHY_BODY).healthy).toBe(false);
  });

  it("คำตอบที่ไม่มี ok: true นับว่าล่ม", () => {
    for (const body of [null, "ok", [], { ok: "true" }, { ok: false }]) {
      expect(evaluateHealth(200, body)).toEqual({ healthy: false, reason: "/health ไม่ได้ตอบ ok: true" });
    }
  });

  it("บอกบริการ AI ที่มีปัญหาเมื่อสถานะเป็น degraded", () => {
    const result = evaluateHealth(200, { ok: true, ai: { status: "degraded", chat: "quota", transcribe: "auth" } });
    expect(result).toEqual({
      healthy: false,
      reason: "บัญชี AI มีปัญหา (chat: โควตาหรือเครดิตหมด, transcribe: กุญแจ API ใช้ไม่ได้)"
    });
  });

  it("ไม่ส่งต่อค่าแปลก ๆ จากคำตอบไปในเหตุผล", () => {
    const result = evaluateHealth(200, { ok: true, ai: { status: "degraded", chat: "<script>", transcribe: "constructor" } });
    expect(result).toEqual({ healthy: false, reason: "บัญชี AI มีปัญหา" });
  });
});

describe("checkOnce", () => {
  it("อ่านคำตอบ JSON แล้วประเมินผล", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, HEALTHY_BODY));
    await expect(checkOnce("https://example.test/health", { fetchImpl })).resolves.toEqual({ healthy: true, reason: "ใช้งานได้ปกติ" });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/health", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("คำตอบที่ไม่ใช่ JSON ไม่ทำให้สคริปต์พัง", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>404</html>", { status: 404 }));
    await expect(checkOnce("https://example.test/health", { fetchImpl })).resolves.toEqual({
      healthy: false,
      reason: "/health ตอบ HTTP 404"
    });
  });

  it("เครือข่ายขัดข้องรายงานรหัสสาเหตุ", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }));
    await expect(checkOnce("https://example.test/health", { fetchImpl })).resolves.toEqual({
      healthy: false,
      reason: "เชื่อมต่อ /health ไม่ได้ (ENOTFOUND)"
    });
  });

  it("หมดเวลารอรายงานเป็นวินาที", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(checkOnce("https://example.test/health", { fetchImpl, timeoutMs: 20_000 })).resolves.toEqual({
      healthy: false,
      reason: "เชื่อมต่อ /health ไม่ได้ (ไม่ตอบภายใน 20 วินาที)"
    });
  });
});

describe("checkWithRetries", () => {
  const down = { healthy: false, reason: "/health ตอบ HTTP 502" };
  const up = { healthy: true, reason: "ใช้งานได้ปกติ" };

  it("หยุดลองทันทีที่ผ่าน", async () => {
    const check = vi.fn().mockResolvedValueOnce(down).mockResolvedValueOnce(up);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(checkWithRetries("u", { check, sleep, attempts: 3 })).resolves.toEqual({ ...up, attempts: 2 });
    expect(check).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("สรุปว่าล่มเมื่อไม่ผ่านครบทุกครั้ง โดยไม่รอหลังครั้งสุดท้าย", async () => {
    const check = vi.fn().mockResolvedValue(down);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(checkWithRetries("u", { check, sleep, attempts: 3, retryDelayMs: 5 })).resolves.toEqual({ ...down, attempts: 3 });
    expect(check).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });
});
