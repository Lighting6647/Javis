/**
 * ข้อความบอกว่ากำลังทำท่าอะไร และท่านั้นจะสั่งอะไร (แสดงข้างมือและบนแถบ HUD)
 */
import type { GestureCommand, HandShape } from "./gestureCommands";

/**
 * การ์ดยืนยันที่รออยู่
 * - gesture: ยืนยันด้วยการดีดนิ้วได้ (เปิดแอป กรอกฟอร์ม)
 * - buttonOnly: ต้องกดปุ่มเอง (คำสั่งในเครื่อง คำสั่งโปรเจกต์ ส่งอีเมล แก้ปฏิทิน)
 */
export type CardState = "none" | "gesture" | "buttonOnly";

export const SNAP_BLOCKED_LABEL = "ดีดนิ้วยืนยันไม่ได้ · กดปุ่มเอง";

/** ผลของการดีดนิ้วตามการ์ดที่รออยู่ */
export function snapLabel(card: CardState): string {
  if (card === "gesture") return "ดีดนิ้ว · ยืนยัน";
  if (card === "buttonOnly") return SNAP_BLOCKED_LABEL;
  return "ดีดนิ้ว · เรียกลูน่า";
}

export interface LabelInput {
  shape: HandShape;
  pinching: boolean;
  /** นิ้วโป้งแตะนิ้วกลาง (กำลังจะดีด) */
  snapContact: boolean;
  menuOpen: boolean;
  speaking: boolean;
  card: CardState;
}

/** ป้ายของท่าที่เห็นตอนนี้ คืน null เมื่อท่านั้นไม่ได้สั่งอะไร */
export function gestureLabel(input: LabelInput): string | null {
  if (input.snapContact) return snapLabel(input.card);
  if (input.pinching) return "จีบนิ้ว · คลิก";
  if (input.menuOpen) return input.shape === "fist" ? "กำมือ · เลือก" : "เลื่อนมือ · เลือกช่อง";
  switch (input.shape) {
    case "open":
      return input.speaking ? "แบมือ · หยุดพูด" : "แบมือ · เปิดเมนู";
    case "thumbsDown":
      return input.card === "none" ? "👎 · ยกเลิก (ยังไม่มีการ์ด)" : "👎 · ยกเลิก";
    case "peace":
      return "✌️ · พักลูน่า";
    case "thumbsUp":
      return "👍 · ยืนยันใช้ดีดนิ้วแทน";
    case "indexUp":
      return "ชี้นิ้ว · เลื่อนตัวชี้";
    default:
      return null;
  }
}

/** ป้ายสั้น ๆ หลังท่าสั่งงานสำเร็จ */
export function commandLabel(command: GestureCommand): string | null {
  switch (command.type) {
    case "stopSpeaking":
      return "แบมือ · หยุดพูด";
    case "cancel":
      return "👎 · ยกเลิก";
    case "sleep":
      return "✌️ · พักลูน่า";
    case "swipe":
      return command.direction === "left" ? "ปัดซ้าย · กลับหน้าหลัก" : "ปัดขวา · ทวนคำตอบ";
    case "menuSelect":
      return "กำมือ · เลือก";
    default:
      return null;
  }
}

/** ตารางท่ามือทั้งหมด (ตารางสรุปท่าในหน้าจอ) */
export const GESTURE_GUIDE: readonly { gesture: string; action: string }[] = [
  { gesture: "ชี้นิ้วชี้", action: "เลื่อนตัวชี้บนจอ" },
  { gesture: "จีบนิ้วโป้งกับนิ้วชี้", action: "คลิก" },
  { gesture: "ดีดนิ้ว", action: "เรียกลูน่าให้ฟัง ไม่ต้องพูดชื่อ" },
  { gesture: "ดีดนิ้วตอนมีการ์ด", action: "ยืนยันเปิดแอปหรือกรอกฟอร์ม (การ์ดคำสั่งในเครื่อง ส่งเมล แก้ปฏิทิน ต้องกดปุ่มเอง)" },
  { gesture: "👎 ค้าง 1 วิ", action: "ยกเลิกการ์ดที่รออยู่" },
  { gesture: "แบมือค้าง", action: "เปิดเมนูวงกลม (ตอนลูน่าพูด = หยุดพูด)" },
  { gesture: "กำมือในเมนู", action: "เลือกช่องที่มือชี้อยู่" },
  { gesture: "✌️ ค้าง", action: "พักลูน่า" },
  { gesture: "ปัดมือซ้าย / ขวา", action: "กลับหน้าหลัก / ทวนคำตอบล่าสุด" }
];
