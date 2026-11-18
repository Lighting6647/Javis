import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { isPublicAddress } from "./frameCheck.js";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_READ_BYTES = 512 * 1024;
export const MAX_READ_TEXT_LENGTH = 4_000;
const MAX_TITLE_LENGTH = 140;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const READABLE_CONTENT_TYPE =
  /^(text\/html|application\/xhtml\+xml|text\/plain|text\/markdown|application\/json|application\/xml|text\/xml|application\/rss\+xml|application\/atom\+xml)\b/i;

export interface WebPageResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface WebReaderDeps {
  resolve: (hostname: string) => Promise<string[]>;
  get: (target: { url: URL; address: string; signal: AbortSignal }) => Promise<WebPageResponse>;
}

export type WebReadFailureReason = "invalid_url" | "blocked_host" | "unsupported_type" | "http_error" | "network";

export type WebReadOutcome =
  | { ok: true; url: string; title: string; text: string }
  | { ok: false; reason: WebReadFailureReason; detail: string };

const firstHeader = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, dec: string) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    });
}

function collapseText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_READ_TEXT_LENGTH);
}

/**
 * แปลงเนื้อหา HTML/XML/Text ให้เป็นข้อความอ่านง่ายและปลอดภัยสำหรับให้ AI สรุปหรืออ่านออกเสียง
 * ตัด script, style, svg และแท็กที่ไม่ใช่เนื้อหาหลักออกทั้งหมด
 */
export function extractReadableText(body: string, contentType: string, fallbackTitle = ""): { title: string; text: string } {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime === "text/plain" || mime === "text/markdown" || mime === "application/json") {
    return { title: fallbackTitle.slice(0, MAX_TITLE_LENGTH), text: collapseText(body) };
  }

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
  const rawTitle = titleMatch ? collapseText(decodeEntities(titleMatch[1].replace(/<[^>]+>/g, " "))) : "";
  const title = (rawTitle || fallbackTitle).slice(0, MAX_TITLE_LENGTH);

  const withoutNoise = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(head|title|script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const withBreaks = withoutNoise.replace(/<\/?(?:p|div|li|h[1-6]|tr|br|section|article|header|footer|blockquote)\b[^>]*>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, " ");
  const text = collapseText(decodeEntities(stripped));

  return { title, text };
}

function defaultResolve(hostname: string): Promise<string[]> {
  return lookup(hostname, { all: true }).then((entries) => entries.map((entry) => entry.address));
}

function decodeResponseBody(raw: Buffer, contentEncoding: string): string {
  const encoding = contentEncoding.trim().toLowerCase();
  try {
    if (encoding === "gzip") return gunzipSync(raw, { maxOutputLength: MAX_READ_BYTES }).toString("utf8");
    if (encoding === "deflate") return inflateSync(raw, { maxOutputLength: MAX_READ_BYTES }).toString("utf8");
    if (encoding === "br") return brotliDecompressSync(raw, { maxOutputLength: MAX_READ_BYTES }).toString("utf8");
  } catch {
    // ถ้าข้อมูลถูกตัดกลางคันหรือแตกไฟล์ไม่ได้ ให้อ่านเท่าที่ถอดรหัสได้
  }
  return raw.toString("utf8");
}

function defaultGet({ url, address, signal }: { url: URL; address: string; signal: AbortSignal }): Promise<WebPageResponse> {
  return new Promise((resolve, reject) => {
    const pinnedLookup: LookupFunction = (_host, _options, callback) => {
      callback(null, address, isIP(address) === 6 ? 6 : 4);
    };

    const req = httpsRequest(
      url,
      {
        method: "GET",
        lookup: pinnedLookup,
        servername: url.hostname,
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
          "Accept-Encoding": "identity"
        }
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const headers = res.headers;

        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, headers, body: "" });
          return;
        }

        const contentType = firstHeader(headers["content-type"]);
        if (status >= 200 && status < 300 && contentType && !READABLE_CONTENT_TYPE.test(contentType.trim())) {
          res.destroy();
          resolve({ status, headers, body: "" });
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve({
            status,
            headers,
            body: decodeResponseBody(Buffer.concat(chunks), firstHeader(headers["content-encoding"]))
          });
        };
        res.on("data", (chunk: Buffer) => {
          if (totalBytes >= MAX_READ_BYTES) return;
          const remaining = MAX_READ_BYTES - totalBytes;
          const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
          chunks.push(slice);
          totalBytes += slice.length;
          if (totalBytes >= MAX_READ_BYTES) res.destroy();
        });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", reject);
      }
    );

    const onAbort = () => req.destroy(new Error("aborted"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    req.on("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    req.on("close", () => signal.removeEventListener("abort", onAbort));
    req.end();
  });
}

function parsePublicHttpsUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  return parsed;
}

/**
 * ดึงข้อมูลจากหน้าเว็บภายนอกอย่างปลอดภัย (https เท่านั้น, ตรวจ public IP ทุก hop กัน SSRF)
 * และแยกเฉพาะข้อความที่อ่านออกเสียงได้
 */
export async function readWebPage(
  rawUrl: string,
  options: { signal?: AbortSignal; deps?: WebReaderDeps; timeoutMs?: number } = {}
): Promise<WebReadOutcome> {
  const deps = options.deps ?? { resolve: defaultResolve, get: defaultGet };
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let currentUrl = parsePublicHttpsUrl(rawUrl);
  if (!currentUrl) {
    return { ok: false, reason: "invalid_url", detail: "รองรับเฉพาะลิงก์ https:// ที่ถูกต้อง" };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let addresses: string[];
    try {
      addresses = isIP(currentUrl.hostname) ? [currentUrl.hostname] : await deps.resolve(currentUrl.hostname);
    } catch {
      return { ok: false, reason: "network", detail: "ไม่พบที่อยู่ของเว็บไซต์นี้" };
    }

    const publicAddress = addresses.find(isPublicAddress);
    if (!publicAddress || !addresses.every(isPublicAddress)) {
      return { ok: false, reason: "blocked_host", detail: "ไม่อนุญาตให้เชื่อมต่อที่อยู่เครือข่ายภายใน" };
    }

    let reply: WebPageResponse;
    try {
      reply = await deps.get({ url: currentUrl, address: publicAddress, signal });
    } catch {
      return { ok: false, reason: "network", detail: "ไม่สามารถเชื่อมต่อหน้าเว็บปลายทางได้" };
    }

    if (reply.status >= 300 && reply.status < 400) {
      const location = firstHeader(reply.headers.location);
      if (!location || hop === MAX_REDIRECTS) {
        return { ok: false, reason: "network", detail: "หน้าเว็บเปลี่ยนเส้นทางหลายครั้งเกินไป" };
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        return { ok: false, reason: "invalid_url", detail: "ลิงก์เปลี่ยนเส้นทางไม่ถูกต้อง" };
      }
      if (nextUrl.protocol !== "https:" || nextUrl.username || nextUrl.password) {
        return { ok: false, reason: "blocked_host", detail: "ปลายทางเปลี่ยนเส้นทางไปยังโปรโตคอลที่ไม่ปลอดภัย" };
      }
      currentUrl = nextUrl;
      continue;
    }

    if (reply.status < 200 || reply.status >= 300) {
      return { ok: false, reason: "http_error", detail: `หน้าเว็บตอบสถานะ ${reply.status}` };
    }

    const contentType = firstHeader(reply.headers["content-type"]);
    if (contentType && !READABLE_CONTENT_TYPE.test(contentType.trim())) {
      return { ok: false, reason: "unsupported_type", detail: "หน้านี้ไม่ใช่ข้อความหรือหน้าเว็บที่อ่านออกเสียงได้" };
    }

    const { title, text } = extractReadableText(reply.body, contentType, currentUrl.hostname);
    if (!text) {
      return { ok: false, reason: "http_error", detail: "ไม่พบข้อความที่อ่านได้บนหน้าเว็บนี้" };
    }

    return { ok: true, url: currentUrl.href, title, text };
  }

  return { ok: false, reason: "network", detail: "ไม่สามารถดึงหน้าเว็บได้" };
}
