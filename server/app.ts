import express, { type Express } from "express";
import path from "node:path";
import { aiAccount } from "./aiAccount.js";
import { loginHandler, requireAuth, sessionHandler } from "./authRoutes.js";
import { chatHandler } from "./chat.js";
import { config } from "./config.js";
import { isDiagnosticToken } from "./diagnostics.js";
import {
  apiNotFound,
  chatRateLimiter,
  corsMiddleware,
  errorHandler,
  loginRateLimiter,
  meetingRateLimiter,
  originGuard,
  permissionsPolicy,
  securityHeaders,
  speechRateLimiter,
  transcribeRateLimiter
} from "./security.js";
import { createSpeechHandler } from "./speech.js";
import { createVoiceReplicationHandlers } from "./voiceReplication.js";
import { transcribeHandler } from "./transcribe.js";
import { getJevTelemetry, routeVoiceTurn } from "./jevRouter.js";
import { createSearchUsageReader } from "./searchUsage.js";
import { z } from "zod";
import { fetchProjectCloudStatus } from "./cloudControl.js";
import { runProjectAction } from "./projectRunner.js";
import { findProject, listProjects } from "./projects.js";

/** เสียงพูดหนึ่งช่วง (สูงสุดราวหนึ่งนาที) มีขนาดไม่ถึง 1 MB เผื่อไว้สำหรับรูปแบบที่บีบอัดน้อย */
const MAX_AUDIO_UPLOAD = "8mb";
/**
 * ขนาดเนื้อหาสูงสุดของ /api/chat: รองรับทั้งบันทึกการประชุมยาวสุด 80,000 ตัวอักษรและภาพหน้าจอที่บีบอัดแล้ว (สูงสุด ~1.2MB base64)
 * แต่ยังคงจำกัดเพดานไว้ที่ 2MB เพื่อป้องกันคำขอขนาดใหญ่ผิดปกติ
 */
