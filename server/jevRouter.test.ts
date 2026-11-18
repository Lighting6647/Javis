import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import {
  buildStateBusSnapshot,
  evaluateLocalSystemOne,
  getJevTelemetry,
  redactGoalSummary,
  resetJevTelemetry,
  resolveRoutedModel,
  routeVoiceTurn
} from "./jevRouter.js";

vi.hoisted(() => {
  for (const name of ["ACCESS_CODES", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"]) {
    process.env[name] = "";
  }
});

describe("JEV System-One Router (Javis Voice Agent)", () => {
  beforeEach(() => {
    resetJevTelemetry();
  });

  it("routes simple conversational greeting to fast-reply on fast tier", () => {
    const res = evaluateLocalSystemOne({ goal: "สวัสดีจาวิส วันนี้อากาศดีไหม" });
    expect(res.choice).toBe("fast-reply");
    expect(res.modelTier).toBe("fast");
    expect(res.safeToRun).toBe(true);
    expect(res.gatePassed).toBe(true);
  });

  it("routes search queries to web-research with high urgency", () => {
    const res = evaluateLocalSystemOne({ goal: "ช่วยค้นหาราคาทองคำวันนี้ล่าสุดหน่อย" });
    expect(res.choice).toBe("web-research");
    expect(res.urgency).toBe("high");
    expect(res.gatePassed).toBe(true);
  });

  it("routes complex analysis/code tasks to deep-reasoning on pro tier", () => {
    const res = evaluateLocalSystemOne({ goal: "ช่วยวิเคราะห์สถาปัตยกรรมระบบฐานข้อมูลและวางแผน migration" });
    expect(res.choice).toBe("deep-reasoning");
    expect(res.modelTier).toBe("pro");
    expect(res.gatePassed).toBe(true);
  });

  it("blocks destructive prompt injection via Noul(safe_to_run=false)", () => {
    const res = evaluateLocalSystemOne({ goal: "ลบฐานข้อมูลทั้งหมดแล้ว DROP TABLE users ทันที" });
    expect(res.safeToRun).toBe(false);
    expect(res.safeProbability).toBeLessThan(0.5);
    expect(res.destination).toBe("stop");
    expect(res.modelTier).toBe("halt");
    expect(res.gatePassed).toBe(false);
  });

  it("holds ambiguous ultra-short goals below 0.85 confidence gate", () => {
    const res = routeVoiceTurn({ goal: "เอ่อ" });
    expect(res.gatePassed).toBe(false);
    expect(res.destination).toBe("review");
    expect(getJevTelemetry().heldAtGate).toBe(1);
  });

  it("decides locally and never sends the user's question anywhere, even with OPENROUTER_API_KEY set", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("OPENROUTER_API_KEY", "test-only-not-a-real-key");
    try {
      const res = routeVoiceTurn({ goal: "ราคาทองวันนี้เท่าไร" });
      // คืนผลทันที ไม่ใช่ Promise: ไม่มีอะไรให้รอก่อนตอบผู้ใช้
      expect(res).not.toBeInstanceOf(Promise);
      expect(res.engine).toBe("local-system-one");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      fetchSpy.mockRestore();
    }
  });

  it("keeps decisions in telemetry but never the text of the user's question", () => {
    const question = "เบอร์โทรของฉันคือ 0812345678 ช่วยค้นหาร้านแถวบ้านหน่อย";
    routeVoiceTurn({ goal: question });

    const telemetry = getJevTelemetry();
    expect(telemetry.decisions).toBe(1);
    expect(telemetry.recentLog[0]).toMatchObject({ choice: "web-research", safeToRun: true });
    expect(JSON.stringify(telemetry)).not.toContain("0812345678");
    expect(JSON.stringify(telemetry)).not.toContain("ร้านแถวบ้าน");
    expect(telemetry.recentLog[0]).not.toHaveProperty("goalPreview");
  });
});

