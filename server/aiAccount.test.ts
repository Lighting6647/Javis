import { describe, expect, it } from "vitest";
import { createAiAccountStatus, describeAccountCheck, runAccountCheck, type AccountCheckResult } from "./aiAccount.js";

const BASE = "https://ai.test/v1";
const QUOTA_BODY = { error: { type: "insufficient_quota", code: "credit_balance_exhausted", message: "no credits" } };

type Reply = { status: number; body?: unknown } | Error;

/** ต้นทางจำลอง: ตอบตามเส้นทางที่ถูกเรียก และจดคำขอไว้ให้ตรวจ */
function fakeUpstream(replies: Record<string, Reply>) {
  const calls: Array<{ url: string; method: string; authorization: string | null; body: unknown }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? "GET",
      authorization: headers.get("authorization"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null
    });

    const reply = replies[url.slice(BASE.length)];
    if (!reply) return new Response(JSON.stringify({ error: { code: "not_mocked" } }), { status: 500 });
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  };

  return { fetchImpl, calls };
}

const HEALTHY: Record<string, Reply> = {
  "/models/chat-model": { status: 200, body: { id: "chat-model", shutdown_date: null } },
  "/models/speech-model": { status: 200, body: { id: "speech-model", shutdown_date: null } },
  "/responses": { status: 200, body: { status: "completed", output: [] } }
};

function check(replies: Record<string, Reply>, overrides: Partial<Parameters<typeof runAccountCheck>[0]> = {}) {
  const upstream = fakeUpstream(replies);
  const result = runAccountCheck({
    baseUrl: BASE,
    apiKey: "test-key",
    chatModel: "chat-model",
    transcribeModel: "speech-model",
    creditCheck: true,
    fetchImpl: upstream.fetchImpl,
    ...overrides
  });
  return { result, calls: upstream.calls };
}

