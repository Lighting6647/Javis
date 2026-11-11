import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { MIN_SESSION_SECRET_LENGTH, parseAccessCodes } from "./auth.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/** ต้นทางของแอป Capacitor: Android (androidScheme: https) และ iOS */
const NATIVE_APP_ORIGINS = ["https://localhost", "capacitor://localhost"];

/** ต้นทางของ Vite dev server ใช้เฉพาะตอนพัฒนา */
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CHAT_MODEL = "gpt-4.1-mini";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-transcribe";

function readInteger(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    console.warn(`ค่า ${name} ไม่ถูกต้อง ใช้ค่าเริ่มต้น ${fallback} แทน`);
    return fallback;
  }
  return value;
}

function readBaseUrl(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  if (!URL.canParse(raw) || !/^https?:$/.test(new URL(raw).protocol)) {
    console.warn(`ค่า ${name} ไม่ใช่ URL ที่ถูกต้อง ใช้ค่าเริ่มต้นแทน`);
    return fallback;
  }
  return raw.replace(/\/+$/, "");
}

export function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, "");
}

function readExtraOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map(normalizeOrigin)
    .filter((origin) => {
      if (!origin) return false;
      if (origin === "*" || !URL.canParse(origin)) {
        console.warn(`ข้าม ALLOWED_ORIGINS ที่ไม่ถูกต้อง: ${origin}`);
        return false;
      }
      return true;
    });
}

/**
 * กุญแจลงลายเซ็นโทเค็น ถ้าไม่ได้ตั้งหรือสั้นเกินไปจะสุ่มใหม่ทุกครั้งที่เริ่มเซิร์ฟเวอร์
 * ซึ่งปลอดภัย แต่ผู้ใช้ต้องเข้าสู่ระบบใหม่หลังรีสตาร์ต
 */
function readSessionSecret(authEnabled: boolean): string {
  const secret = process.env.SESSION_SECRET?.trim() ?? "";
  if (secret.length >= MIN_SESSION_SECRET_LENGTH) return secret;

  if (authEnabled) {
    console.warn(
      secret
        ? `SESSION_SECRET สั้นกว่า ${MIN_SESSION_SECRET_LENGTH} ตัวอักษร จึงใช้ค่าสุ่มชั่วคราวแทน ผู้ใช้ต้องเข้าสู่ระบบใหม่ทุกครั้งที่รีสตาร์ต`
        : "ยังไม่ได้ตั้ง SESSION_SECRET จึงใช้ค่าสุ่มชั่วคราว ผู้ใช้ต้องเข้าสู่ระบบใหม่ทุกครั้งที่รีสตาร์ต"
    );
  }
  return randomBytes(32).toString("hex");
}

const isProduction = process.env.NODE_ENV === "production";
const accessUsers = parseAccessCodes(process.env.ACCESS_CODES);

export const config = {
  isProduction,
  /** ผู้ใช้ที่เข้าใช้งานได้ พร้อมรหัสของแต่ละคน ว่างเปล่า = ไม่บังคับเข้าสู่ระบบ (เฉพาะตอนพัฒนา) */
  accessUsers,
  sessionSecret: readSessionSecret(accessUsers.length > 0),
  port: readInteger("PORT", 8787, 1),
  apiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
  /** โมเดลข้อความที่ใช้คิดคำตอบ ควรเป็นโมเดลที่ตอบเร็วเพราะคำตอบถูกอ่านออกเสียงทันที */
  chatModel: process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL,
  openaiBaseUrl: readBaseUrl("OPENAI_BASE_URL", DEFAULT_OPENAI_BASE_URL),
  /** โมเดลแปลงเสียงเป็นข้อความ ใช้เฉพาะแอปเดสก์ท็อปที่ต้องอัดเสียงส่งมา */
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL,
  /** ให้ AI ค้นเว็บเองเมื่อคำถามต้องใช้ข้อมูลล่าสุด (มีค่าใช้จ่ายต่อการค้นหนึ่งครั้ง) ปิดได้ด้วย WEB_SEARCH_ENABLED=false */
  webSearchEnabled: process.env.WEB_SEARCH_ENABLED?.trim().toLowerCase() !== "false",
  /** ตรวจกุญแจ API และโมเดลตอนเริ่มเซิร์ฟเวอร์ (ไม่มีค่าใช้จ่าย) ปิดได้ด้วย AI_STARTUP_CHECK=false */
  aiStartupCheck: process.env.AI_STARTUP_CHECK?.trim().toLowerCase() !== "false",
  /** ตรวจเครดิตตอนเริ่มเซิร์ฟเวอร์ด้วยคำขอสั้นที่สุดหนึ่งครั้ง (ใช้โทเค็นเล็กน้อย) ปิดได้ด้วย AI_CREDIT_CHECK=false */
  aiCreditCheck: process.env.AI_CREDIT_CHECK?.trim().toLowerCase() !== "false",
  /** ระหว่างที่บัญชี AI ยังมีปัญหา ตรวจซ้ำทุกกี่วินาที เพื่อให้สถานะกลับมาปกติเองหลังผู้ดูแลแก้ไข */
  aiRecheckSeconds: readInteger("AI_RECHECK_SECONDS", 300, 5),
  /** จำนวน reverse proxy ที่อยู่หน้าเซิร์ฟเวอร์ (0 = ต่อตรง) ใช้หา IP จริงของผู้เรียก */
  trustProxyHops: readInteger("TRUST_PROXY", 0, 0),
  /** จำนวนข้อความสูงสุดที่ผู้ใช้หนึ่งคน (หรือ IP เดียวเมื่อไม่บังคับเข้าสู่ระบบ) ส่งได้ภายใน 10 นาที */
  chatRateLimitMax: readInteger("CHAT_RATE_LIMIT_MAX", 100, 1),
  allowedOrigins: new Set<string>([
    ...NATIVE_APP_ORIGINS,
    ...(isProduction ? [] : DEV_ORIGINS),
    ...readExtraOrigins()
  ])
} as const;
