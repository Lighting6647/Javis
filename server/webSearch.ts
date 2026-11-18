/**
 * บริการค้นเว็บภายนอก สำหรับผู้ให้บริการ AI ที่ค้นเว็บเองไม่ได้หรือค้นได้เฉพาะแบบเสียเงิน
 * ตอนนี้รองรับ Tavily ซึ่งมีโควตาฟรีรายเดือนและไม่ต้องใช้บัตรเครดิต
 * AI ขอค้นผ่านเครื่องมือของ Javis เซิร์ฟเวอร์ค้นที่นี่ แล้วส่งผลค้นให้ AI ใช้ตอบ
 */
import { safeHttpUrl, type SearchRecency } from "./responseStream.js";
import { sanitizeUpstreamMessage } from "./upstreamError.js";

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

export interface WebSearchProvider {
  name: "tavily";
  /** ชื่อสำหรับแสดงใน log */
  label: string;
  apiKey: string;
  baseUrl: string;
}

/** ผลค้นเว็บหนึ่งรายการ ที่ตรวจและทำความสะอาดแล้ว */
export interface WebSearchResult {
  title: string;
  url: string;
  /** เนื้อหาย่อของหน้าเว็บที่ตรงกับคำค้น */
  content: string;
  publishedDate?: string;
}

/** สาเหตุที่ค้นไม่สำเร็จ จัดกลุ่มเพื่อเลือกว่าจะปิดการค้น พักไว้ หรือลองใหม่ครั้งหน้า */
export type WebSearchFailureReason = "auth" | "quota" | "busy" | "unknown";

export type WebSearchOutcome =
  | {
      ok: true;
      results: WebSearchResult[];
      /** ช่วงเวลาที่ผลค้นชุดนี้ถูกจำกัดไว้ ไม่มี = ไม่จำกัด */
      recency?: SearchRecency;
      /** ช่วงเวลาที่ขอไว้ซึ่งค้นแล้วไม่พบอะไร ผลชุดนี้จึงมาจากการค้นซ้ำแบบไม่จำกัดช่วง และอาจเป็นข้อมูลเก่า */
      widenedFrom?: SearchRecency;
      /** ผลชุดนี้มาจากที่จำไว้ ไม่ได้ค้นใหม่ */
      cached?: true;
    }
  | {
      ok: false;
      /** รหัสสถานะ HTTP ของต้นทาง หรือ 0 ถ้าเชื่อมต่อไม่ได้ */
      status: number;
      reason: WebSearchFailureReason;
      /** ข้อความของต้นทางที่ปิดบังสิ่งที่ดูเหมือนกุญแจแล้ว สำหรับ log ของผู้ดูแลเท่านั้น */
      logDetail: string;
    };

const TAVILY_BASE_URL = "https://api.tavily.com";
/** จำนวนผลค้นที่ส่งต่อให้ AI: พอให้ตอบได้ และไม่ทำให้คำขอยาวจนตอบช้า */
export const MAX_SEARCH_RESULTS = 5;
const MAX_RESULT_TITLE_LENGTH = 120;
export const MAX_RESULT_CONTENT_LENGTH = 700;
const MAX_DATE_LENGTH = 40;
/** การค้นแบบพื้นฐานของ Tavily ปกติตอบภายในหนึ่งถึงสองวินาที */
const SEARCH_TIMEOUT_MS = 15_000;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const read = (env: Env, name: string) => env[name]?.trim() || undefined;

/** เลือกบริการค้นเว็บภายนอกจากตัวแปรสภาพแวดล้อม คืน null ถ้าไม่ได้ตั้งกุญแจ */
export function resolveWebSearchProvider(env: Env, warn: (message: string) => void = console.warn): WebSearchProvider | null {
  const apiKey = read(env, "TAVILY_API_KEY");
  if (!apiKey) return null;

  let baseUrl = TAVILY_BASE_URL;
  const custom = read(env, "TAVILY_BASE_URL");
  if (custom) {
    if (URL.canParse(custom) && /^https?:$/.test(new URL(custom).protocol)) baseUrl = custom.replace(/\/+$/, "");
    else warn("ค่า TAVILY_BASE_URL ไม่ใช่ URL ที่ถูกต้อง ใช้ค่าเริ่มต้นแทน");
  }
  return { name: "tavily", label: "Tavily", apiKey, baseUrl };
}

