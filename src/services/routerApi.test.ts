import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyRouterGoal, decideReviewItem, fetchRouterSnapshot } from "./routerApi";

describe("routerApi client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads telemetry and review queue from /api/router/queue", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          telemetry: {
            decisions: 3,
            heldAtGate: 1,
            blockedByNoul: 0,
            fastTierCount: 2,
            proTierCount: 1,
            avgLatencyMs: 1.4,
            totalCostUsd: 0.000009,
            estimatedHeavyLlmCostUsd: 0.00135,
            savedUsd: 0.001341,
            busReaders: 6,
            queues: { fast: 1, research: 1, reasoning: 0, review: 1 },
            workers: [],
            recentLog: []
          },
          items: []
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const data = await fetchRouterSnapshot();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(data.telemetry.decisions).toBe(3);
    expect(data.items).toEqual([]);
  });

  it("posts goal to /api/router/classify and sends decision to /api/router/queue/:id/decision", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            decision: {
              choice: "web-research",
              choiceConfidence: 0.93,
              urgency: "high",
              urgencyConfidence: 0.92,
              safeToRun: true,
              safeProbability: 0.98,
              gatePassed: true,
              gateThreshold: 0.85,
              destination: "web-research",
              modelTier: "fast",
              holdReason: "",
              latencyMs: 1.2,
              costUsd: 0.000003,
              busReaders: 5,
              engine: "local-system-one"
            },
            telemetry: {
              decisions: 1,
              heldAtGate: 0,
              blockedByNoul: 0,
              fastTierCount: 1,
              proTierCount: 0,
              avgLatencyMs: 1.2,
              totalCostUsd: 0.000003,
              estimatedHeavyLlmCostUsd: 0.00045,
              savedUsd: 0.000447,
              busReaders: 5,
              queues: { fast: 0, research: 1, reasoning: 0, review: 0 },
              workers: [],
              recentLog: []
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            item: {
              id: "rev_12345678",
              createdAt: "2026-11-18T16:00:00.000Z",
              status: "approved",
              redactedGoal: "เอ่อ",
              choice: "review",
              urgency: "low",
              choiceConfidence: 0.68,
              modelTier: "fast",
              holdReason: "Low confidence"
            },
            telemetry: {
              decisions: 1,
              heldAtGate: 1,
              blockedByNoul: 0,
              fastTierCount: 1,
              proTierCount: 0,
              avgLatencyMs: 1.2,
              totalCostUsd: 0.000003,
              estimatedHeavyLlmCostUsd: 0.00045,
              savedUsd: 0.000447,
              busReaders: 5,
              queues: { fast: 1, research: 0, reasoning: 0, review: 0 },
              workers: [],
              recentLog: []
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const classified = await classifyRouterGoal("ค้นหาราคาทองวันนี้");
    expect(classified.decision.choice).toBe("web-research");

    const decided = await decideReviewItem("rev_12345678", "approved");
    expect(decided.item.status).toBe("approved");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws a clear Thai error when server returns 400/500", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "ข้อมูลคำขออนุมัติไม่ถูกต้องครับ" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(decideReviewItem("bad", "approved")).rejects.toThrow("ข้อมูลคำขออนุมัติไม่ถูกต้องครับ");
  });
});
