/**
 * ยอดใช้การค้นเว็บสำหรับแผงสถานะของแอป: ใช้ตัดสินว่าโควตาฟรีพอไหม และความจำผลค้นคุ้มที่จะเก็บไว้ไหม
 * - ยอดรายเดือนถามจาก Tavily เอง เพราะเซิร์ฟเวอร์บน Vercel เริ่มใหม่บ่อย ตัวนับในหน่วยความจำจึงไม่ครบเดือน
 * - การใช้ความจำผลค้นนับในหน่วยความจำของเซิร์ฟเวอร์ตัวนี้ จึงบอกเวลาที่เริ่มนับไว้ด้วย
 */
import type { AiProvider } from "./aiProvider.js";
import { createSearchCache, fetchSearchUsage, type SearchCacheStats, type SearchUsage, type WebSearchProvider } from "./webSearch.js";

/** ผลค้นที่จำไว้ของเซิร์ฟเวอร์ตัวนี้ ใช้ร่วมกันระหว่างการตอบแชตกับแผงสถานะ */
export const searchCache = createSearchCache();

/**
 * วิธีค้นเว็บของเซิร์ฟเวอร์นี้
 * - tavily: บริการค้นเว็บภายนอก นับยอดและจำผลค้นได้
 * - provider: เครื่องมือค้นของผู้ให้บริการ AI เอง (OpenAI, Claude หรือ Google ของ Gemini) ยอดอยู่ในบัญชีของผู้ให้บริการ
 * - off: ไม่ค้นเว็บ
 */
export type SearchService = "tavily" | "provider" | "off";

export interface SearchUsageSnapshot {
  service: SearchService;
  /** ยอดของรอบบิลนี้จาก Tavily null = ไม่ได้ใช้ Tavily หรือถามไม่สำเร็จ */
  month: SearchUsage | null;
  /** การใช้ผลค้นที่จำไว้ ตั้งแต่เซิร์ฟเวอร์ตัวนี้เริ่มทำงาน (since เป็นเวลา ISO) null = ไม่ได้ใช้ Tavily */
  cache: (Omit<SearchCacheStats, "since"> & { since: string }) | null;
}

/** ถามยอดจาก Tavily ไม่บ่อยกว่านี้ แผงสถานะของผู้ใช้หลายคนจึงไม่ทำให้ถามซ้ำถี่ */
export const USAGE_REFRESH_MS = 5 * 60 * 1000;
/** หลังเซิร์ฟเวอร์ตัวนี้ค้นใหม่ ถามยอดใหม่ได้เร็วขึ้น แต่ไม่ถี่กว่านี้ */
export const USAGE_REFRESH_AFTER_SEARCH_MS = 15_000;

export function searchServiceOf(ai: Pick<AiProvider, "apiStyle" | "webSearch">, external: WebSearchProvider | null): SearchService {
  if (!ai.webSearch) return "off";
  // ตรงกับเงื่อนไขใน server/chat.ts: บริการค้นเว็บภายนอกใช้กับผู้ให้บริการแบบ Chat Completions (Gemini) เท่านั้น
  return ai.apiStyle === "chat" && external ? "tavily" : "provider";
}

/**
 * สร้างตัวอ่านยอดใช้การค้นเว็บ จำยอดจาก Tavily ไว้ USAGE_REFRESH_MS
 * ถ้าเซิร์ฟเวอร์ตัวนี้ค้นใหม่หลังถามยอดครั้งก่อน ยอดที่จำไว้ล้าสมัยแล้ว จึงถามใหม่เมื่อผ่านไป USAGE_REFRESH_AFTER_SEARCH_MS
 * ถามไม่สำเร็จจะไม่จำ เพื่อให้ครั้งถัดไปถามใหม่
 */
export function createSearchUsageReader(options: {
  ai: Pick<AiProvider, "apiStyle" | "webSearch">;
  external: WebSearchProvider | null;
  cache?: typeof searchCache;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const { ai, external, cache = searchCache, fetchImpl, now = Date.now } = options;
  let remembered: { usage: SearchUsage; at: number; misses: number } | null = null;
  let pending: Promise<SearchUsage | null> | null = null;

  const isFresh = (misses: number): boolean => {
    if (!remembered) return false;
    const age = now() - remembered.at;
    // ค้นใหม่ (ไม่ได้ใช้ผลที่จำไว้) หลังถามยอดครั้งก่อน: ยอดของ Tavily เปลี่ยนแล้ว
    const searchedSince = misses > remembered.misses;
    return age < (searchedSince ? USAGE_REFRESH_AFTER_SEARCH_MS : USAGE_REFRESH_MS);
  };

  /** ยอดที่จำไว้ บวกการค้นใหม่ของเซิร์ฟเวอร์ตัวนี้หลังจากนั้น ตัวเลขบนแผงจึงขยับทันทีโดยไม่ต้องถาม Tavily ทุกครั้ง */
  const estimate = (misses: number): SearchUsage | null =>
    remembered ? { ...remembered.usage, used: remembered.usage.used + Math.max(0, misses - remembered.misses) } : null;

  const monthUsage = async (provider: WebSearchProvider, misses: number): Promise<SearchUsage | null> => {
    if (remembered && isFresh(misses)) return estimate(misses);
    // ผู้ใช้หลายคนเปิดแผงพร้อมกัน: ถาม Tavily ครั้งเดียว
    pending ??= fetchSearchUsage(provider, { fetchImpl }).finally(() => {
      pending = null;
    });
    const usage = await pending;
    if (usage) remembered = { usage, at: now(), misses };
    return usage ?? estimate(misses);
  };

  return async (): Promise<SearchUsageSnapshot> => {
    const service = searchServiceOf(ai, external);
    if (service !== "tavily" || !external) return { service, month: null, cache: null };

    const stats = cache.stats();
    return {
      service,
      month: await monthUsage(external, stats.misses),
      cache: { ...stats, since: new Date(stats.since).toISOString() }
    };
  };
}
