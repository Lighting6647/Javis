import { API_BASE } from "./http";
import { sessionStore } from "./sessionStore";

export type NextWorkerChoice = "fast-reply" | "web-research" | "deep-reasoning" | "review" | "stop";
export type UrgencyScore = "low" | "medium" | "high" | "critical";
export type ModelTier = "fast" | "pro" | "halt";
export type QueueBucket = "fast" | "research" | "reasoning" | "review";
export type ReviewItemStatus = "pending" | "approved" | "rejected";

export interface JevRouteDecision {
  choice: NextWorkerChoice;
  choiceConfidence: number;
  urgency: UrgencyScore;
  urgencyConfidence: number;
  safeToRun: boolean;
  safeProbability: number;
  gatePassed: boolean;
  gateThreshold: number;
  destination: NextWorkerChoice;
  modelTier: ModelTier;
  holdReason: string;
  latencyMs: number;
  costUsd: number;
  busReaders: number;
  engine: "local-system-one";
}

export interface RouterLogEntry {
  ts: string;
  choice: NextWorkerChoice;
  urgency: UrgencyScore;
  safeToRun: boolean;
  gatePassed: boolean;
  modelTier: ModelTier;
  latencyMs: number;
}

export interface WorkerSlotSnapshot {
  id: string;
  role: QueueBucket;
  runs: number;
  active: boolean;
}

export interface JevTelemetrySnapshot {
  decisions: number;
  heldAtGate: number;
  blockedByNoul: number;
  fastTierCount: number;
  proTierCount: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  estimatedHeavyLlmCostUsd: number;
  savedUsd: number;
  busReaders: number;
  queues: Record<QueueBucket, number>;
  workers: WorkerSlotSnapshot[];
  recentLog: RouterLogEntry[];
}

export interface ReviewQueueItem {
  id: string;
  createdAt: string;
  status: ReviewItemStatus;
  redactedGoal: string;
  choice: NextWorkerChoice;
  urgency: UrgencyScore;
  choiceConfidence: number;
  modelTier: ModelTier;
  holdReason: string;
  resolvedAt?: string;
}

async function handleJson<T>(response: Response, fallbackError: string): Promise<T> {
  if (response.status === 401) {
    sessionStore.clear();
    throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้งครับ");
  }
  const body = (await response.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error || fallbackError);
  }
  return body;
}

export async function fetchRouterSnapshot(): Promise<{
  telemetry: JevTelemetrySnapshot;
  items: ReviewQueueItem[];
}> {
  const response = await fetch(`${API_BASE}/api/router/queue`, {
    headers: sessionStore.authHeaders()
  });
  return handleJson<{ telemetry: JevTelemetrySnapshot; items: ReviewQueueItem[] }>(
    response,
    "ไม่สามารถโหลดข้อมูล JEV Router ได้ครับ"
  );
}

export async function classifyRouterGoal(goal: string, gapsCount = 0): Promise<{
  decision: JevRouteDecision;
  telemetry: JevTelemetrySnapshot;
}> {
  const response = await fetch(`${API_BASE}/api/router/classify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...sessionStore.authHeaders()
    },
    body: JSON.stringify({ goal, gapsCount })
  });
  return handleJson<{ decision: JevRouteDecision; telemetry: JevTelemetrySnapshot }>(
    response,
    "ไม่สามารถทดสอบคัดแยกคำสั่งได้ครับ"
  );
}

export async function decideReviewItem(
  id: string,
  decision: "approved" | "rejected"
): Promise<{ item: ReviewQueueItem; telemetry: JevTelemetrySnapshot }> {
  const response = await fetch(`${API_BASE}/api/router/queue/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...sessionStore.authHeaders()
    },
    body: JSON.stringify({ decision })
  });
  return handleJson<{ item: ReviewQueueItem; telemetry: JevTelemetrySnapshot }>(
    response,
    "ไม่สามารถอัปเดตสถานะคิวตรวจสอบได้ครับ"
  );
}
