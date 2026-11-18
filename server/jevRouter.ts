/**
 * JEV System-One Router for Javis Voice Agent (server/jevRouter.ts)
 * Implements Choice / Score / Noul primitives, Confidence Gate (>= 0.85),
 * and Model-Tier Routing (fast vs pro vs halt).
 *
 * ตัดสินในเครื่องเท่านั้น: คำถามของผู้ใช้ไม่ถูกส่งไปบริการภายนอกใด และไม่ต้องรอเครือข่ายก่อนตอบทุกคำถาม
 * (เดิมเมื่อตั้ง OPENROUTER_API_KEY จะส่งทุกคำถามไปยัง openrouter.ai และรอได้ถึง 4 วินาที)
 * สถิติเก็บเฉพาะผลการตัดสิน ไม่เก็บข้อความของผู้ใช้ เพราะ /api/router/telemetry เปิดให้ทุกคนอ่านเมื่อไม่ได้ตั้ง ACCESS_CODES
 */

export type NextWorkerChoice = "fast-reply" | "web-research" | "deep-reasoning" | "review" | "stop";
export type UrgencyScore = "low" | "medium" | "high" | "critical";
export type ModelTier = "fast" | "pro" | "halt";

export interface JevStateIn {
  goal: string;
  notes?: string[];
  plan?: string[];
  evidenceCount?: number;
  gapsCount?: number;
  lastError?: string;
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
  engine: "local-system-one";
}

export interface JevTelemetrySnapshot {
  decisions: number;
  heldAtGate: number;
  blockedByNoul: number;
  fastTierCount: number;
  proTierCount: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  recentLog: Array<{
    ts: string;
    choice: NextWorkerChoice;
    urgency: UrgencyScore;
    safeToRun: boolean;
    gatePassed: boolean;
    modelTier: ModelTier;
    latencyMs: number;
  }>;
}

const DEFAULT_GATE = 0.85;
const MAX_LOG = 30;

const telemetryState = {
  decisions: 0,
  heldAtGate: 0,
  blockedByNoul: 0,
  fastTierCount: 0,
  proTierCount: 0,
  totalLatencyMs: 0,
  totalCostUsd: 0,
  recentLog: [] as JevTelemetrySnapshot["recentLog"],
};

export function resetJevTelemetry(): void {
  telemetryState.decisions = 0;
  telemetryState.heldAtGate = 0;
  telemetryState.blockedByNoul = 0;
  telemetryState.fastTierCount = 0;
  telemetryState.proTierCount = 0;
  telemetryState.totalLatencyMs = 0;
  telemetryState.totalCostUsd = 0;
  telemetryState.recentLog = [];
}

export function getJevTelemetry(): JevTelemetrySnapshot {
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
    recentLog: [...telemetryState.recentLog],
  };
}

function recordTelemetry(decision: JevRouteDecision): void {
  telemetryState.decisions += 1;
  if (!decision.gatePassed) telemetryState.heldAtGate += 1;
  if (!decision.safeToRun) telemetryState.blockedByNoul += 1;
  if (decision.modelTier === "fast") telemetryState.fastTierCount += 1;
  if (decision.modelTier === "pro") telemetryState.proTierCount += 1;
  telemetryState.totalLatencyMs += decision.latencyMs;
  telemetryState.totalCostUsd += decision.costUsd;

  telemetryState.recentLog.unshift({
    ts: new Date().toISOString().slice(11, 19),
    choice: decision.choice,
    urgency: decision.urgency,
    safeToRun: decision.safeToRun,
    gatePassed: decision.gatePassed,
    modelTier: decision.modelTier,
    latencyMs: decision.latencyMs,
  });
  if (telemetryState.recentLog.length > MAX_LOG) {
    telemetryState.recentLog.length = MAX_LOG;
  }
}

function computeModelTier(choice: NextWorkerChoice, urgency: UrgencyScore, safeToRun: boolean): ModelTier {
  if (!safeToRun || choice === "stop") return "halt";
  if (choice === "deep-reasoning" || urgency === "critical") return "pro";
  return "fast";
}

