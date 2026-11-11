import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_ACCESS_CODE_LENGTH = 8;
export const MIN_SESSION_SECRET_LENGTH = 32;

const USER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

export interface AccessUser {
  name: string;
  code: string;
}

export interface Session {
  name: string;
  expiresAt: number;
}

export interface LoginResult {
  token: string;
  session: Session;
}

export interface Authenticator {
  /** คืนโทเค็นเมื่อรหัสถูกต้อง หรือ null เมื่อไม่ตรงกับผู้ใช้คนใด */
  login(code: string): LoginResult | null;
  /** คืนข้อมูลผู้ใช้เมื่อโทเค็นถูกต้อง ยังไม่หมดอายุ และรหัสของผู้ใช้ยังไม่ถูกเปลี่ยนหรือลบ */
  verify(token: string | undefined): Session | null;
}

/**
 * อ่านรายการผู้ใช้จากรูปแบบ `ชื่อ:รหัส,ชื่อ:รหัส`
 * รายการที่ไม่ถูกต้องจะถูกข้ามพร้อมคำเตือน โดยไม่พิมพ์รหัสออกมา
 */
export function parseAccessCodes(
  raw: string | undefined,
  warn: (message: string) => void = console.warn
): AccessUser[] {
  const users: AccessUser[] = [];
  if (!raw?.trim()) return users;

  for (const entry of raw.split(",")) {
    const separator = entry.indexOf(":");
    const name = (separator === -1 ? entry : entry.slice(0, separator)).trim();
    const code = separator === -1 ? "" : entry.slice(separator + 1).trim();
    if (!name && !code) continue;

    if (!USER_NAME_PATTERN.test(name)) {
      warn("ข้าม ACCESS_CODES หนึ่งรายการ: ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ ตัวเลข ขีด หรือขีดล่าง ไม่เกิน 32 ตัว");
    } else if (code.length < MIN_ACCESS_CODE_LENGTH) {
      warn(`ข้าม ACCESS_CODES ของ ${name}: รหัสต้องยาวอย่างน้อย ${MIN_ACCESS_CODE_LENGTH} ตัวอักษร`);
    } else if (users.some((user) => user.name.toLowerCase() === name.toLowerCase())) {
      warn(`ข้าม ACCESS_CODES ของ ${name}: ชื่อผู้ใช้ซ้ำ`);
    } else if (users.some((user) => user.code === code)) {
      warn(`ข้าม ACCESS_CODES ของ ${name}: รหัสซ้ำกับผู้ใช้อื่น`);
    } else {
      users.push({ name, code });
    }
  }
  return users;
}

export function readBearerToken(header: string | undefined): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1];
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export function createAuthenticator(options: {
  users: AccessUser[];
  secret: string;
  now?: () => number;
}): Authenticator {
  const { secret, now = Date.now } = options;

  const sign = (value: string) => createHmac("sha256", secret).update(value).digest();
  /** ผูกโทเค็นกับรหัส ณ ตอนล็อกอิน เปลี่ยนหรือลบรหัสเมื่อใด โทเค็นเก่าใช้ไม่ได้ทันที */
  const fingerprint = (code: string) => sign(`code:${code}`).toString("base64url").slice(0, 16);

  const users = options.users.map((user) => ({
    name: user.name,
    codeDigest: sha256(user.code),
    fingerprint: fingerprint(user.code)
  }));

  return {
    login(code) {
      const candidate = sha256(code);
      let matched: (typeof users)[number] | null = null;
      // เทียบทุกคนด้วยเวลาคงที่ เพื่อไม่ให้เดารหัสจากเวลาตอบกลับได้
      for (const user of users) {
        if (timingSafeEqual(candidate, user.codeDigest)) matched = user;
      }
      if (!matched) return null;

      const session: Session = { name: matched.name, expiresAt: now() + SESSION_TTL_MS };
      const payload = Buffer.from(
        JSON.stringify({ sub: session.name, exp: session.expiresAt, fp: matched.fingerprint })
      ).toString("base64url");
      return { token: `${payload}.${sign(payload).toString("base64url")}`, session };
    },

    verify(token) {
      if (!token) return null;

      const parts = token.split(".");
      const [payload, signature] = parts;
      if (parts.length !== 2 || !payload || !signature) return null;

      const expected = sign(payload);
      const actual = Buffer.from(signature, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

      let claims: { sub?: unknown; exp?: unknown; fp?: unknown };
      try {
        claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as typeof claims;
      } catch {
        return null;
      }
      if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || typeof claims.fp !== "string") {
        return null;
      }
      if (claims.exp <= now()) return null;

      const user = users.find((entry) => entry.name === claims.sub);
      if (!user || user.fingerprint !== claims.fp) return null;

      return { name: user.name, expiresAt: claims.exp };
    }
  };
}
