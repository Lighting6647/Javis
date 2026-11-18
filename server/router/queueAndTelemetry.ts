import { randomUUID } from "node:crypto";
import { HEAVY_LLM_ROUTING_BASELINE_USD } from "./systemOne.js";
import type {
  JevRouteDecision,
  JevTelemetrySnapshot,
  NextWorkerChoice,
  QueueBucket,
  ReviewItemStatus,
  ReviewQueueItem,
  WorkerSlotSnapshot
} from "./types.js";

const MAX_LOG = 30;
const MAX_REVIEW_ITEMS = 50;

const WORKER_ROLES: Array<{ id: string; role: QueueBucket }> = [
  { id: "w1", role: "fast" },
  { id: "w2", role: "research" },
  { id: "w3", role: "reasoning" },
  { id: "w4", role: "review" }
];

const telemetryState = {
  decisions: 0,
  heldAtGate: 0,
  blockedByNoul: 0,
  fastTierCount: 0,
  proTierCount: 0,
  totalLatencyMs: 0,
  totalCostUsd: 0,
  estimatedHeavyLlmCostUsd: 0,
  lastBusReaders: 0,
  queues: {
    fast: 0,
    research: 0,
    reasoning: 0,
    review: 0
  } as Record<QueueBucket, number>,
  workerRuns: {
    w1: 0,
    w2: 0,
    w3: 0,
    w4: 0
  } as Record<string, number>,
  recentLog: [] as JevTelemetrySnapshot["recentLog"]
};

const reviewQueue: ReviewQueueItem[] = [];

function toQueueBucket(destination: NextWorkerChoice): QueueBucket | null {
  if (destination === "fast-reply") return "fast";
  if (destination === "web-research") return "research";
  if (destination === "deep-reasoning") return "reasoning";
  if (destination === "review") return "review";
  return null;
}

/** ปิดบังข้อมูลอ่อนไหว (เบอร์โทร อีเมล กุญแจ API) ก่อนเก็บลงคิวตรวจสอบ */
export function redactGoalSummary(rawGoal: string): string {
  const cleaned = rawGoal
    .trim()
    .replace(/\b0\d{8,9}\b/g, "[phone]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:sk-|AIza)[A-Za-z0-9_-]{8,}\b/g, "[secret]");
  if (!cleaned) return "(empty goal)";
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

export function resetJevTelemetry(): void {
  telemetryState.decisions = 0;
  telemetryState.heldAtGate = 0;
  telemetryState.blockedByNoul = 0;
  telemetryState.fastTierCount = 0;
  telemetryState.proTierCount = 0;
  telemetryState.totalLatencyMs = 0;
  telemetryState.totalCostUsd = 0;
  telemetryState.estimatedHeavyLlmCostUsd = 0;
  telemetryState.lastBusReaders = 0;
  telemetryState.queues = { fast: 0, research: 0, reasoning: 0, review: 0 };
  telemetryState.workerRuns = { w1: 0, w2: 0, w3: 0, w4: 0 };
  telemetryState.recentLog = [];
  reviewQueue.length = 0;
}

export function getJevTelemetry(): JevTelemetrySnapshot {
  const workers: WorkerSlotSnapshot[] = WORKER_ROLES.map((slot) => ({
    id: slot.id,
    role: slot.role,
    runs: telemetryState.workerRuns[slot.id] ?? 0,
    active: (telemetryState.workerRuns[slot.id] ?? 0) > 0
  }));

  const savedUsd = Math.max(0, telemetryState.estimatedHeavyLlmCostUsd - telemetryState.totalCostUsd);

  return {
    decisions: telemetryState.decisions,
    heldAtGate: telemetryState.heldAtGate,
    blockedByNoul: telemetryState.blockedByNoul,
    fastTierCount: telemetryState.fastTierCount,
    proTierCount: telemetryState.proTierCount,
    avgLatencyMs: telemetryState.decisions
      ? Number((telemetryState.totalLatencyMs / telemetryState.decisions).toFixed(2))
      : 0,
    totalCostUsd: Number(telemetryState.totalCostUsd.toFixed(6)),
    estimatedHeavyLlmCostUsd: Number(telemetryState.estimatedHeavyLlmCostUsd.toFixed(6)),
    savedUsd: Number(savedUsd.toFixed(6)),
    busReaders: telemetryState.lastBusReaders,
    queues: { ...telemetryState.queues },
    workers,
    recentLog: [...telemetryState.recentLog]
  };
}

export function recordTelemetry(decision: JevRouteDecision): void {
  telemetryState.decisions += 1;
  if (!decision.gatePassed) telemetryState.heldAtGate += 1;
  if (!decision.safeToRun) telemetryState.blockedByNoul += 1;
  if (decision.modelTier === "fast") telemetryState.fastTierCount += 1;
  if (decision.modelTier === "pro") telemetryState.proTierCount += 1;
  telemetryState.totalLatencyMs += decision.latencyMs;
  telemetryState.totalCostUsd += decision.costUsd;
  telemetryState.estimatedHeavyLlmCostUsd += HEAVY_LLM_ROUTING_BASELINE_USD;
  telemetryState.lastBusReaders = decision.busReaders;

  const bucket = toQueueBucket(decision.destination);
  if (bucket) {
    telemetryState.queues[bucket] += 1;
    const slot = WORKER_ROLES.find((entry) => entry.role === bucket);
    if (slot) {
      telemetryState.workerRuns[slot.id] = (telemetryState.workerRuns[slot.id] ?? 0) + 1;
    }
  }

  telemetryState.recentLog.unshift({
    ts: new Date().toISOString().slice(11, 19),
    choice: decision.choice,
    urgency: decision.urgency,
    safeToRun: decision.safeToRun,
    gatePassed: decision.gatePassed,
    modelTier: decision.modelTier,
    latencyMs: decision.latencyMs
  });
  if (telemetryState.recentLog.length > MAX_LOG) {
    telemetryState.recentLog.length = MAX_LOG;
  }
}

export function enqueueReviewItem(goal: string, decision: JevRouteDecision): ReviewQueueItem {
  const item: ReviewQueueItem = {
    id: `rev_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    status: "pending",
    redactedGoal: redactGoalSummary(goal),
    choice: decision.choice,
    urgency: decision.urgency,
    choiceConfidence: decision.choiceConfidence,
    modelTier: decision.modelTier,
    holdReason: decision.holdReason || "Confidence below gate threshold"
  };

  reviewQueue.unshift(item);
  if (reviewQueue.length > MAX_REVIEW_ITEMS) {
    reviewQueue.length = MAX_REVIEW_ITEMS;
  }
  return item;
}

export function listReviewQueue(): ReviewQueueItem[] {
  return reviewQueue.map((item) => ({ ...item }));
}

export function resolveReviewItem(id: string, status: Exclude<ReviewItemStatus, "pending">): ReviewQueueItem | null {
  const target = reviewQueue.find((item) => item.id === id);
  if (!target) return null;
  if (target.status !== "pending") return { ...target };

  target.status = status;
  target.resolvedAt = new Date().toISOString();
  if (telemetryState.queues.review > 0) {
    telemetryState.queues.review -= 1;
  }
  if (status === "approved") {
    telemetryState.queues.fast += 1;
    telemetryState.workerRuns.w1 = (telemetryState.workerRuns.w1 ?? 0) + 1;
  }
  return { ...target };
}
