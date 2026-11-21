import { parseWakePhrases } from "../speech/wakeWord";
import { createFlagStore } from "./flagStore";

/**
 * สวิตช์คำเรียกชื่อของโหมดฟังตลอดเวลา: เปิด = ส่งไปถาม AI เฉพาะคำพูดที่เรียก "จาร์วิส" ก่อน
 * ปิด = ทุกประโยคที่ได้ยินถือเป็นคำสั่ง (แบบเดิม) เปิดเป็นค่าเริ่มต้นและเก็บไว้ในเครื่อง
 */
export const wakeGateStore = createFlagStore("javis.wakeGate");

/** ผู้ดูแลระบบปิดคำเรียกชื่อทั้งระบบด้วย VITE_WAKE_GATE=off: ทุกเครื่องกลับไปฟังทุกประโยคแบบเดิม และไม่มีสวิตช์ในหน้าตั้งค่า */
export const wakeGateAllowed = (import.meta.env.VITE_WAKE_GATE ?? "").trim().toLowerCase() !== "off";

/** คำเรียกชื่อจาก VITE_WAKE_PHRASES (คั่นด้วยจุลภาค) หรือค่าเริ่มต้น */
export const wakePhrases = parseWakePhrases(import.meta.env.VITE_WAKE_PHRASES);

/** คำเรียกชื่อมีผลอยู่ตอนนี้ไหม */
export const wakeGateEnabled = (): boolean => wakeGateAllowed && wakeGateStore.get();