describe("runAccountCheck", () => {
  it("บัญชีปกติ: กุญแจ โมเดล และเครดิตผ่านทั้งหมด", async () => {
    const { result, calls } = check(HEALTHY);
    expect(await result).toEqual({ chat: "ok", transcribe: "ok", credits: "ok", retiring: [] });
    expect(calls.every((call) => call.authorization === "Bearer test-key")).toBe(true);
  });

  it("ตรวจเครดิตด้วยคำขอที่เล็กที่สุดและไม่ให้ต้นทางเก็บข้อมูล", async () => {
    const { result, calls } = check(HEALTHY);
    await result;
    const probe = calls.find((call) => call.method === "POST");
    expect(probe?.body).toEqual({ model: "chat-model", input: "ping", max_output_tokens: 16, store: false });
  });

  it("ไม่ได้ตั้งกุญแจ API: ไม่ติดต่อต้นทางเลย", async () => {
    const { result, calls } = check(HEALTHY, { apiKey: undefined });
    expect(await result).toMatchObject({ chat: "auth", transcribe: "auth" });
    expect(calls).toHaveLength(0);
  });

  it("กุญแจ API ถูกปฏิเสธ: ทุกบริการใช้ไม่ได้ และไม่ส่งคำขอตรวจเครดิต", async () => {
    const rejected = { status: 401, body: { error: { code: "invalid_api_key" } } };
    const { result, calls } = check({ "/models/chat-model": rejected, "/models/speech-model": rejected });
    expect(await result).toMatchObject({ chat: "auth", transcribe: "auth", credits: "unverified" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("เครดิตหมด (รูปแบบจริง: 429 พร้อมรหัส insufficient_quota) กระทบทั้งสองบริการ", async () => {
    const { result } = check({ ...HEALTHY, "/responses": { status: 429, body: QUOTA_BODY } });
    expect(await result).toMatchObject({ chat: "quota", transcribe: "quota", credits: "exhausted" });
  });

  it("เครดิตหมดแบบตอบ 200 แล้วแจ้งล้มเหลวในเนื้อหา", async () => {
    const { result } = check({ ...HEALTHY, "/responses": { status: 200, body: { status: "failed", ...QUOTA_BODY } } });
    expect(await result).toMatchObject({ chat: "quota", credits: "exhausted" });
  });

  it("ไม่พบโมเดลสนทนา: ไม่ส่งคำขอตรวจเครดิตด้วยโมเดลที่ไม่มี", async () => {
    const missing = { status: 404, body: { error: { code: "model_not_found" } } };
    const { result, calls } = check({ ...HEALTHY, "/models/chat-model": missing });
    expect(await result).toMatchObject({ chat: "model", transcribe: "ok", credits: "unverified" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("ไม่พบโมเดลแปลงเสียง: สนทนายังใช้ได้ และเครดิตหมดไม่กลบปัญหาโมเดล", async () => {
    const missing = { status: 404, body: { error: { code: "model_not_found" } } };
    const healthy = check({ ...HEALTHY, "/models/speech-model": missing });
    expect(await healthy.result).toMatchObject({ chat: "ok", transcribe: "model", credits: "ok" });

    const broke = check({ ...HEALTHY, "/models/speech-model": missing, "/responses": { status: 429, body: QUOTA_BODY } });
    expect(await broke.result).toMatchObject({ chat: "quota", transcribe: "model" });
  });

  it("ปิดการตรวจเครดิต: ไม่ส่งคำขอที่มีค่าใช้จ่าย", async () => {
    const { result, calls } = check(HEALTHY, { creditCheck: false });
    expect(await result).toMatchObject({ chat: "ok", transcribe: "ok", credits: "skipped" });
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
  });

  it("ติดต่อต้นทางไม่ได้: ไม่ throw และรายงานว่ายังไม่รู้สถานะ", async () => {
    const down = new Error("network down");
    const { result } = check({ "/models/chat-model": down, "/models/speech-model": down });
    expect(await result).toMatchObject({ chat: "unreachable", transcribe: "unreachable", credits: "unverified" });
  });

  it("ตรวจเครดิตไม่สำเร็จแบบชั่วคราว: ไม่ตีความว่าเครดิตหมด", async () => {
    for (const reply of [{ status: 429, body: { error: { code: "rate_limit_exceeded" } } }, { status: 500 }, new Error("timeout")]) {
      const { result } = check({ ...HEALTHY, "/responses": reply });
      expect(await result).toMatchObject({ chat: "ok", transcribe: "ok", credits: "unverified" });
    }
  });

  it("เก็บวันที่ต้นทางประกาศปิดโมเดล", async () => {
    const { result } = check({
      ...HEALTHY,
      "/models/chat-model": { status: 200, body: { id: "chat-model", shutdown_date: "2027-01-14" } },
      "/models/speech-model": { status: 200, body: { id: "speech-model", shutdown_date: "soon" } }
    });
    expect((await result).retiring).toEqual([{ service: "chat", model: "chat-model", date: "2027-01-14" }]);
  });

  it("เข้ารหัสชื่อโมเดลก่อนใส่ในที่อยู่", async () => {
    const { result, calls } = check({}, { chatModel: "org/model?x=1", creditCheck: false });
    await result;
    expect(calls[0]?.url).toBe(`${BASE}/models/org%2Fmodel%3Fx%3D1`);
  });
});

describe("createAiAccountStatus", () => {
  const clock = () => new Date("2026-11-11T10:00:00Z");

  it("เริ่มต้นยังไม่รู้สถานะ", () => {
    expect(createAiAccountStatus(clock).snapshot()).toEqual({
      status: "unknown",
      chat: "unchecked",
      transcribe: "unchecked",
      checkedAt: null
    });
  });

  it("บันทึกผลการตรวจตอนเริ่มเซิร์ฟเวอร์", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "ok", transcribe: "ok", credits: "ok" });
    expect(account.snapshot()).toEqual({ status: "ok", chat: "ok", transcribe: "ok", checkedAt: "2026-11-11T10:00:00.000Z" });
  });

  it("ปัญหาที่ผู้ดูแลต้องแก้ทำให้สถานะรวมเป็น degraded", () => {
    for (const state of ["quota", "auth", "model"] as const) {
      const account = createAiAccountStatus(clock);
      account.apply({ chat: "ok", transcribe: state, credits: "ok" });
      expect(account.snapshot().status).toBe("degraded");
    }
  });

  it("ติดต่อต้นทางไม่ได้คือยังไม่รู้ ไม่ใช่ degraded", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "unreachable", transcribe: "unreachable", credits: "unverified" });
    expect(account.snapshot().status).toBe("unknown");
  });

  it("เครดิตหมดระหว่างใช้งานจริงกระทบทุกบริการ", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "ok", transcribe: "ok", credits: "ok" });
    account.reportFailure("chat", "quota");
    expect(account.snapshot()).toMatchObject({ status: "degraded", chat: "quota", transcribe: "quota" });
  });

  it("เครดิตหมดไม่เขียนทับโมเดลที่หาไม่เจอ", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "ok", transcribe: "model", credits: "ok" });
    account.reportFailure("chat", "quota");
    expect(account.snapshot()).toMatchObject({ chat: "quota", transcribe: "model" });
  });

  it("ปัญหาชั่วคราวไม่เปลี่ยนสถานะ", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "ok", transcribe: "ok", credits: "ok" });
    account.reportFailure("chat", "busy");
    account.reportFailure("transcribe", "unknown");
    expect(account.snapshot()).toMatchObject({ status: "ok", chat: "ok", transcribe: "ok" });
  });

  it("คำขอสำเร็จหลังเติมเครดิต: กลับมาพร้อมใช้งานโดยไม่ต้องรีสตาร์ต", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "quota", transcribe: "quota", credits: "exhausted" });
    account.reportSuccess("chat");
    expect(account.snapshot()).toMatchObject({ status: "ok", chat: "ok", transcribe: "unchecked" });
  });

  it("ตรวจซ้ำหลังเติมเครดิต: กลับมาพร้อมใช้งานโดยไม่ต้องรอคำขอของผู้ใช้", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "quota", transcribe: "quota", credits: "exhausted" });
    account.apply({ chat: "ok", transcribe: "ok", credits: "ok" });
    expect(account.snapshot()).toMatchObject({ status: "ok", chat: "ok", transcribe: "ok" });
  });

  it("ตรวจซ้ำโดยไม่ได้ตรวจเครดิต: ไม่ลบปัญหาเครดิตหมดที่รู้จากคำขอจริง", () => {
    for (const credits of ["skipped", "unverified"] as const) {
      const account = createAiAccountStatus(clock);
      account.apply({ chat: "ok", transcribe: "ok", credits });
      account.reportFailure("chat", "quota");
      account.apply({ chat: "ok", transcribe: "ok", credits });
      expect(account.snapshot()).toMatchObject({ status: "degraded", chat: "quota", transcribe: "quota" });
    }
  });

  it("ตรวจซ้ำแล้วติดต่อต้นทางไม่ได้: ปัญหาเดิมยังอยู่ ไม่กลายเป็นไม่รู้สถานะ", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "auth", transcribe: "auth", credits: "unverified" });
    account.apply({ chat: "unreachable", transcribe: "unreachable", credits: "unverified" });
    expect(account.snapshot()).toMatchObject({ status: "degraded", chat: "auth", transcribe: "auth" });
  });

  it("คำขอสำเร็จไม่ล้างปัญหาโมเดลของอีกบริการ", () => {
    const account = createAiAccountStatus(clock);
    account.apply({ chat: "ok", transcribe: "model", credits: "ok" });
    account.reportSuccess("chat");
    expect(account.snapshot()).toMatchObject({ status: "degraded", transcribe: "model" });
  });

  it("ไม่ได้ตรวจตอนเริ่ม แต่คำขอจริงสำเร็จ: ถือว่าพร้อมใช้งาน", () => {
    const account = createAiAccountStatus(clock);
    account.reportSuccess("chat");
    expect(account.snapshot()).toMatchObject({ status: "ok", chat: "ok", transcribe: "unchecked" });
  });
});

