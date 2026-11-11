import type { RequestHandler } from "express";
import { z } from "zod";
import { createAuthenticator, readBearerToken, resolveAccessMode } from "./auth.js";
import { config } from "./config.js";

const authenticator = createAuthenticator({ users: config.accessUsers, secret: config.sessionSecret });

const hasUsers = config.accessUsers.length > 0;
const accessMode = resolveAccessMode({
  codesConfigured: config.accessCodesConfigured,
  validUsers: config.accessUsers.length,
  isServerless: config.isServerless,
  hasSessionSecret: config.hasSessionSecret
});
/** ตั้งค่าไว้แต่ใช้ไม่ได้: ปิดรับคำขอพร้อมบอกสาเหตุ ดีกว่าเปิดโล่งหรือให้เข้าสู่ระบบได้บ้างไม่ได้บ้าง */
const misconfigured = accessMode === "invalid-codes" || accessMode === "missing-secret";

const MISCONFIGURED_MESSAGE =
  accessMode === "invalid-codes"
    ? "รหัสเข้าใช้งานของเซิร์ฟเวอร์ตั้งค่าไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ"
    : "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่ากุญแจเซสชัน กรุณาติดต่อผู้ดูแลระบบ";

export const authStatus = {
  required: accessMode !== "open",
  misconfigured,
  /** ข้อความสำหรับ log ของผู้ดูแล บอกตัวแปรที่ต้องแก้ */
  misconfiguredLog:
    accessMode === "invalid-codes"
      ? "ACCESS_CODES ไม่มีรายการที่ใช้ได้ ต้องเขียนแบบ ชื่อ:รหัส (รหัสอย่างน้อย 8 ตัวอักษร): เซิร์ฟเวอร์จะปฏิเสธคำขอทั้งหมดจนกว่าจะแก้ หรือลบตัวแปรนี้ออกถ้าต้องการให้ใช้ได้โดยไม่ต้องเข้าสู่ระบบ"
      : "ยังไม่ได้ตั้ง SESSION_SECRET (อย่างน้อย 32 ตัวอักษร): บนโฮสต์แบบฟังก์ชันจำเป็นต้องตั้งเมื่อใช้รหัสเข้าใช้งาน เซิร์ฟเวอร์จะปฏิเสธการเข้าสู่ระบบจนกว่าจะตั้งค่า",
  /** คำเตือนเมื่อเปิดให้ใช้โดยไม่ต้องเข้าสู่ระบบ บนเครื่องใช้งานจริงคือเปิดสู่สาธารณะ */
  openLog: config.isProduction
    ? "ไม่ได้ตั้ง ACCESS_CODES: เปิดให้ทุกคนที่มีที่อยู่ของเว็บใช้งานได้โดยไม่ต้องเข้าสู่ระบบ และทุกคำตอบใช้เครดิตของบัญชี AI ควรตั้งเพดานค่าใช้จ่ายในบัญชี AI"
    : "ยังไม่ได้ตั้ง ACCESS_CODES: ทุกคนที่เข้าถึงเซิร์ฟเวอร์นี้ใช้งานได้โดยไม่ต้องเข้าสู่ระบบ"
} as const;

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
