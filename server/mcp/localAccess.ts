import type { IncomingHttpHeaders } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ด่านของเครื่องมือควบคุมคอมพิวเตอร์: ใช้ได้เฉพาะคำขอที่มาจากเบราว์เซอร์บนเครื่องเดียวกับเซิร์ฟเวอร์
 * เซิร์ฟเวอร์ในเครื่องมักเปิดรับทั้งวง Wi-Fi และไม่ได้ตั้งรหัส ถ้าไม่มีด่านนี้ ใครในวงเดียวกันก็สั่งเครื่องได้
 */

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP_MODULES = path.join(ROOT_DIR, "tools", "mcp", "node_modules");

/** ไฟล์เริ่มของเซิร์ฟเวอร์ MCP ซึ่งติดตั้งแยกไว้ใน tools/mcp (npm run setup:mcp) */
export const DESKTOP_COMMANDER_ENTRY = path.join(MCP_MODULES, "@wonderwhy-er", "desktop-commander", "dist", "index.js");
export const PLAYWRIGHT_ENTRY = path.join(MCP_MODULES, "@playwright", "mcp", "cli.js");

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** หัวคำขอที่ตัวส่งต่อ (Vite, ngrok, Cloudflare, Tailscale) ใส่มา แปลว่าผู้เรียกจริงอาจไม่ได้อยู่บนเครื่องนี้ */
const FORWARDING_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "cf-connecting-ip",
  "tailscale-user-login",
  "via"
];

function hostNameOf(host: string | undefined): string | null {
  if (!host || !URL.canParse(`http://${host}`)) return null;
  return new URL(`http://${host}`).hostname.toLowerCase();
}

export interface LocalRequestInfo {
  remoteAddress: string | undefined;
  headers: IncomingHttpHeaders;
}

/**
 * คำขอมาจากหน้า Luna ที่เปิดบนเครื่องนี้จริงไหม ต้องครบทุกข้อ:
 * ต่อมาจากเครื่องตัวเอง ไม่ผ่านตัวส่งต่อ ใช้ชื่อเครื่องเป็น localhost (กัน DNS rebinding) และ Origin เป็นที่อยู่เดียวกัน
 */
export function isLocalRequest({ remoteAddress, headers }: LocalRequestInfo): boolean {
  if (!remoteAddress || !LOOPBACK_ADDRESSES.has(remoteAddress)) return false;
  if (FORWARDING_HEADERS.some((name) => headers[name] !== undefined)) return false;

  const hostName = hostNameOf(headers.host);
  if (!hostName || !LOOPBACK_HOSTS.has(hostName)) return false;

  const { origin } = headers;
  if (!origin || !URL.canParse(origin)) return false;
  return new URL(origin).host === headers.host?.toLowerCase();
}

/** ผู้ดูแลเปิดให้ใช้ และเซิร์ฟเวอร์ MCP ติดตั้งแล้ว ปิดเสมอบน Vercel และโหมด production */
export function pcToolsEnabled(
  env: NodeJS.ProcessEnv = process.env,
  installed: () => boolean = () => existsSync(DESKTOP_COMMANDER_ENTRY) && existsSync(PLAYWRIGHT_ENTRY)
): boolean {
  if (env.VERCEL || env.NODE_ENV === "production") return false;
  if (env.LUNA_PC_TOOLS?.trim().toLowerCase() === "false") return false;
  return installed();
}
