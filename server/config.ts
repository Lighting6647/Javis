import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { resolveAiProvider } from "./aiProvider.js";
import { MIN_SESSION_SECRET_LENGTH, parseAccessCodes } from "./auth.js";
import { resolveWebSearchProvider } from "./webSearch.js";

// quiet: ไม่ให้ dotenv พิมพ์บรรทัดแนะนำของตัวเองลง log ทุกครั้งที่เริ่ม ซึ่งกลบข้อความที่ผู้ดูแลต้องอ่าน
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

/** ต้นทางของแอป Capacitor: Android (androidScheme: https) และ iOS */
const NATIVE_APP_ORIGINS = ["https://localhost", "capacitor://localhost"];

/** ต้นทางของ Vite dev server ใช้เฉพาะตอนพัฒนา */
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

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
/** รันเป็นฟังก์ชันบน Vercel: ไม่มีกระบวนการค้าง หลาย instance ทำงานพร้อมกัน และอยู่หลังตัวรับคำขอของ Vercel เสมอ */
const isServerless = Boolean(process.env.VERCEL);
const accessUsers = parseAccessCodes(process.env.ACCESS_CODES);
const ai = resolveAiProvider(process.env);

export const config = {
  isProduction,
  isServerless,
  /** ผู้ดูแลใส่ค่า ACCESS_CODES ไว้หรือไม่ ใช้แยก "ตั้งใจเปิดให้ทุกคนใช้" ออกจาก "ตั้งรหัสไว้แต่พิมพ์ผิดรูปแบบ" */
  accessCodesConfigured: Boolean(process.env.ACCESS_CODES?.trim()),
  /** ผู้ดูแลตั้ง SESSION_SECRET ที่ยาวพอไว้หรือไม่ ถ้าไม่ กุญแจจะถูกสุ่มใหม่ทุกครั้งที่เริ่ม */
  hasSessionSecret: (process.env.SESSION_SECRET?.trim() ?? "").length >= MIN_SESSION_SECRET_LENGTH,
  /** ผู้ใช้ที่เข้าใช้งานได้ พร้อมรหัสของแต่ละคน ว่างเปล่า = ไม่บังคับเข้าสู่ระบบ (เฉพาะตอนพัฒนา) */
  accessUsers,
  sessionSecret: readSessionSecret(accessUsers.length > 0),
  port: readInteger("PORT", 8787, 1),
  /**
   * ผู้ให้บริการ AI ที่ใช้อยู่ พร้อมกุญแจ ที่อยู่ โมเดล และความสามารถของรายนั้น
   * เลือกจากกุญแจที่ตั้งไว้ (GEMINI_API_KEY หรือ OPENAI_API_KEY) หรือบังคับด้วย AI_PROVIDER
   */
  ai,
  /**
   * บริการค้นเว็บภายนอก (Tavily) สำหรับผู้ให้บริการ AI ที่ค้นเว็บเองไม่ได้ หรือค้นได้เฉพาะแบบเสียเงิน
   * null = ไม่ได้ตั้งกุญแจ TAVILY_API_KEY
   */
  webSearch: resolveWebSearchProvider(process.env),
  /**
   * ตรวจให้หน้าเว็บว่าหน้าที่ผู้ใช้สั่งเปิดแสดงในกรอบของ Javis ได้ไหม (server/frameCheck.ts) ปิดได้ด้วย WEB_FRAMES_ENABLED=false
   * เมื่อปิด หน้าเว็บจะเปิดทุกหน้าแบบเดิม (แท็บใหม่) และเซิร์ฟเวอร์ไม่ติดต่อเว็บปลายทางเลย
   */
  webFrames: process.env.WEB_FRAMES_ENABLED?.trim().toLowerCase() !== "false",
  /** ตรวจกุญแจ API และโมเดลตอนเริ่มเซิร์ฟเวอร์ (ไม่มีค่าใช้จ่าย) ปิดได้ด้วย AI_STARTUP_CHECK=false */
  aiStartupCheck: process.env.AI_STARTUP_CHECK?.trim().toLowerCase() !== "false",
  /** ระหว่างที่บัญชี AI ยังมีปัญหา ตรวจซ้ำทุกกี่วินาที เพื่อให้สถานะกลับมาปกติเองหลังผู้ดูแลแก้ไข */
  aiRecheckSeconds: readInteger("AI_RECHECK_SECONDS", 300, 5),
  /** จำนวน reverse proxy ที่อยู่หน้าเซิร์ฟเวอร์ (0 = ต่อตรง) ใช้หา IP จริงของผู้เรียก บน Vercel มีหนึ่งชั้นเสมอ */
  trustProxyHops: readInteger("TRUST_PROXY", isServerless ? 1 : 0, 0),
  /** จำนวนข้อความสูงสุดที่ผู้ใช้หนึ่งคน (หรือ IP เดียวเมื่อไม่บังคับเข้าสู่ระบบ) ส่งได้ภายใน 10 นาที */
  chatRateLimitMax: readInteger("CHAT_RATE_LIMIT_MAX", 100, 1),
  allowedOrigins: new Set<string>([
    ...NATIVE_APP_ORIGINS,
    ...(isProduction ? [] : DEV_ORIGINS),
    ...readExtraOrigins()
  ])
} as const;
