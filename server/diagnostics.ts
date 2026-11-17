import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ช่องวินิจฉัยของผู้ดูแล: คำขอที่แนบรหัส ซึ่งค่าแฮช SHA-256 ตรงกับค่าที่ผู้ดูแลตั้งไว้ใน DIAGNOSTIC_TOKEN_SHA256
 * จะได้รายละเอียดว่าเซิร์ฟเวอร์เรียกผู้ให้บริการแล้วได้อะไรกลับมา ซึ่งผู้ใช้ทั่วไปไม่ได้เห็น
 * ค่านี้มาจากการตั้งค่าของผู้ดูแลเท่านั้น ถ้าไม่ได้ตั้ง ช่องนี้ปิดสำหรับทุกคน
 */
const DIAGNOSTIC_TOKEN_SHA256 = process.env.DIAGNOSTIC_TOKEN_SHA256?.trim().toLowerCase() ?? "";

/** รหัสที่แนบมากับคำขอคือรหัสวินิจฉัยของผู้ดูแลไหม */
export function isDiagnosticToken(token: string | undefined): boolean {
  if (!token || !/^[0-9a-f]{64}$/.test(DIAGNOSTIC_TOKEN_SHA256)) return false;
  return timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(DIAGNOSTIC_TOKEN_SHA256, "hex"));
}
