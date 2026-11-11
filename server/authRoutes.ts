import type { RequestHandler } from "express";
import { z } from "zod";
import { createAuthenticator, readBearerToken } from "./auth.js";
import { config } from "./config.js";

const authenticator = createAuthenticator({ users: config.accessUsers, secret: config.sessionSecret });

const hasUsers = config.accessUsers.length > 0;
/** บนเครื่องใช้งานจริงต้องมีรหัสเข้าใช้งานเสมอ ถ้าไม่ได้ตั้งจะปิดรับคำขอแทนการเปิดให้ทุกคนใช้ */
const misconfigured = config.isProduction && !hasUsers;

export const authStatus = { required: hasUsers || misconfigured, misconfigured } as const;

const MISCONFIGURED_MESSAGE = "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่ารหัสเข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ";

const loginSchema = z.object({ code: z.string().trim().min(1).max(200) });

/** ผ่านได้เฉพาะคำขอที่แนบโทเค็นถูกต้อง และบันทึกชื่อผู้ใช้ไว้ให้ขั้นถัดไป */
export const requireAuth: RequestHandler = (request, response, next) => {
  if (misconfigured) {
    response.status(503).json({ error: MISCONFIGURED_MESSAGE });
    return;
  }
  if (!hasUsers) {
    next();
    return;
  }

  const session = authenticator.verify(readBearerToken(request.headers.authorization));
  if (!session) {
    response.status(401).json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน", code: "auth_required" });
    return;
  }

  response.locals.userName = session.name;
  next();
};

export const loginHandler: RequestHandler = (request, response) => {
  response.setHeader("Cache-Control", "no-store");

  if (misconfigured) {
    response.status(503).json({ error: MISCONFIGURED_MESSAGE });
    return;
  }

  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "กรุณากรอกรหัสเข้าใช้งาน" });
    return;
  }

  const result = authenticator.login(parsed.data.code);
  if (!result) {
    response.status(401).json({ error: "รหัสเข้าใช้งานไม่ถูกต้อง" });
    return;
  }

  response.json({
    token: result.token,
    name: result.session.name,
    expiresAt: result.session.expiresAt
  });
};

/** ให้หน้าเว็บถามได้ว่าต้องเข้าสู่ระบบไหม และโทเค็นที่ถืออยู่ยังใช้ได้หรือไม่ */
export const sessionHandler: RequestHandler = (request, response) => {
  const session = hasUsers ? authenticator.verify(readBearerToken(request.headers.authorization)) : null;

  response.setHeader("Cache-Control", "no-store");
  response.json({
    authRequired: authStatus.required,
    authenticated: session !== null,
    name: session?.name ?? null
  });
};
