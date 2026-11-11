import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authStatus, loginHandler, requireAuth, sessionHandler } from "./authRoutes.js";
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

const app = express();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

app.disable("x-powered-by");
if (config.trustProxyHops > 0) app.set("trust proxy", config.trustProxyHops);

app.use(securityHeaders);
app.use(permissionsPolicy);

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "javis-voice-agent" });
});

app.use("/api", originGuard, corsMiddleware, express.json({ limit: "200kb" }));
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

app.use(express.static(distDir));
app.get("/{*splat}", (request, response) => {
  // คำขอที่มีนามสกุลไฟล์คือ asset ที่หาไม่เจอ ไม่ใช่เส้นทางของหน้าเว็บ
  if (path.extname(request.path)) {
    response.status(404).type("text/plain").send("ไม่พบไฟล์ที่ร้องขอ");
    return;
  }
  response.sendFile(path.join(distDir, "index.html"));
});

app.use(errorHandler);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Javis server listening on http://localhost:${config.port}`);
  if (authStatus.misconfigured) {
    console.error("ยังไม่ได้ตั้ง ACCESS_CODES: เซิร์ฟเวอร์จะปฏิเสธคำขอสนทนาทั้งหมดจนกว่าจะตั้งค่า");
  } else if (!authStatus.required) {
    console.warn("ยังไม่ได้ตั้ง ACCESS_CODES: ทุกคนที่เข้าถึงเซิร์ฟเวอร์นี้ใช้งานได้โดยไม่ต้องเข้าสู่ระบบ (เหมาะกับตอนพัฒนาเท่านั้น)");
  }
});
