/**
 * ส่วนที่ไม่ต้องติดต่อเครือข่ายของการร่างและส่งอีเมล: ตรวจผู้รับ สร้างข้อความ MIME และแปลข้อผิดพลาดเรื่องสิทธิ์
 * แยกไว้เพื่อทดสอบได้ตรง ๆ (การเรียก Gmail อยู่ใน googleWorkspace.ts)
 */

/** เพดานความยาวของร่างอีเมล กันข้อความยาวผิดปกติจากโมเดล */
export const MAX_EMAIL_SUBJECT = 200;
export const MAX_EMAIL_BODY = 5000;
export const MAX_EMAIL_RECIPIENTS = 5;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SINGLE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** ร่างอีเมลที่รอผู้ใช้ยืนยันก่อนส่ง (ต้องตรงกับ EmailDraft ใน src/conversation/types.ts) */
export interface EmailDraft {
  id: string;
  mode: "reply" | "new";
  to: string[];
  subject: string;
  body: string;
  /** อีเมลต้นฉบับที่กำลังตอบ (เฉพาะ mode = reply) แสดงในการ์ดให้ผู้ใช้ตรวจว่าตอบถูกฉบับ */
  original?: { from: string; subject: string };
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

/** ดึงที่อยู่อีเมลจากหัวเรื่อง From เช่น "พี่เอ <a@example.com>" ได้ "a@example.com" */
export function extractAddress(header: string): string | null {
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(header);
  const candidate = (angle?.[1] ?? header).trim().toLowerCase();
  return SINGLE_EMAIL.test(candidate) ? candidate : null;
}

/** ที่อยู่อีเมลทั้งหมดที่ผู้ใช้พิมพ์หรือพูดเองในข้อความ (ตัวพิมพ์เล็ก ไม่ซ้ำ) */
export function addressesInText(text: string): string[] {
  return [...new Set((text.match(EMAIL_PATTERN) ?? []).map((address) => address.toLowerCase()))];
}

export type RecipientCheck = { ok: true; to: string[] } | { ok: false; reason: "none" | "not-from-user" | "too-many"; rejected: string[] };

/**
 * กันการถูกหลอกให้ส่งอีเมลไปหาคนอื่น: ผู้รับของอีเมลใหม่ต้องเป็นที่อยู่ที่ผู้ใช้บอกเองในข้อความล่าสุดเท่านั้น
 * ที่อยู่ที่ AI เสนอมาแต่ผู้ใช้ไม่ได้พูด (เช่นที่อยู่ที่เขียนไว้ในเนื้อหาอีเมลหรือหน้าเว็บ) ถูกปฏิเสธ
 * @param proposed ที่อยู่ที่ AI เสนอ
 * @param userText ข้อความล่าสุดของผู้ใช้
 */
export function checkNewEmailRecipients(proposed: readonly string[], userText: string): RecipientCheck {
  const said = new Set(addressesInText(userText));
  const cleaned = [...new Set(proposed.map((address) => address.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) return { ok: false, reason: "none", rejected: [] };
  if (cleaned.length > MAX_EMAIL_RECIPIENTS) return { ok: false, reason: "too-many", rejected: cleaned.slice(MAX_EMAIL_RECIPIENTS) };
  const rejected = cleaned.filter((address) => !SINGLE_EMAIL.test(address) || !said.has(address));
  return rejected.length > 0 ? { ok: false, reason: "not-from-user", rejected } : { ok: true, to: cleaned };
}

/** หัวข้อของอีเมลตอบกลับ: เติม "Re:" ถ้ายังไม่มี */
export function replySubject(original: string): string {
  const clean = original.trim() || "(ไม่มีหัวเรื่อง)";
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

/** เข้ารหัสหัวอีเมลที่มีอักษรไทยตาม RFC 2047 */
export function encodeMimeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7E]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** ตัดอักขระขึ้นบรรทัดออกจากค่าหัวอีเมล กันการแทรกหัวอีเมลเพิ่ม (header injection) */
const headerValue = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

/** สร้างข้อความอีเมลแบบ RFC 2822 แล้วเข้ารหัส base64url สำหรับ Gmail API (users.messages.send) */
export function buildRawEmail(input: {
  from: string;
  to: readonly string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const headers = [
    `From: ${headerValue(input.from)}`,
    `To: ${input.to.map(headerValue).join(", ")}`,
    `Subject: ${encodeMimeHeader(input.subject)}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${headerValue(input.inReplyTo)}`] : []),
    ...(input.references || input.inReplyTo ? [`References: ${headerValue(`${input.references ?? ""} ${input.inReplyTo ?? ""}`)}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64"
  ];
  const body = Buffer.from(input.body, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

/** ข้อความภาษาไทยเมื่อสิทธิ์ Google ไม่พอ (refresh token ได้มาโดยไม่มีสิทธิ์นั้น) */
export const SEND_SCOPE_MISSING =
  "ลูน่ายังไม่มีสิทธิ์ส่งอีเมลจาก Gmail ค่ะ ต้องขอสิทธิ์ใหม่ครั้งเดียว: รัน npx tsx scripts/google-auth-setup.ts แล้วกดอนุญาต จากนั้นนำ GOOGLE_REFRESH_TOKEN ใหม่ไปใส่ใน .env.local (และบน Vercel) แล้วเริ่มเซิร์ฟเวอร์ใหม่";
export const CALENDAR_SCOPE_MISSING =
  "ลูน่ายังไม่มีสิทธิ์แก้ไขปฏิทินค่ะ ต้องขอสิทธิ์ใหม่ครั้งเดียว: รัน npx tsx scripts/google-auth-setup.ts แล้วกดอนุญาต จากนั้นนำ GOOGLE_REFRESH_TOKEN ใหม่ไปใส่ใน .env.local (และบน Vercel) แล้วเริ่มเซิร์ฟเวอร์ใหม่";

/** คำตอบของ Google หมายถึงสิทธิ์ (scope) ไม่พอหรือไม่ */
export function isScopeError(status: number, body: string): boolean {
  return status === 403 && /insufficient|scope/i.test(body);
}