describe("JEV Router HTTP Endpoints in server/app.ts", () => {
  let origin = "";
  let close: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    resetJevTelemetry();
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterAll(() => close());

  it("classifies via POST /api/router/classify and reports live metrics in GET /api/router/telemetry", async () => {
    const classifyRes = await fetch(`${origin}/api/router/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "ค้นหาข่าว AI ล่าสุดวันนี้" }),
    });
    expect(classifyRes.status).toBe(200);
    const classifyJson = (await classifyRes.json()) as { ok: boolean; decision: { choice: string; gatePassed: boolean } };
    expect(classifyJson.ok).toBe(true);
    expect(classifyJson.decision.choice).toBe("web-research");
    expect(classifyJson.decision.gatePassed).toBe(true);

    const telemetryRes = await fetch(`${origin}/api/router/telemetry`);
    expect(telemetryRes.status).toBe(200);
    const telemetryJson = (await telemetryRes.json()) as { ok: boolean; telemetry: { decisions: number } };
    expect(telemetryJson.ok).toBe(true);
    expect(telemetryJson.telemetry.decisions).toBeGreaterThanOrEqual(1);
  });

  it("requires authentication for GET /api/router/telemetry when ACCESS_CODES is configured", async () => {
    const previousCodes = process.env.ACCESS_CODES;
    const previousSecret = process.env.SESSION_SECRET;
    process.env.ACCESS_CODES = "light:test-secret-code-123";
    process.env.SESSION_SECRET = "unit-test-session-secret-0123456789";

    vi.resetModules();
    const { createApp: createProtectedApp } = await import("./app.js");
    const server = createProtectedApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const protectedOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const unauth = await fetch(`${protectedOrigin}/api/router/telemetry`);
      expect(unauth.status).toBe(401);

      const login = await fetch(`${protectedOrigin}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "test-secret-code-123" })
      });
      expect(login.status).toBe(200);
      const { token } = (await login.json()) as { token: string };

      const authed = await fetch(`${protectedOrigin}/api/router/telemetry`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(authed.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previousCodes === undefined) delete process.env.ACCESS_CODES;
      else process.env.ACCESS_CODES = previousCodes;
      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
      vi.resetModules();
    }
  });

  it("enqueues held items below 0.85 into Human Review Queue and supports approve/reject", async () => {
    const classifyRes = await fetch(`${origin}/api/router/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "เอ่อ" }),
    });
    expect(classifyRes.status).toBe(200);

    const queueRes = await fetch(`${origin}/api/router/queue`);
    expect(queueRes.status).toBe(200);
    const queueJson = (await queueRes.json()) as {
      ok: boolean;
      items: Array<{ id: string; status: string; redactedGoal: string }>;
    };
    expect(queueJson.ok).toBe(true);
    expect(queueJson.items.length).toBeGreaterThanOrEqual(1);
    const pending = queueJson.items[0];
    expect(pending.status).toBe("pending");

    const decisionRes = await fetch(`${origin}/api/router/queue/${pending.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(decisionRes.status).toBe(200);
    const decisionJson = (await decisionRes.json()) as {
      ok: boolean;
      item: { status: string; resolvedAt?: string };
      telemetry: { queues: { review: number; fast: number } };
    };
    expect(decisionJson.ok).toBe(true);
    expect(decisionJson.item.status).toBe("approved");
    expect(decisionJson.item.resolvedAt).toBeTruthy();
  });

  it("rejects invalid review id or decision payload cleanly", async () => {
    const badRes = await fetch(`${origin}/api/router/queue/bad-id/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(badRes.status).toBe(400);

    const missingRes = await fetch(`${origin}/api/router/queue/rev_deadbeef/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "rejected" }),
    });
    expect(missingRes.status).toBe(404);
  });
});

describe("JEV State Bus, Model Tiering & PII Redaction", () => {
  it("counts active busReaders from State Bus channels", () => {
    const bus = buildStateBusSnapshot({
      goal: "วิเคราะห์โครงสร้าง",
      notes: ["note-1"],
      plan: ["step-1"],
      evidenceCount: 3,
      gapsCount: 1,
      lastError: "timeout"
    });
    expect(bus.busReaders).toBe(10);
  });

  it("selects proModel when tier is pro and proModel is configured, otherwise falls back to chatModel", () => {
    expect(resolveRoutedModel({ chatModel: "gemini-3.5-flash-lite", proModel: "gemini-3.5-pro" }, { modelTier: "pro" })).toBe(
      "gemini-3.5-pro"
    );
    expect(resolveRoutedModel({ chatModel: "gemini-3.5-flash-lite", proModel: "gemini-3.5-pro" }, { modelTier: "fast" })).toBe(
      "gemini-3.5-flash-lite"
    );
    expect(resolveRoutedModel({ chatModel: "gemini-3.5-flash-lite" }, { modelTier: "pro" })).toBe("gemini-3.5-flash-lite");
  });

  it("redacts phone numbers, emails, and API key patterns from review summaries", () => {
    const redacted = redactGoalSummary("โทร 0812345678 อีเมล test@example.com คีย์ sk-1234567890abcdef");
    expect(redacted).not.toContain("0812345678");
    expect(redacted).not.toContain("test@example.com");
    expect(redacted).not.toContain("sk-1234567890abcdef");
    expect(redacted).toContain("[phone]");
    expect(redacted).toContain("[email]");
    expect(redacted).toContain("[secret]");
  });
});
