/**
 * บริการค้นเว็บภายนอก สำหรับผู้ให้บริการ AI ที่ค้นเว็บเองไม่ได้หรือค้นได้เฉพาะแบบเสียเงิน
 * ตอนนี้รองรับ Tavily ซึ่งมีโควตาฟรีรายเดือนและไม่ต้องใช้บัตรเครดิต
 * AI ขอค้นผ่านเครื่องมือของ Javis เซิร์ฟเวอร์ค้นที่นี่ แล้วส่งผลค้นให้ AI ใช้ตอบ
 */
import { safeHttpUrl } from "./responseStream.js";
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
  | { ok: true; results: WebSearchResult[] }
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
const MAX_RESULT_CONTENT_LENGTH = 700;
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

/**
 * ค้นเว็บหนึ่งครั้ง ไม่ throw: ความล้มเหลวทุกแบบคืนเป็นผลลัพธ์ เพราะการค้นไม่สำเร็จต้องไม่ทำให้คำตอบของผู้ใช้ล้ม
 */
export async function searchWeb(
  provider: WebSearchProvider,
  query: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<WebSearchOutcome> {
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  let status = 0;

  try {
    const response = await (options.fetchImpl ?? fetch)(`${provider.baseUrl}/search`, {
      method: "POST",
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      // basic ใช้หนึ่งเครดิตต่อการค้น และไม่ขอคำตอบสำเร็จรูป เพราะ AI ของ Javis เป็นผู้ตอบเอง
      body: JSON.stringify({ query, search_depth: "basic", topic: "general", max_results: MAX_SEARCH_RESULTS, include_answer: false })
    });
    status = response.status;

    const payload: unknown = await response.json();
    if (!response.ok) return { ok: false, status, reason: reasonOf(status), logDetail: sanitizeUpstreamMessage(errorMessageOf(payload)) };
    return { ok: true, results: readResults(payload) };
  } catch (error) {
    // เชื่อมต่อไม่ได้ หมดเวลา หรือคำตอบไม่ใช่ JSON
    const message = error instanceof Error ? error.message : "";
    return { ok: false, status, reason: status === 0 || status === 200 ? "unknown" : reasonOf(status), logDetail: sanitizeUpstreamMessage(message) };
  }
}
