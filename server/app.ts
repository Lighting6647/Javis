import express, { type Express } from "express";
import path from "node:path";
import { aiAccount } from "./aiAccount.js";
import { loginHandler, requireAuth, sessionHandler } from "./authRoutes.js";
import { chatHandler } from "./chat.js";
import { config } from "./config.js";
import {
  apiNotFound,
  chatRateLimiter,
  corsMiddleware,
  errorHandler,
  loginRateLimiter,
  originGuard,
  permissionsPolicy,
  securityHeaders,
  transcribeRateLimiter
} from "./security.js";
import { transcribeHandler } from "./transcribe.js";

/** เสียงพูดหนึ่งช่วง (สูงสุดราวหนึ่งนาที) มีขนาดไม่ถึง 1 MB เผื่อไว้สำหรับรูปแบบที่บีบอัดน้อย */
const MAX_AUDIO_UPLOAD = "8mb";

export interface AppOptions {
  /**
   * โฟลเดอร์ของหน้าเว็บที่ build แล้ว ให้เซิร์ฟเวอร์นี้เสิร์ฟเอง
   * ไม่ต้องระบุบนโฮสต์ที่เสิร์ฟไฟล์หน้าเว็บให้อยู่แล้ว (เช่น Vercel)
   */
  staticDir?: string;
  /**
   * เรียกก่อนตอบสถานะบัญชี AI ทุกครั้ง ใช้บนโฮสต์แบบ serverless ซึ่งไม่มีงานเบื้องหลัง
   * จึงต้องตรวจบัญชีตอนที่มีคนถามสถานะแทน
   */
  beforeStatus?: () => Promise<void>;
}

/**
 * สร้างแอป Javis: เส้นทาง API ทั้งหมด พร้อมการป้องกันและการจัดการข้อผิดพลาด
 * ไม่เปิดพอร์ตเอง ผู้เรียกเป็นคนตัดสินว่าจะรันแบบเซิร์ฟเวอร์ (server/index.ts) หรือแบบฟังก์ชัน (api/index.ts)
 */
export function createApp(options: AppOptions = {}): Express {
  const { staticDir, beforeStatus } = options;
  const app = express();

  app.disable("x-powered-by");
  if (config.trustProxyHops > 0) app.set("trust proxy", config.trustProxyHops);

  app.use(securityHeaders);
  app.use(permissionsPolicy);

  /** ตรวจบัญชีก่อนถ้าโฮสต์ต้องการ การตรวจล้มเหลวไม่ทำให้ตอบสถานะไม่ได้ */
  const settleStatus = async () => {
    await beforeStatus?.().catch((error: unknown) => {
      console.warn("ตรวจบัญชี AI ไม่สำเร็จ", error instanceof Error ? error.message : "unknown");
    });
  };

  app.get("/health", async (_request, response) => {
    await settleStatus();
    // ok บอกว่าเซิร์ฟเวอร์ยังทำงาน ส่วน ai บอกสถานะบัญชี AI เป็นหมวดกว้าง ๆ ไม่มีข้อความหรือรหัสจากต้นทาง
    // บัญชี AI มีปัญหาไม่ทำให้ ok เป็น false เพราะการรีสตาร์ต container ไม่ช่วยแก้
    response.set("Cache-Control", "no-store").json({ ok: true, service: "javis-voice-agent", ai: aiAccount.snapshot() });
  });

  app.use("/api", originGuard, corsMiddleware, express.json({ limit: "200kb" }));
  // สถานะบัญชี AI สำหรับแอป: ข้อมูลหมวดกว้างชุดเดียวกับ /health แต่อยู่ใต้ /api เพื่อให้แอปมือถือเรียกข้ามต้นทางได้
  app.get("/api/status", async (_request, response) => {
    await settleStatus();
    response.set("Cache-Control", "no-store").json({ ai: aiAccount.snapshot() });
  });
  app.get("/api/auth/session", sessionHandler);
  app.post("/api/auth/login", loginRateLimiter, loginHandler);
  app.post("/api/chat", requireAuth, chatRateLimiter, chatHandler);
  app.post(
    "/api/transcribe",
    requireAuth,
    transcribeRateLimiter,
    express.raw({ type: "audio/*", limit: MAX_AUDIO_UPLOAD }),
    transcribeHandler
  );
  app.use("/api", apiNotFound);

  if (staticDir) {
    app.use(express.static(staticDir));
    app.get("/{*splat}", (request, response) => {
      // คำขอที่มีนามสกุลไฟล์คือ asset ที่หาไม่เจอ ไม่ใช่เส้นทางของหน้าเว็บ
      if (path.extname(request.path)) {
        response.status(404).type("text/plain").send("ไม่พบไฟล์ที่ร้องขอ");
        return;
      }
      response.sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
