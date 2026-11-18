import type { AiProvider } from "../aiProvider.js";
import { buildStateBusSnapshot } from "./stateBus.js";
import type { JevRouteDecision, JevStateIn, ModelTier, NextWorkerChoice, UrgencyScore } from "./types.js";

export const DEFAULT_GATE = 0.85;

/** ค่าใช้จ่ายต่อการตัดสินใจของ Local System-One (โดยประมาณเป็นหน่วย USD) */
export const SYSTEM_ONE_DECISION_COST_USD = 0.000003;
/** ค่าใช้จ่ายเฉลี่ยถ้าใช้ Frontier LLM ตัวใหญ่ตัดสินใจ routing แทน (ใช้เปรียบเทียบความคุ้มค่า) */
export const HEAVY_LLM_ROUTING_BASELINE_USD = 0.00045;

const UNSAFE_PATTERN =
  /(?:drop\s+table|rm\s+-rf\s+\/|ลบฐานข้อมูล|format\s+c:|ignore\s+previous\s+instructions|เปิดเผย\s*api\s*key)/i;
const CRITICAL_URGENCY_PATTERN = /(?:ด่วน|critical|emergency|ล่ม|production)/i;
const HIGH_URGENCY_PATTERN = /(?:ค้นหา|ราคา|ข่าว|เปรียบเทียบ|วิเคราะห์|search|research)/i;
const MEDIUM_URGENCY_PATTERN = /(?:วางแผน|สถาปัตยกรรม|สรุปประชุม|โค้ด|debug)/i;
const STOP_CHOICE_PATTERN = /(?:หยุด|พอแค่นี้|stop\s+now|cancel\s+all)/i;
const RESEARCH_CHOICE_PATTERN = /(?:ค้นหา|หาข้อมูล|เสิร์ช|ราคาทอง|ราคาหุ้น|ข่าว|สภาพอากาศ|search)/i;
const DEEP_REASONING_PATTERN = /(?:วิเคราะห์|เปรียบเทียบ|สถาปัตยกรรม|วางแผน|เขียนโค้ด|debug|สรุปประชุม)/i;

function computeModelTier(choice: NextWorkerChoice, urgency: UrgencyScore, safeToRun: boolean): ModelTier {
  if (!safeToRun || choice === "stop") return "halt";
  if (choice === "deep-reasoning" || urgency === "critical") return "pro";
  return "fast";
}

/**
 * ตัดสินใจและประเมินความเสี่ยงในเครื่องทันที (< 2ms, $0) ด้วย 3 แกน:
 * 1) Noul Safety Check (safeToRun)
 * 2) Score Urgency (low -> critical)
 * 3) Choice Next Worker + Confidence Gate (>= 0.85)
 */
export function evaluateLocalSystemOne(state: JevStateIn, gateThreshold = DEFAULT_GATE): JevRouteDecision {
  const started = performance.now();
  const bus = buildStateBusSnapshot(state);

  const safeToRun = !UNSAFE_PATTERN.test(bus.combinedLower);
  const safeProbability = safeToRun ? 0.98 : 0.08;

  let urgency: UrgencyScore = "low";
  let urgencyConfidence = 0.89;
  if (CRITICAL_URGENCY_PATTERN.test(bus.combinedLower)) {
    urgency = "critical";
    urgencyConfidence = 0.96;
  } else if (HIGH_URGENCY_PATTERN.test(bus.combinedLower) || bus.gapsCount >= 2) {
    urgency = "high";
    urgencyConfidence = 0.92;
  } else if (bus.goalLength > 140 || MEDIUM_URGENCY_PATTERN.test(bus.combinedLower)) {
    urgency = "medium";
    urgencyConfidence = 0.9;
  }

  let choice: NextWorkerChoice = "fast-reply";
  let choiceConfidence = 0.93;

  if (!safeToRun) {
    choice = "stop";
    choiceConfidence = 0.97;
  } else if (STOP_CHOICE_PATTERN.test(bus.combinedLower)) {
    choice = "stop";
    choiceConfidence = 0.94;
  } else if (RESEARCH_CHOICE_PATTERN.test(bus.combinedLower)) {
    choice = "web-research";
    choiceConfidence = 0.93;
  } else if (bus.goalLength > 160 || DEEP_REASONING_PATTERN.test(bus.combinedLower)) {
    choice = "deep-reasoning";
    choiceConfidence = 0.91;
  } else if (bus.goalLength < 5) {
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
    costUsd: SYSTEM_ONE_DECISION_COST_USD,
    busReaders: bus.busReaders,
    engine: "local-system-one"
  };
}

/**
 * เลือกชื่อโมเดลจริงตามผล Model Tier ของ JEV Router
 * - ถ้าผู้ดูแลตั้งค่า proModel (เช่น GEMINI_PRO_MODEL) และคำขอเป็นระดับ "pro" จะสลับไปใช้รุ่นใหญ่ให้
 * - ถ้าไม่ได้ตั้งค่า จะใช้ ai.chatModel ตามเดิมเพื่อรักษาความเข้ากันได้และคุมค่าใช้จ่าย
 */
export function resolveRoutedModel(
  ai: Pick<AiProvider, "chatModel" | "proModel">,
  decision: Pick<JevRouteDecision, "modelTier">
): string {
  if (decision.modelTier === "pro" && ai.proModel) {
    return ai.proModel;
  }
  return ai.chatModel;
}
