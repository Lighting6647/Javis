import {
  enqueueReviewItem,
  exportJevState,
  getJevTelemetry,
  importJevState,
  listReviewQueue,
  recordTelemetry,
  redactGoalSummary,
  resetJevTelemetry,
  resolveReviewItem
} from "./queueAndTelemetry.js";
import { buildStateBusSnapshot } from "./stateBus.js";
import { DEFAULT_GATE, evaluateLocalSystemOne, resolveRoutedModel } from "./systemOne.js";
import type { JevRouteDecision, JevStateIn } from "./types.js";

export * from "./types.js";
export { routerPersistence } from "./persistence.js";
export type { JevRouterState } from "./queueAndTelemetry.js";
export {
  buildStateBusSnapshot,
  exportJevState,
  importJevState,
  DEFAULT_GATE,
  evaluateLocalSystemOne,
  getJevTelemetry,
  listReviewQueue,
  redactGoalSummary,
  resetJevTelemetry,
  resolveReviewItem,
  resolveRoutedModel
};

/**
 * ตัดสินคำขอหนึ่งครั้งในเครื่อง บันทึกสถิติ (ไม่เก็บข้อความดิบใน telemetry)
 * และส่งรายการที่ปลอดภัยแต่ความมั่นใจต่ำกว่า 0.85 เข้าคิว Human Review อัตโนมัติ
 */
export function routeVoiceTurn(
  state: JevStateIn,
  options: { gateThreshold?: number; enqueueReview?: boolean } = {}
): JevRouteDecision {
  const decision = evaluateLocalSystemOne(state, options.gateThreshold ?? DEFAULT_GATE);
  recordTelemetry(decision);

  if (options.enqueueReview !== false && decision.safeToRun && !decision.gatePassed) {
    enqueueReviewItem(state.goal, decision);
  }
  return decision;
}