describe("describeAccountCheck", () => {
  const settings = { hasApiKey: true, chatModel: "chat-model", transcribeModel: "speech-model" };
  const now = new Date("2026-11-11T10:00:00Z");
  const result = (overrides: Partial<AccountCheckResult>): AccountCheckResult => ({
    chat: "ok",
    transcribe: "ok",
    credits: "ok",
    retiring: [],
    ...overrides
  });

  it("พร้อมใช้งาน: หนึ่งบรรทัดระดับ info บอกโมเดลที่ใช้", () => {
    const reports = describeAccountCheck(result({}), settings, now);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ level: "info" });
    expect(reports[0]?.message).toContain("chat-model");
    expect(reports[0]?.message).toContain("เครดิตยังเหลือ");
  });

  it("บอกชัดเมื่อไม่ได้ตรวจเครดิต", () => {
    expect(describeAccountCheck(result({ credits: "skipped" }), settings, now)[0]?.message).toContain("AI_CREDIT_CHECK=false");
    expect(describeAccountCheck(result({ credits: "unverified" }), settings, now)[0]?.message).toContain("ยังตรวจเครดิตไม่ได้");
  });

  it("เครดิตหมดเป็นระดับ error และบอกสิ่งที่ต้องทำ", () => {
    const reports = describeAccountCheck(result({ chat: "quota", transcribe: "quota", credits: "exhausted" }), settings, now);
    expect(reports).toEqual([{ level: "error", message: expect.stringContaining("เติมเครดิต") }]);
  });

  it("แยกกุญแจที่ไม่ได้ตั้งออกจากกุญแจที่ถูกปฏิเสธ", () => {
    const broken = result({ chat: "auth", transcribe: "auth", credits: "unverified" });
    expect(describeAccountCheck(broken, settings, now)[0]?.message).toContain("ถูกปฏิเสธ");
    expect(describeAccountCheck(broken, { ...settings, hasApiKey: false }, now)[0]?.message).toContain("ยังไม่ได้ตั้ง");
  });

  it("บอกชื่อโมเดลและตัวแปรที่ต้องแก้เมื่อไม่พบโมเดล", () => {
    const reports = describeAccountCheck(result({ chat: "model", transcribe: "model", credits: "unverified" }), settings, now);
    expect(reports.map((report) => report.level)).toEqual(["error", "warn"]);
    expect(reports[0]?.message).toContain('"chat-model" (OPENAI_CHAT_MODEL)');
    expect(reports[1]?.message).toContain('"speech-model" (OPENAI_TRANSCRIBE_MODEL)');
  });

  it("ติดต่อไม่ได้เป็นคำเตือน ไม่ใช่ข้อผิดพลาด", () => {
    const reports = describeAccountCheck(result({ chat: "unreachable", transcribe: "unreachable", credits: "unverified" }), settings, now);
    expect(reports).toEqual([{ level: "warn", message: expect.stringContaining("ติดต่อบริการ AI ไม่สำเร็จ") }]);
  });

  it("เตือนโมเดลที่กำลังจะถูกปิด พร้อมจำนวนวันที่เหลือ", () => {
    const retiring = [{ service: "chat" as const, model: "chat-model", date: "2027-01-14" }];
    const reports = describeAccountCheck(result({ retiring }), settings, now);
    expect(reports.map((report) => report.level)).toEqual(["info", "warn"]);
    expect(reports[1]?.message).toContain("2027-01-14 (อีก 64 วัน)");
    expect(reports[1]?.message).toContain("OPENAI_CHAT_MODEL");
  });

  it("โมเดลที่เลยกำหนดปิดแล้วให้เปลี่ยนทันที", () => {
    const retiring = [{ service: "transcribe" as const, model: "speech-model", date: "2026-11-01" }];
    const message = describeAccountCheck(result({ retiring }), settings, now)[1]?.message;
    expect(message).toContain("ถึงกำหนดปิดให้บริการแล้ว");
    expect(message).toContain("OPENAI_TRANSCRIBE_MODEL");
  });
});
