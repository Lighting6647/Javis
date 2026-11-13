import { isHandheld } from "./device";

export interface HandsFreeEnvironment {
  userAgent: string;
  /** จำนวนจุดสัมผัสที่จอรองรับ ใช้แยก iPad ซึ่งบอกตัวเองว่าเป็น Mac */
  touchPoints: number;
  /** เบราว์เซอร์มีระบบรู้จำเสียง (Web Speech API) */
  recognition: boolean;
  native: boolean;
  desktopApp: boolean;
}

/**
 * ที่นี่ฟังตลอดเวลาได้ไหม: เปิดหน้าแล้วพูดได้เลย ไม่ต้องแตะไมโครโฟนก่อนพูดทุกครั้ง
 * ทำได้เฉพาะเบราว์เซอร์บนคอมพิวเตอร์ที่มีระบบรู้จำเสียง ซึ่งเริ่มฟังใหม่เองได้เงียบ ๆ และไม่มีค่าใช้จ่าย
 * - มือถือและแท็บเล็ต: Android ส่งเสียงเตือนทุกครั้งที่เริ่มฟัง ส่วน iPhone/iPad ต้องให้ผู้ใช้แตะก่อนเริ่มฟังทุกครั้ง
 * - แอปเดสก์ท็อป: อัดเสียงเองแล้วส่งไปแปลงเป็นข้อความ ถ้าฟังตลอด ทุกเสียงดังรอบตัวจะถูกส่งไปและมีค่าใช้จ่าย
 * - แอปมือถือ: ใช้ระบบฟังของเครื่อง ซึ่งมีข้อจำกัดแบบเดียวกับเบราว์เซอร์บนมือถือ
 * ที่เหล่านี้ยังใช้ปุ่มไมโครโฟนตามเดิม
 */
export function canListenHandsFree(env: HandsFreeEnvironment): boolean {
  if (env.native || env.desktopApp || !env.recognition) return false;
  return !isHandheld(env.userAgent, env.touchPoints);
}
