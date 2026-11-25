import type { PcActionResult } from "../conversation/types";
import { fetchWithTimeout } from "./http";
import { sessionStore } from "./sessionStore";

/** คำสั่งในเครื่องรันได้นานสุดราว 30 วินาที จึงรอเผื่อไว้ */
const DECISION_TIMEOUT_MS = 60_000;

/** ส่งการตัดสินใจของผู้ใช้ต่อรายการที่ลูน่าเสนอทำในเครื่อง */
export async function decidePcAction(id: string, decision: "confirm" | "cancel", via: "button" | "voice"): Promise<PcActionResult> {
  const response = await fetchWithTimeout(`/api/pc/actions/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
    body: JSON.stringify({ decision, via }),
    timeoutMs: DECISION_TIMEOUT_MS
  });
  const payload = (await response.json()) as Partial<PcActionResult>;
  return {
    ok: response.ok && payload.ok === true,
    summary: typeof payload.summary === "string" && payload.summary ? payload.summary : "ทำรายการนี้ไม่สำเร็จค่ะ",
    ...(typeof payload.output === "string" && payload.output ? { output: payload.output } : {})
  };
}
