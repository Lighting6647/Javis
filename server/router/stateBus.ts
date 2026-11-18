import type { JevStateIn, StateBusSnapshot } from "./types.js";

/**
 * 01 STATE IN -> State Bus Snapshot
 * รวบรวมสัญญาณจาก goal, notes, plan, evidenceCount, gapsCount และ lastError
 * แล้วนับจำนวนจุดอ่านบน Bus (busReaders) โดยไม่เปิดเผยข้อความดิบของผู้ใช้ออกไป
 */
export function buildStateBusSnapshot(state: JevStateIn): StateBusSnapshot {
  const goalTrimmed = state.goal.trim();
  const notes = (state.notes ?? []).filter((item) => item.trim().length > 0);
  const plan = (state.plan ?? []).filter((item) => item.trim().length > 0);
  const evidenceCount = Math.max(0, state.evidenceCount ?? 0);
  const gapsCount = Math.max(0, state.gapsCount ?? 0);
  const lastError = state.lastError?.trim() ?? "";

  // นับช่องสัญญาณที่เปิดใช้งานจริงบน State Bus (base readers = safety, urgency, choice, gate)
  let busReaders = 4;
  if (goalTrimmed.length > 0) busReaders += 1;
  if (notes.length > 0) busReaders += 1;
  if (plan.length > 0) busReaders += 1;
  if (evidenceCount > 0) busReaders += 1;
  if (gapsCount > 0) busReaders += 1;
  if (lastError.length > 0) busReaders += 1;

  const combinedLower = [goalTrimmed, ...notes, ...plan, lastError].filter(Boolean).join(" ").toLowerCase();

  return {
    goalTrimmed,
    goalLength: goalTrimmed.length,
    notesCount: notes.length,
    planCount: plan.length,
    evidenceCount,
    gapsCount,
    hasLastError: lastError.length > 0,
    busReaders,
    combinedLower
  };
}
