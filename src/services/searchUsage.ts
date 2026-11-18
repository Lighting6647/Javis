import { fetchWithTimeout } from "./http";
import { sessionStore } from "./sessionStore";

/** ยอดใช้การค้นเว็บตามที่เซิร์ฟเวอร์รายงานใน /api/search/usage */
export interface SearchUsageView {
  /** tavily: นับยอดและจำผลค้นได้ · provider: ใช้เครื่องมือค้นของผู้ให้บริการ AI · off: ไม่ค้นเว็บ */
  service: "tavily" | "provider" | "off";
  /** ยอดของรอบบิลนี้ null = ไม่ได้ใช้ Tavily หรือเซิร์ฟเวอร์ถามไม่สำเร็จ */
  month: { used: number; limit: number | null } | null;
  /** การใช้ผลค้นที่จำไว้ของเซิร์ฟเวอร์ตัวที่ตอบ นับตั้งแต่ since */
  cache: { hits: number; misses: number; since: string } | null;
}

const SERVICES: ReadonlyArray<SearchUsageView["service"]> = ["tavily", "provider", "off"];
const USAGE_TIMEOUT_MS = 8_000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const countOf = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

/** อ่านคำตอบของ /api/search/usage คืน null ถ้าไม่ใช่รูปแบบที่รู้จัก (เช่น เซิร์ฟเวอร์รุ่นเก่า) */
export function parseSearchUsage(payload: unknown): SearchUsageView | null {
  const search = isRecord(payload) ? payload.search : null;
  if (!isRecord(search)) return null;
  const service = SERVICES.find((each) => each === search.service);
  if (!service) return null;

  let month: SearchUsageView["month"] = null;
  if (isRecord(search.month)) {
    const used = countOf(search.month.used);
    const limit = countOf(search.month.limit);
    if (used !== null) month = { used, limit: limit && limit > 0 ? limit : null };
  }

  let cache: SearchUsageView["cache"] = null;
  if (isRecord(search.cache)) {
    const hits = countOf(search.cache.hits);
    const misses = countOf(search.cache.misses);
    const since = typeof search.cache.since === "string" && !Number.isNaN(Date.parse(search.cache.since)) ? search.cache.since : null;
    if (hits !== null && misses !== null && since) cache = { hits, misses, since };
  }
  return { service, month, cache };
}

/** ถามยอดใช้การค้นเว็บ คืน null เมื่อถามไม่สำเร็จ แผงสถานะจึงแสดงต่อได้โดยไม่มีช่องนี้ */
export async function fetchSearchUsage(signal?: AbortSignal): Promise<SearchUsageView | null> {
  try {
    const response = await fetchWithTimeout("/api/search/usage", {
      headers: sessionStore.authHeaders(),
      timeoutMs: USAGE_TIMEOUT_MS,
      signal
    });
    if (!response.ok) return null;
    return parseSearchUsage(await response.json());
  } catch {
    return null;
  }
}
