import type { CloudVoiceStatus } from "../speech/cloudVoice";
import type { AiServiceState } from "./aiStatusStore";

/**
 * ตัวช่วยของแผงตัวเลขบนจอ HUD ทุกค่าที่แสดงมาจากสถานะจริงของแอป
 * แยกไว้ที่นี่เพื่อให้ทดสอบได้โดยไม่ต้องวาดหน้าจอ
 */

/** น้ำเสียงของค่าบนแผง ใช้เลือกสี: ปกติ กำลังรอผล หรือมีปัญหา */
export type ReadoutTone = "ok" | "wait" | "bad";

const NO_VALUE = "ยังไม่มี";

/** เวลาที่ใช้รอคำตอบครั้งล่าสุด เป็นข้อความสั้นพอดีช่อง */
export function formatLatency(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return NO_VALUE;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} วิ`;
  if (ms < 120_000) return `${Math.round(ms / 1000)} วิ`;
  return `${Math.floor(ms / 60_000)} นาที+`;
}

const HUD_DATE = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** วันที่แบบย่อตามเวลาของอุปกรณ์ เช่น พฤ. 12 พ.ย. 2569 */
export function formatHudDate(date: Date): string {
  return HUD_DATE.format(date);
}

const AI_STATE_TEXT: Record<AiServiceState, { text: string; tone: ReadoutTone }> = {
  unchecked: { text: "กำลังตรวจ", tone: "wait" },
  ok: { text: "ปกติ", tone: "ok" },
  unreachable: { text: "ติดต่อไม่ได้", tone: "bad" },
  quota: { text: "โควตาเต็ม", tone: "bad" },
  auth: { text: "กุญแจใช้ไม่ได้", tone: "bad" },
  model: { text: "โมเดลใช้ไม่ได้", tone: "bad" },
  unsupported: { text: "ไม่รองรับ", tone: "bad" }
};

/** สถานะบริการ AI ตามที่เซิร์ฟเวอร์รายงาน เป็นคำสั้นสำหรับแผงตัวเลข (รายละเอียดเต็มอยู่ที่แถบแจ้งเตือน) */
export function describeAiState(state: AiServiceState | null): { text: string; tone: ReadoutTone } {
  return AI_STATE_TEXT[state ?? "unchecked"];
}

const COUNT = new Intl.NumberFormat("th-TH");

/**
 * ยอดค้นเว็บของเดือนนี้เทียบกับโควตา เช่น "123 / 1,000"
 * ใกล้เต็มเตือนเป็นสีรอ (75%) เต็มหรือเกินเป็นสีปัญหา (90%) เพราะเมื่อโควตาหมด Javis จะตอบโดยไม่ค้นเว็บ
 */
export function describeSearchMonth(month: { used: number; limit: number | null } | null): { text: string; tone?: ReadoutTone } {
  if (!month) return { text: NO_VALUE };
  if (!month.limit) return { text: `${COUNT.format(month.used)} ครั้ง` };
  const share = month.used / month.limit;
  return {
    text: `${COUNT.format(month.used)} / ${COUNT.format(month.limit)}`,
    tone: share >= 0.9 ? "bad" : share >= 0.75 ? "wait" : "ok"
  };
}

/** สัดส่วนคำค้นที่ใช้ผลค้นที่จำไว้ เช่น "5 จาก 20 (25%)" ยังไม่มีการค้นคือ "ยังไม่มี" */
export function describeCacheUse(cache: { hits: number; misses: number } | null): { text: string } {
  const total = cache ? cache.hits + cache.misses : 0;
  if (!cache || total === 0) return { text: NO_VALUE };
  return { text: `${COUNT.format(cache.hits)} จาก ${COUNT.format(total)} (${Math.round((cache.hits / total) * 100)}%)` };
}

/** สถานะเสียงพูดของ Gemini สำหรับแสดงบนแผงตัวเลขของจอ Studio */
export function describeCloudVoiceState(
  status: CloudVoiceStatus | null,
  cloudVoice: string | null
): { text: string; tone?: ReadoutTone } {
  if (!status || status.mode === "off" || status.mode === "unavailable") {
    return { text: "ในอุปกรณ์" };
  }
  if (status.mode === "paused") {
    return { text: "สำรอง · ในอุปกรณ์", tone: "ok" };
  }
  return { text: cloudVoice ? `Gemini · ${cloudVoice}` : "Gemini", tone: "ok" };
}
