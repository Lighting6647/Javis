/**
 * ชนิดข้อมูลกลางของระบบ JEV Agent-Router (State Bus, System-One, Confidence Gate, Queue & Telemetry)
 * แยกสัญญาข้อมูลไว้ที่นี่เพื่อให้ทั้งฝั่ง Server, Tests และ Adapter ใช้ร่วมกันโดยไม่วนอ้างอิง
 */

export type NextWorkerChoice = "fast-reply" | "web-research" | "deep-reasoning" | "review" | "stop";
export type UrgencyScore = "low" | "medium" | "high" | "critical";
export type ModelTier = "fast" | "pro" | "halt";
export type QueueBucket = "fast" | "research" | "reasoning" | "review";
export type ReviewItemStatus = "pending" | "approved" | "rejected";

export interface JevStateIn {
  goal: string;
  notes?: string[];
  plan?: string[];
  evidenceCount?: number;
  gapsCount?: number;
  lastError?: string;
}

export interface StateBusSnapshot {
  goalTrimmed: string;
  goalLength: number;
  notesCount: number;
  planCount: number;
  evidenceCount: number;
  gapsCount: number;
  hasLastError: boolean;
  /** จำนวนช่องสัญญาณที่ทำงานบน State Bus ในรอบนี้ */
  busReaders: number;
  /** ข้อความรวมแบบตัวพิมพ์เล็กสำหรับกฎวิเคราะห์ในเครื่องเท่านั้น (ห้ามบันทึกลง telemetry) */
  combinedLower: string;
}

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
