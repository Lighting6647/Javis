import type { SpeechErrorCode } from "../speech/types";
import type { Phase } from "./types";

export const PHASE_LABEL: Record<Phase, string> = {
  idle: "พร้อมใช้งาน",
  starting: "กำลังเตรียมไมโครโฟน",
  listening: "กำลังฟัง",
  thinking: "กำลังคิดคำตอบ",
  speaking: "กำลังตอบ"
};

export const SPEECH_ERROR_TEXT: Record<Exclude<SpeechErrorCode, "aborted">, string> = {
  "not-supported":
    "อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการฟังเสียงภาษาไทย ลองใช้ Safari, Chrome หรือ Edge หรือพิมพ์ข้อความแทนได้",
  "permission-denied":
    "ยังไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กรุณาเปิดสิทธิ์ไมโครโฟนในการตั้งค่าแล้วลองใหม่",
  "no-microphone": "ใช้งานไมโครโฟนไม่ได้ กรุณาตรวจว่าไม่มีแอปอื่นใช้อยู่แล้วลองใหม่",
  network: "ระบบแปลงเสียงเป็นข้อความขัดข้อง กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่",
  unknown: "เริ่มฟังเสียงไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
};

export const NOTICE_TEXT = {
  noSpeech: "ไม่ได้ยินเสียงพูด แตะปุ่มเพื่อเริ่มใหม่ได้เลย",
  noThaiVoice: "อุปกรณ์นี้ไม่มีเสียงพูดภาษาไทย คำตอบจะแสดงเป็นข้อความแทน",
  emptyReply: "AI ไม่ได้ส่งคำตอบกลับมา กรุณาลองใหม่อีกครั้ง",
  chatFailed: "ขอคำตอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  fillCancelled: "ยกเลิกแล้วครับ ยังไม่ได้กรอกอะไรลงหน้าเว็บ",
  fillPageChanged: "หน้าเว็บเปลี่ยนไปจากตอนที่เตรียมรายการ จึงยังไม่ได้กรอก กรุณาสั่งใหม่ในหน้าปัจจุบัน",
  fillUnavailable: "กรอกไม่ได้เพราะหน้าเว็บถูกปิดไปแล้ว กรุณาเปิดหน้าเว็บแล้วสั่งใหม่",
  fillNothing: "ไม่พบช่องที่จะกรอกในหน้านี้ จึงยังไม่ได้กรอกอะไร"
} as const;
