import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { ChatEvent } from "./chatProtocol.js";

/**
 * ตรวจล่วงหน้าว่าหน้าเว็บหนึ่งแสดงในกรอบ (iframe) ของหน้า Javis ได้ไหม
 *
 * เจ้าของเว็บจำนวนมากห้ามไม่ให้เว็บอื่นนำหน้าของตนไปแสดงในกรอบ (เช่น Google, YouTube, Facebook)
 * เบราว์เซอร์ทำตามคำห้ามนั้นเสมอ และหน้าที่ถูกห้ามจะขึ้นเป็นกรอบว่างพร้อมข้อผิดพลาด โดยหน้า Javis ตรวจเองไม่ได้ว่าเกิดอะไรขึ้น
 * เซิร์ฟเวอร์จึงอ่านหัวข้อของคำตอบจากเว็บนั้นก่อน: ถ้าแสดงได้ หน้า Javis แสดงในกรอบ ถ้าไม่ได้ ก็เปิดแบบเดิม
 * Javis ไม่เลี่ยงคำห้ามของเจ้าของเว็บ (ไม่ดึงหน้ามาส่งต่อเอง)
 *
 * ลิงก์มาจาก AI จึงถือว่าไม่น่าไว้ใจ: ขอเฉพาะเว็บ https บนที่อยู่สาธารณะ ต่อไปยังที่อยู่ที่ตรวจแล้วเท่านั้น
 * ตรวจซ้ำทุกครั้งที่ถูกพาไปต่อ อ่านเฉพาะหัวข้อ และมีเวลาจำกัด เพื่อไม่ให้ใครใช้เซิร์ฟเวอร์ส่องเครือข่ายภายใน
 */

/** ส่วนของคำตอบจากเว็บที่ใช้ตัดสิน */
export interface FrameResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
}

/** สิ่งที่ตัวตรวจต้องการจากเครือข่าย แยกไว้เพื่อให้ทดสอบได้โดยไม่ต่ออินเทอร์เน็ต */
export interface FrameCheckDeps {
  /** ที่อยู่ IP ทั้งหมดของชื่อเว็บ */
  resolve: (hostname: string) => Promise<string[]>;
  /** ขอหน้าเว็บจากที่อยู่ที่ตรวจแล้ว และคืนเฉพาะสถานะกับหัวข้อของคำตอบ */
  head: (target: { url: URL; address: string; signal: AbortSignal }) => Promise<FrameResponse>;
}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 2500;
/** เว็บจำนวนหนึ่งตอบหัวข้อต่างกันเมื่อไม่ใช่เบราว์เซอร์ จึงขอแบบเดียวกับที่เบราว์เซอร์ของผู้ใช้จะขอ */
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv6");
}

/** ที่อยู่ IP นี้อยู่บนอินเทอร์เน็ตสาธารณะไหม (ไม่ใช่เครื่องตัวเอง เครือข่ายภายใน หรือช่วงสงวน) */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !NON_PUBLIC.check(address, "ipv4");
  if (family !== 6) return false;

  // ที่อยู่ IPv4 ที่เขียนในรูป IPv6: ตัดสินจากที่อยู่ IPv4 ข้างใน ส่วนรูปอื่นที่อ่านไม่ออกถือว่าไม่ปลอดภัย
  const mapped = /^::ffff:(.+)$/i.exec(address);
  if (mapped) return isIP(mapped[1] ?? "") === 4 && isPublicAddress(mapped[1] ?? "");
  return !NON_PUBLIC.check(address, "ipv6");
}

const firstValue = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** รายการแหล่งที่ยอมให้นำหน้านี้ไปแสดงในกรอบ ตามนโยบายหนึ่งชุด หรือ null ถ้านโยบายนั้นไม่ได้พูดถึง */
function frameAncestors(policy: string): string[] | null {
  for (const directive of policy.split(";")) {
    const [name, ...sources] = directive.trim().toLowerCase().split(/\s+/);
    if (name === "frame-ancestors") return sources;
  }
  return null;
}

/** คำตอบจากเว็บนี้ยอมให้เว็บ https อื่นนำหน้าไปแสดงในกรอบไหม */
export function allowsFraming({ status, headers }: FrameResponse): boolean {
  if (status < 200 || status > 299 || status === 204 || status === 205) return false;

  const contentType = firstValue(headers["content-type"])?.trim() ?? "";
  if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType)) return false;

  // ค่าใดก็ตามของหัวข้อนี้คือคำห้ามสำหรับเว็บอื่น ค่าที่เบราว์เซอร์ไม่รู้จักก็ไม่เสี่ยงเดา
  if (headers["x-frame-options"] !== undefined) return false;

  const policies = [headers["content-security-policy"] ?? []].flat().flatMap((value) => value.split(","));
  // ทุกนโยบายต้องยอม: เบราว์เซอร์บังคับใช้ทุกชุดพร้อมกัน
  return policies.every((policy) => {
    const allowed = frameAncestors(policy);
    return allowed === null || allowed.some((source) => source === "*" || source === "https:");
  });
}

