import cors from "cors";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { IncomingHttpHeaders } from "node:http";
import { config, normalizeOrigin } from "./config.js";

const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
/** จำนวนครั้งที่ขอสรุปการประชุมได้ในช่วงเวลาเดียวกัน พอสำหรับลองสรุปซ้ำเมื่อพลาด แต่ไม่พอให้ใช้เผาโควตา */
const MEETING_RATE_LIMIT_MAX = 6;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILED_ATTEMPTS = 10;

function isSameHost(origin: string, headers: IncomingHttpHeaders): boolean {
  if (!headers.host || !URL.canParse(origin)) return false;
  return new URL(origin).host === headers.host.toLowerCase();
}

/**
 * คำขอที่ไม่มี Origin (เช่น curl หรือระบบตรวจสุขภาพ) ไม่ใช่เบราว์เซอร์ จึงปล่อยผ่าน
 * และให้ rate limit เป็นตัวควบคุมแทน
 */
function isOriginAllowed(headers: IncomingHttpHeaders): boolean {
  const origin = headers.origin;
  if (!origin) return true;
  return config.allowedOrigins.has(normalizeOrigin(origin)) || isSameHost(origin, headers);
}

/**
 * แอปเดสก์ท็อป: แท็ก <webview> ของ Electron ใส่สไตล์ภายในของตัวเองหนึ่งบรรทัด (`:host { display: flex; }`)
 * อนุญาตเฉพาะข้อความนั้นด้วยค่าแฮช แทนการเปิด 'unsafe-inline' ให้สไตล์แทรกทุกแบบ
 */
const ELECTRON_WEBVIEW_STYLE_HASH = "'sha256-XNfYdUW7S7AWSxlvq47SGsGIxvvzKwvUGdsFQQ/zXf4='";

export const securityHeaders: RequestHandler = helmet({
  strictTransportSecurity: { maxAge: 15_552_000, includeSubDomains: false },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "https://fonts.googleapis.com", ELECTRON_WEBVIEW_STYLE_HASH],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:"],
      "media-src": ["'self'"],
      "connect-src": ["'self'"],
      // หน้าเว็บแสดงหน้าที่ผู้ใช้สั่งเปิดไว้ในกรอบของตัวเองได้ เฉพาะหน้า https และเฉพาะหน้าที่เจ้าของเว็บยอม (ดู server/frameCheck.ts)
      "frame-src": ["https:"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "upgrade-insecure-requests": config.isProduction ? [] : null
    }
  }
});

export const permissionsPolicy: RequestHandler = (_request, response, next) => {
  response.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=()");
  next();
};

export const originGuard: RequestHandler = (request, response, next) => {
  if (isOriginAllowed(request.headers)) {
    next();
    return;
  }
  response.status(403).json({ error: "ไม่อนุญาตให้เรียกใช้งานจากเว็บไซต์นี้" });
};

export const corsMiddleware = cors((request, callback) => {
  callback(null, {
    origin: Boolean(request.headers.origin) && isOriginAllowed(request.headers),
    methods: ["GET", "POST"],
    maxAge: 600
  });
});

export const chatRateLimiter = rateLimit({
  windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
  limit: config.chatRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // นับตามผู้ใช้ที่เข้าสู่ระบบ เพื่อไม่ให้คนที่ใช้อินเทอร์เน็ตวงเดียวกันแย่งโควตากัน
  keyGenerator: (request, response) => {
    const userName: unknown = response.locals.userName;
    return typeof userName === "string" ? `user:${userName}` : ipKeyGenerator(request.ip ?? "");
  },
  handler: (_request, response) => {
    response.status(429).json({ error: "ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" });
  }
});

/**
 * การสรุปการประชุม: หนึ่งคำขอส่งบันทึกยาวได้ถึงหลายหมื่นโทเค็น มากกว่าข้อความสนทนาหลายสิบเท่า
 * จึงมีเพดานจำนวนครั้งของตัวเองซ้อนจากเพดานของข้อความ เพื่อไม่ให้ใครใช้ทางนี้เผาโควตา AI ของผู้ดูแล
 * คำขอสนทนาปกติ (ไม่มีบันทึกการประชุม) ไม่ถูกนับ
 */
export const meetingRateLimiter = rateLimit({
  windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
  limit: MEETING_RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (request) => !(typeof request.body === "object" && request.body !== null && "meeting" in request.body),
  keyGenerator: (request, response) => {
    const userName: unknown = response.locals.userName;
    return typeof userName === "string" ? `meeting:user:${userName}` : `meeting:${ipKeyGenerator(request.ip ?? "")}`;
  },
  handler: (_request, response) => {
    response.status(429).json({ error: "ขอสรุปการประชุมถี่เกินไป กรุณารอสักครู่แล้วลองใหม่ บันทึกที่จดไว้ยังอยู่ครบ" });
  }
});

/** การแปลงเสียงมีค่าใช้จ่ายต่อครั้ง จึงจำกัดเท่ากับจำนวนข้อความ (หนึ่งคำพูด = หนึ่งข้อความ) */
export const transcribeRateLimiter = rateLimit({
  windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
  limit: config.chatRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (request, response) => {
    const userName: unknown = response.locals.userName;
    return typeof userName === "string" ? `user:${userName}` : ipKeyGenerator(request.ip ?? "");
  },
  handler: (_request, response) => {
    response.status(429).json({ error: "ใช้เสียงถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" });
  }
});

/** กันการเดารหัสเข้าใช้งาน: นับเฉพาะครั้งที่ล้มเหลว */
export const loginRateLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: LOGIN_MAX_FAILED_ATTEMPTS,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ error: "พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" });
  }
});

export const apiNotFound: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "ไม่พบปลายทาง API ที่ร้องขอ" });
};

function readErrorStatus(error: unknown): number {
  if (typeof error !== "object" || error === null) return 500;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const candidate = typeof status === "number" ? status : statusCode;
  return typeof candidate === "number" && candidate >= 400 && candidate < 600 ? candidate : 500;
}

const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  400: "รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง",
  404: "ไม่พบหน้าที่ร้องขอ",
  413: "ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป"
};

/** ตอบข้อผิดพลาดเป็น JSON เสมอ และไม่ส่ง stack trace หรือ path ภายในเครื่องออกไป */
export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const status = readErrorStatus(error);
  if (status >= 500) {
    console.error("Unhandled server error", error instanceof Error ? error.message : "unknown");
    response.status(status).json({ error: "เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่อีกครั้ง" });
    return;
  }

  response.status(status).json({ error: CLIENT_ERROR_MESSAGES[status] ?? "คำขอไม่ถูกต้อง" });
};
