import { fetchWithTimeout } from "./http";
import { sessionStore, type StoredSession } from "./sessionStore";

export interface SessionStatus {
  authRequired: boolean;
  authenticated: boolean;
  name: string | null;
}

/** ข้อผิดพลาดที่มีข้อความพร้อมแสดงให้ผู้ใช้อ่าน */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** ถามเซิร์ฟเวอร์ว่าต้องเข้าสู่ระบบไหม และโทเค็นที่เก็บไว้ยังใช้ได้หรือไม่ */
export async function fetchSessionStatus(signal?: AbortSignal): Promise<SessionStatus> {
  const response = await fetchWithTimeout("/api/auth/session", {
    headers: sessionStore.authHeaders(),
    signal
  });
  if (!response.ok) throw new Error(`session status ${response.status}`);

  const payload = (await response.json()) as Partial<SessionStatus>;
  if (typeof payload.authRequired !== "boolean" || typeof payload.authenticated !== "boolean") {
    throw new Error("session status malformed");
  }
  return {
    authRequired: payload.authRequired,
    authenticated: payload.authenticated,
    name: typeof payload.name === "string" ? payload.name : null
  };
}

export async function login(code: string): Promise<StoredSession> {
  let response: Response;
  try {
    response = await fetchWithTimeout("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
  } catch {
    throw new AuthError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่");
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // เซิร์ฟเวอร์ไม่ได้ตอบเป็น JSON ใช้ข้อความกลางด้านล่างแทน
  }

  if (!response.ok) {
    throw new AuthError(
      typeof payload.error === "string" && payload.error
        ? payload.error
        : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
    );
  }

  const { token, name, expiresAt } = payload;
  if (typeof token !== "string" || typeof name !== "string" || typeof expiresAt !== "number") {
    throw new AuthError("เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่รองรับ กรุณาตรวจการตั้งค่าที่อยู่ของ backend");
  }
  return { token, name, expiresAt };
}