/**
 * หน้าผลค้นของ Google ห้ามแสดงในกรอบ: คืนหน้าผลค้นของ Bing ที่แสดงในกรอบได้ด้วยคำค้นเดียวกัน
 * คืน null ถ้าลิงก์ไม่ใช่หน้าผลค้นของ Google ที่มีคำค้น
 */
export function frameFriendlyUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/search") return null;
  if (!/^(www\.)?google\.(com|co\.th)$/.test(parsed.hostname)) return null;

  const query = parsed.searchParams.get("q")?.trim();
  if (!query) return null;

  const results = new URL("https://www.bing.com/search");
  results.searchParams.set("q", query);
  return results.href;
}

/** ลิงก์ที่ยอมให้เซิร์ฟเวอร์ไปขอ: https บนพอร์ตปกติ ใช้ชื่อเว็บจริง (ไม่ใช่เลข IP หรือชื่อเครื่องภายใน) และไม่มีชื่อผู้ใช้ */
function parseTarget(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.port !== "" || parsed.username !== "" || parsed.password !== "") return null;

  const { hostname } = parsed;
  if (hostname.startsWith("[") || isIP(hostname) !== 0 || !hostname.includes(".")) return null;
  return parsed;
}

/** จบด้วยข้อผิดพลาดเมื่อหมดเวลา แม้งานข้างในจะไม่สนใจสัญญาณยกเลิก */
function unlessAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("timeout"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export const nodeFrameCheckDeps: FrameCheckDeps = {
  resolve: async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address),
  head: ({ url, address, signal }) =>
    new Promise<FrameResponse>((resolve, reject) => {
      // ต่อไปยังที่อยู่ที่ตรวจแล้วเท่านั้น ถ้าปล่อยให้ระบบหาที่อยู่เองอีกรอบ อาจได้ที่อยู่อื่นที่ไม่ได้ตรวจ
      const pinned: LookupFunction = (_hostname, options, callback) => {
        const family = isIP(address);
        if (options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      };
      const request = httpsRequest(
        {
          host: url.hostname,
          servername: url.hostname,
          port: 443,
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: { "user-agent": BROWSER_USER_AGENT, accept: "text/html,application/xhtml+xml", "accept-language": "th,en;q=0.8" },
          lookup: pinned,
          signal
        },
        (response) => {
          resolve({ status: response.statusCode ?? 0, headers: response.headers });
          // ต้องการแค่หัวข้อของคำตอบ จึงไม่โหลดเนื้อหาของหน้า
          response.destroy();
          request.destroy();
        }
      );
      request.on("error", reject);
      request.end();
    })
};

/**
 * หน้าเว็บนี้แสดงในกรอบของหน้า Javis ได้ไหม ไม่ล้มเหลว: ตรวจไม่ได้ด้วยเหตุใดก็ตามถือว่าไม่ได้
 * ซึ่งหน้า Javis จะเปิดหน้านั้นแบบเดิม (แท็บใหม่) แทน
 */
export async function canEmbedPage(url: string, deps: FrameCheckDeps = nodeFrameCheckDeps, options: { timeoutMs?: number } = {}): Promise<boolean> {
  const deadline = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    let target = parseTarget(url);
    for (let hop = 0; target && hop <= MAX_REDIRECTS; hop += 1) {
      const addresses = await unlessAborted(deps.resolve(target.hostname), deadline);
      if (addresses.length === 0 || !addresses.every(isPublicAddress)) return false;

      const response = await unlessAborted(deps.head({ url: target, address: addresses[0] ?? "", signal: deadline }), deadline);
      if (response.status < 300 || response.status > 399) return allowsFraming(response);

      // ถูกพาไปต่อ: ปลายทางใหม่ต้องผ่านการตรวจเหมือนลิงก์แรกทุกข้อ
      const location = firstValue(response.headers.location);
      if (!location) return false;
      target = parseTarget(new URL(location, target).href);
    }
    return false;
  } catch {
    return false;
  }
}

type OpenEvent = Extract<ChatEvent, { type: "open" }>;

/**
 * ตัดสินว่าหน้าที่ผู้ใช้สั่งเปิดจะแสดงในกรอบของหน้า Javis ได้ไหม และเติมคำตัดสินลงในเหตุการณ์
 * ตัดสินเฉพาะหน้าที่จะเปิดให้เอง (auto) ส่วนลิงก์ที่ให้ผู้ใช้กดเองไม่ต้องตรวจ
 * หน้าผลค้นของ Google ซึ่งห้ามแสดงในกรอบ จะเปลี่ยนเป็นหน้าผลค้นที่แสดงได้ด้วยคำค้นเดิม ถ้าหน้านั้นแสดงได้จริง
 */
export async function decideFraming(event: OpenEvent, check: (url: string) => Promise<boolean> = canEmbedPage): Promise<OpenEvent> {
  if (!event.auto) return { ...event, embed: false };

  const friendly = frameFriendlyUrl(event.url);
  if (friendly === null) return { ...event, embed: await check(event.url) };
  return (await check(friendly)) ? { ...event, url: friendly, embed: true } : { ...event, embed: false };
}