const oneLine = (value: unknown, maxLength: number): string =>
  typeof value === "string"
    ? value
        .replace(/\p{Cc}+/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
    : "";

/** ตรวจผลค้นจากต้นทาง: เก็บเฉพาะรายการที่ลิงก์ปลอดภัยและมีเนื้อหา ไม่ซ้ำกัน และไม่เกินจำนวนที่กำหนด */
function readResults(payload: unknown): WebSearchResult[] {
  const items = isObject(payload) && Array.isArray(payload.results) ? payload.results : [];
  const results = new Map<string, WebSearchResult>();

  for (const item of items) {
    if (results.size >= MAX_SEARCH_RESULTS) break;
    if (!isObject(item)) continue;

    const url = safeHttpUrl(item.url);
    const content = oneLine(item.content, MAX_RESULT_CONTENT_LENGTH);
    if (!url || !content || results.has(url)) continue;

    const publishedDate = oneLine(item.published_date, MAX_DATE_LENGTH);
    results.set(url, {
      title: oneLine(item.title, MAX_RESULT_TITLE_LENGTH) || new URL(url).hostname.replace(/^www\./, ""),
      url,
      content,
      ...(publishedDate ? { publishedDate } : {})
    });
  }
  return [...results.values()];
}

/** 432 และ 433 คือรหัสของ Tavily เมื่อใช้เกินโควตาของแผนหรือเกินวงเงินที่ตั้งไว้ */
function reasonOf(status: number): WebSearchFailureReason {
  if (status === 401 || status === 403) return "auth";
  if (status === 432 || status === 433) return "quota";
  if (status === 429) return "busy";
  return "unknown";
}

/** ข้อความแจ้งข้อผิดพลาดของต้นทาง ซึ่งวางไว้ได้หลายตำแหน่ง */
function errorMessageOf(payload: unknown): unknown {
  if (!isObject(payload)) return undefined;
  if (isObject(payload.detail)) return payload.detail.error ?? payload.detail.message;
  return payload.detail ?? payload.error ?? payload.message;
}

type FoundOutcome = Extract<WebSearchOutcome, { ok: true }>;

/**
 * ระยะเวลาที่จำผลค้นไว้: ราคาทองไทยประกาศเปลี่ยนไม่กี่ครั้งต่อวัน ผลที่ช้ากว่าจริงไม่เกิน 10 นาทีจึงรับได้
 * ส่วนเรื่องที่เปลี่ยนเร็วกว่านี้ (เช่น ผลบอลสด) จะได้ผลที่ช้าไม่เกินเท่านี้เช่นกัน
 */
export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
/** จำนวนผลค้นที่จำได้สูงสุด ผลค้นหนึ่งชุดไม่เกินราว 5 KB ทั้งหมดจึงไม่เกินราว 0.5 MB */
export const SEARCH_CACHE_MAX_ENTRIES = 100;

/** สถิติการใช้ความจำผลค้น นับตั้งแต่เซิร์ฟเวอร์ตัวนี้เริ่มทำงาน */
export interface SearchCacheStats {
  /** ค้นแล้วได้ผลที่จำไว้ ไม่ต้องค้นใหม่ */
  hits: number;
  /** ค้นแล้วไม่มีผลที่จำไว้ ต้องค้นใหม่ */
  misses: number;
  /** เวลาที่เริ่มนับ (มิลลิวินาทีตั้งแต่ epoch) */
  since: number;
}

/** ความจำผลค้นของเซิร์ฟเวอร์หนึ่งตัว บน Vercel อยู่ได้เท่าที่เซิร์ฟเวอร์ตัวนั้นยังเปิดอยู่ */
export interface SearchCache {
  get(query: string, recency: SearchRecency | null | undefined): FoundOutcome | null;
  set(query: string, recency: SearchRecency | null | undefined, outcome: FoundOutcome): void;
  readonly size: number;
  stats(): SearchCacheStats;
}

/** คำค้นที่ต่างกันแค่ตัวพิมพ์ ช่องว่าง หรือรูปแบบการเข้ารหัสตัวอักษร ถือเป็นคำค้นเดียวกัน */
const cacheKeyOf = (query: string, recency: SearchRecency | null | undefined) =>
  `${recency ?? "any"} ${query.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim()}`;

/**
 * จำผลค้นที่พบข้อมูลไว้ชั่วคราว ให้คำถามเดิมตอบได้เร็วขึ้นโดยไม่ใช้เครดิตซ้ำ
 * ไม่จำผลที่ว่างหรือค้นไม่สำเร็จ เพื่อให้ครั้งถัดไปได้ค้นใหม่ เมื่อเต็มจะลบรายการที่จำไว้นานที่สุดออกก่อน
 * @param now นาฬิกา (ให้การทดสอบเลื่อนเวลาได้)
 */
export function createSearchCache(
  options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}
): SearchCache {
  const { ttlMs = SEARCH_CACHE_TTL_MS, maxEntries = SEARCH_CACHE_MAX_ENTRIES, now = Date.now } = options;
  const entries = new Map<string, { outcome: FoundOutcome; expiresAt: number }>();
  const counts = { hits: 0, misses: 0, since: now() };

  const lookup = (key: string): FoundOutcome | null => {
    const entry = entries.get(key);
    if (!entry) return null;
    if (now() >= entry.expiresAt) {
      entries.delete(key);
      return null;
    }
    return entry.outcome;
  };

  return {
    get(query, recency) {
      const found = lookup(cacheKeyOf(query, recency));
      if (found) counts.hits += 1;
      else counts.misses += 1;
      return found;
    },
    set(query, recency, outcome) {
      if (outcome.results.length === 0) return;
      const key = cacheKeyOf(query, recency);
      // ลบก่อนใส่ใหม่ ให้รายการนี้นับเป็นรายการล่าสุด
      entries.delete(key);
      entries.set(key, { outcome, expiresAt: now() + ttlMs });
      for (const oldest of entries.keys()) {
        if (entries.size <= maxEntries) break;
        entries.delete(oldest);
      }
    },
    get size() {
      return entries.size;
    },
    stats() {
      return { ...counts };
    }
  };
}