export function evaluateLocalSystemOne(state: JevStateIn, gateThreshold = DEFAULT_GATE): JevRouteDecision {
  const started = performance.now();
  const combined = `${state.goal} ${(state.notes ?? []).join(" ")} ${state.lastError ?? ""}`.toLowerCase();

  const unsafePattern =
    /(?:drop\s+table|rm\s+-rf\s+\/|ลบฐานข้อมูล|format\s+c:|ignore\s+previous\s+instructions|เปิดเผย\s*api\s*key)/i;
  const safeToRun = !unsafePattern.test(combined);
  const safeProbability = safeToRun ? 0.98 : 0.08;

  let urgency: UrgencyScore = "low";
  let urgencyConfidence = 0.89;
  if (/(?:ด่วน|critical|emergency|ล่ม|production)/i.test(combined)) {
    urgency = "critical";
    urgencyConfidence = 0.96;
  } else if (/(?:ค้นหา|ราคา|ข่าว|เปรียบเทียบ|วิเคราะห์|search|research)/i.test(combined) || (state.gapsCount ?? 0) >= 2) {
    urgency = "high";
    urgencyConfidence = 0.92;
  } else if (state.goal.length > 140 || /(?:วางแผน|สถาปัตยกรรม|สรุปประชุม|โค้ด|debug)/i.test(combined)) {
    urgency = "medium";
    urgencyConfidence = 0.9;
  }

  let choice: NextWorkerChoice = "fast-reply";
  let choiceConfidence = 0.93;

  if (!safeToRun) {
    choice = "stop";
    choiceConfidence = 0.97;
  } else if (/(?:หยุด|พอแค่นี้|stop\s+now|cancel\s+all)/i.test(combined)) {
    choice = "stop";
    choiceConfidence = 0.94;
  } else if (/(?:ค้นหา|หาข้อมูล|เสิร์ช|ราคาทอง|ราคาหุ้น|ข่าว|สภาพอากาศ|search)/i.test(combined)) {
    choice = "web-research";
    choiceConfidence = 0.93;
  } else if (state.goal.length > 160 || /(?:วิเคราะห์|เปรียบเทียบ|สถาปัตยกรรม|วางแผน|เขียนโค้ด|debug|สรุปประชุม)/i.test(combined)) {
    choice = "deep-reasoning";
    choiceConfidence = 0.91;
  } else if (state.goal.trim().length < 5) {
    choice = "review";
    choiceConfidence = 0.68;
  }

  const gatePassed = safeToRun && safeProbability >= gateThreshold && choiceConfidence >= gateThreshold;
  const destination: NextWorkerChoice = !safeToRun ? "stop" : gatePassed ? choice : "review";
  const holdReason = !safeToRun
    ? "Blocked by Noul(safe_to_run=false)"
    : gatePassed
    ? ""
    : `Low confidence (${choiceConfidence.toFixed(2)} < ${gateThreshold.toFixed(2)})`;

  const latencyMs = Number(Math.max(0.4, performance.now() - started + 1.2).toFixed(2));
  return {
    choice,
    choiceConfidence,
    urgency,
    urgencyConfidence,
    safeToRun,
    safeProbability,
    gatePassed,
    gateThreshold,
    destination,
    modelTier: computeModelTier(destination, urgency, safeToRun),
    holdReason,
    latencyMs,
    costUsd: 0.000003,
    engine: "local-system-one",
  };
}

/**
 * ตัดสินคำขอหนึ่งครั้งในเครื่อง แล้วบันทึกสถิติ (ไม่เก็บข้อความของผู้ใช้)
 * ไม่ส่งคำถามไปบริการภายนอก และไม่ต้องรอเครือข่าย จึงคืนผลทันที
 */
export function routeVoiceTurn(state: JevStateIn, options: { gateThreshold?: number } = {}): JevRouteDecision {
  const decision = evaluateLocalSystemOne(state, options.gateThreshold ?? DEFAULT_GATE);
  recordTelemetry(decision);
  return decision;
}