const CHAT_BODY_LIMIT = "2mb";

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

  app.use("/api", originGuard, corsMiddleware);
  // บันทึกการประชุมยาวกว่าข้อความสนทนามาก เส้นทางนี้จึงรับเนื้อหาได้ใหญ่กว่าเส้นทางอื่น และต้องอยู่ก่อนตัวอ่านเนื้อหาของเส้นทางทั่วไป
  // คำขอสรุปการประชุมมีเพดานจำนวนครั้งของตัวเองซ้อนอีกชั้น เพราะแต่ละครั้งใช้โทเค็นมากกว่าข้อความสนทนาหลายสิบเท่า
  const voiceReplication = createVoiceReplicationHandlers({ voice: config.cloudVoice });
  app.post("/api/chat", requireAuth, express.json({ limit: CHAT_BODY_LIMIT }), chatRateLimiter, meetingRateLimiter, chatHandler);
  app.post(
    "/api/voices/replicate",
    requireAuth,
    express.json({ limit: "4mb" }),
    speechRateLimiter,
    voiceReplication.replicateVoice
  );
  app.use("/api", express.json({ limit: "200kb" }));
  app.get("/api/voices", requireAuth, voiceReplication.listVoices);
  app.delete("/api/voices/:id", requireAuth, voiceReplication.deleteVoice);
  // สถานะบัญชี AI สำหรับแอป: ข้อมูลหมวดกว้างชุดเดียวกับ /health แต่อยู่ใต้ /api เพื่อให้แอปมือถือเรียกข้ามต้นทางได้
  app.get("/api/status", async (_request, response) => {
    await settleStatus();
    // voice.cloud บอกหน้าเว็บว่าเซิร์ฟเวอร์นี้มีเสียงพูดของ Gemini ให้ใช้ไหม หน้าเว็บจึงไม่ต้องลองขอเมื่อไม่มี
    response.set("Cache-Control", "no-store").json({ ai: aiAccount.snapshot(), voice: { cloud: config.cloudVoice !== null } });
  });
  // ยอดใช้การค้นเว็บสำหรับแผงสถานะ: ยอดของเดือนนี้จาก Tavily และการใช้ผลค้นที่จำไว้ ไม่มีข้อความของผู้ใช้
  const readSearchUsage = createSearchUsageReader({ ai: config.ai, external: config.webSearch });
  app.get("/api/search/usage", requireAuth, async (_request, response) => {
    response.set("Cache-Control", "no-store").json({ search: await readSearchUsage() });
  });
  app.get("/api/router/telemetry", requireAuth, (_request, response) => {
    response.set("Cache-Control", "no-store").json({ ok: true, telemetry: getJevTelemetry() });
  });
  app.post("/api/router/classify", requireAuth, (request, response) => {
    const body = request.body as { goal?: unknown; notes?: unknown; gapsCount?: unknown } | undefined;
    const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
    if (!goal) {
      response.status(400).json({ ok: false, error: "กรุณาระบุข้อความ goal สำหรับ JEV Router" });
      return;
    }
    const decision = routeVoiceTurn({
      goal,
      notes: Array.isArray(body?.notes) ? body.notes.map(String) : [],
      gapsCount: typeof body?.gapsCount === "number" ? body.gapsCount : 0,
    });
    response.json({ ok: true, decision, telemetry: getJevTelemetry() });
  });
  app.get("/api/auth/session", sessionHandler);
  app.post("/api/auth/login", loginRateLimiter, loginHandler);
  app.post(
    "/api/transcribe",
    requireAuth,
    transcribeRateLimiter,
    express.raw({ type: "audio/*", limit: MAX_AUDIO_UPLOAD }),
    transcribeHandler
  );
  // เสียงพูดของ Gemini: รับข้อความหนึ่งช่วง ตอบเป็นไฟล์เสียง (server/speech.ts)
  app.post("/api/speech", requireAuth, speechRateLimiter, createSpeechHandler({ voice: config.cloudVoice, isDiagnostic: isDiagnosticToken }));

  // Project Control Center (Registry + GitHub/Vercel Cloud + Allowlisted Local Runner)
  app.get("/api/projects", requireAuth, async (_request, response) => {
    const listing = await listProjects();
    response.set("Cache-Control", "no-store").json({
      ok: true,
      mode: listing.mode,
      githubConfigured: Boolean(process.env.GITHUB_TOKEN?.trim()),
      vercelConfigured: Boolean(process.env.VERCEL_TOKEN?.trim()),
      projects: listing.projects
    });
  });

  app.get("/api/projects/:id/status", requireAuth, async (request, response) => {
    const listing = await listProjects();
    const project = findProject(String(request.params.id ?? ""), listing.projects);
    if (!project) {
      response.status(404).json({ ok: false, error: "ไม่พบโปรเจกต์นี้ในทะเบียนครับ" });
      return;
    }
    const cloud = project.githubRepo || project.vercelProject ? await fetchProjectCloudStatus(project) : null;
    response.set("Cache-Control", "no-store").json({ ok: true, mode: listing.mode, project, cloud });
  });

  const projectActionBodySchema = z.object({
    action: z.enum(["cloud-status", "build", "test", "lint", "redeploy"])
  });

  app.post("/api/projects/:id/action", requireAuth, async (request, response) => {
    const parsedBody = projectActionBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      response.status(400).json({ ok: false, error: "คำสั่งโปรเจกต์ไม่อยู่ในรายการที่อนุญาต" });
      return;
    }
    const listing = await listProjects();
    const project = findProject(String(request.params.id ?? ""), listing.projects);
    if (!project) {
      response.status(404).json({ ok: false, error: "ไม่พบโปรเจกต์นี้ในทะเบียนครับ" });
      return;
    }
    const result = await runProjectAction(project, parsedBody.data.action, { rootDir: listing.rootDir });
    response.status(result.ok ? 200 : 400).json(result);
  });

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