interface SearchOptions {
  /** ช่วงเวลาของข้อมูลที่ต้องการ นับย้อนจากวันนี้ ไม่กำหนด = ไม่จำกัด */
  recency?: SearchRecency | null;
  /** ความจำผลค้น ไม่กำหนด = ค้นใหม่ทุกครั้ง */
  cache?: SearchCache;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * ค้นเว็บ ไม่ throw: ความล้มเหลวทุกแบบคืนเป็นผลลัพธ์ เพราะการค้นไม่สำเร็จต้องไม่ทำให้คำตอบของผู้ใช้ล้ม
 * ถ้าจำกัดช่วงเวลาแล้วไม่พบอะไรเลย จะค้นซ้ำหนึ่งครั้งแบบไม่จำกัด (ใช้อีกหนึ่งเครดิต)
 * เพราะหน้าที่อัปเดตทุกวัน เช่น หน้าราคาทอง อาจยังเก็บวันที่เผยแพร่ครั้งแรกไว้ จึงหลุดจากการกรองตามช่วงเวลา
 */
export async function searchWeb(provider: WebSearchProvider, query: string, options: SearchOptions = {}): Promise<WebSearchOutcome> {
  const recency = options.recency ?? undefined;
  const remembered = options.cache?.get(query, recency);
  if (remembered) return { ...remembered, cached: true };

  const outcome = await searchFresh(provider, query, recency, options);
  if (outcome.ok) options.cache?.set(query, recency, outcome);
  return outcome;
}

async function searchFresh(
  provider: WebSearchProvider,
  query: string,
  recency: SearchRecency | undefined,
  options: SearchOptions
): Promise<WebSearchOutcome> {
  const first = await searchOnce(provider, query, recency, options);
  if (!recency || !first.ok || first.results.length > 0) return first;

  const widened = await searchOnce(provider, query, undefined, options);
  return widened.ok ? { ...widened, widenedFrom: recency } : widened;
}

async function searchOnce(
  provider: WebSearchProvider,
  query: string,
  recency: SearchRecency | undefined,
  options: SearchOptions
): Promise<WebSearchOutcome> {
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  let status = 0;

  try {
    const response = await (options.fetchImpl ?? fetch)(`${provider.baseUrl}/search`, {
      method: "POST",
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      // basic ใช้หนึ่งเครดิตต่อการค้น และไม่ขอคำตอบสำเร็จรูป เพราะ AI ของ Javis เป็นผู้ตอบเอง
      // ขอวันที่เผยแพร่ของแต่ละหน้า (ไม่คิดเครดิตเพิ่ม) ให้ AI เทียบกับวันนี้ได้ว่าข้อมูลเก่าหรือใหม่
      body: JSON.stringify({
        query,
        search_depth: "basic",
        topic: "general",
        max_results: MAX_SEARCH_RESULTS,
        include_answer: false,
        include_published_date: true,
        ...(recency ? { time_range: recency } : {})
      })
    });
    status = response.status;

    const payload: unknown = await response.json();
    if (!response.ok) return { ok: false, status, reason: reasonOf(status), logDetail: sanitizeUpstreamMessage(errorMessageOf(payload)) };
    return { ok: true, results: readResults(payload), ...(recency ? { recency } : {}) };
  } catch (error) {
    // เชื่อมต่อไม่ได้ หมดเวลา หรือคำตอบไม่ใช่ JSON
    const message = error instanceof Error ? error.message : "";
    return { ok: false, status, reason: status === 0 || status === 200 ? "unknown" : reasonOf(status), logDetail: sanitizeUpstreamMessage(message) };
  }
}

/** ยอดใช้งานของบริการค้นเว็บในรอบบิลปัจจุบัน ตามที่บริการรายงาน */
export interface SearchUsage {
  /** เครดิตที่ใช้ไปแล้วในรอบบิลนี้ */
  used: number;
  /** เพดานเครดิตของรอบบิล null = ไม่จำกัดหรือบริการไม่ได้บอก */
  limit: number | null;
  /** ชื่อแผน เช่น Researcher (แผนฟรี) */
  plan: string | null;
}

const USAGE_TIMEOUT_MS = 5_000;
const MAX_PLAN_NAME_LENGTH = 40;

const countOf = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

/**
 * ถามยอดใช้งานของรอบบิลนี้จาก Tavily (GET /usage) แทนการนับเอง
 * เพราะเซิร์ฟเวอร์บน Vercel เริ่มใหม่บ่อย ตัวนับในหน่วยความจำจึงหายไปกลางเดือน
 * ใช้ยอดของแผน (ทุกกุญแจในบัญชี) ซึ่งตรงกับโควตาฟรีรายเดือน ถ้าไม่มีจึงใช้ยอดของกุญแจนี้ คืน null เมื่อถามไม่สำเร็จ
 */
export async function fetchSearchUsage(provider: WebSearchProvider, options: { fetchImpl?: typeof fetch } = {}): Promise<SearchUsage | null> {
  try {
    const response = await (options.fetchImpl ?? fetch)(`${provider.baseUrl}/usage`, {
      method: "GET",
      signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${provider.apiKey}` }
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    const account = isObject(payload) && isObject(payload.account) ? payload.account : {};
    const key = isObject(payload) && isObject(payload.key) ? payload.key : {};

    const planUsed = countOf(account.plan_usage);
    const used = planUsed ?? countOf(key.usage);
    if (used === null) return null;
    const limit = planUsed !== null ? countOf(account.plan_limit) : countOf(key.limit);
    const plan = oneLine(account.current_plan, MAX_PLAN_NAME_LENGTH) || null;
    return { used, limit: limit && limit > 0 ? limit : null, plan };
  } catch {
    return null;
  }
}
