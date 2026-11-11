export type FillDecision = "confirm" | "cancel";

/** คำลงท้ายที่พูดต่อจากคำตัดสินใจได้โดยไม่เปลี่ยนความหมาย (ภาษาไทยไม่เว้นวรรคระหว่างคำ) */
const TAIL = "(?:\\s|เลย|ได้|แล้ว|ก่อน|นะ|ครับ|ค่ะ|คะ|ค่า|จ้า|[.!])*";

const CANCEL = new RegExp(`^(?:ยกเลิก|ไม่กรอก|ไม่ต้องกรอก|ไม่ต้อง|ไม่เอา|cancel)${TAIL}$`, "i");
const CONFIRM = new RegExp(`^(?:ยืนยัน|กรอกเลย|กรอกได้เลย|กรอกได้|ตกลง|โอเค|ok|okay|confirm)${TAIL}$`, "i");

/**
 * ตีความคำพูดสั้น ๆ ของผู้ใช้ว่าเป็นการยืนยันหรือยกเลิกรายการกรอกฟอร์มที่รออยู่
 * ต้องเป็นคำตัดสินใจล้วน ๆ ทั้งประโยค (ต่อท้ายด้วยคำสุภาพได้) ประโยคอื่นคืน null เพื่อส่งไปถาม AI ตามปกติ
 * เช่น "ยืนยันครับ" คือยืนยัน แต่ "ยืนยันการจองโรงแรมให้หน่อย" ไม่ใช่
 */
export function interpretFillDecision(text: string): FillDecision | null {
  const normalized = text.trim().replace(/^["'“”\s]+|["'“”\s]+$/g, "");
  if (!normalized) return null;
  if (CANCEL.test(normalized)) return "cancel";
  if (CONFIRM.test(normalized)) return "confirm";
  return null;
}
