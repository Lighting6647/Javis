import type { FillValue, PageContext } from "../browser/types";

export type Role = "user" | "assistant";

/** แหล่งที่มาบนเว็บที่ AI ใช้ตอบ */
export interface WebSource {
  title: string;
  url: string;
}

/** หน้าเว็บที่ผู้ใช้สั่งให้เปิด */
export interface PageLink {
  title: string;
  url: string;
  /** เปิดให้แล้ว (เปิดอัตโนมัติสำเร็จ หรือผู้ใช้แตะลิงก์เอง) ถ้าไม่ ผู้ใช้ต้องกดลิงก์เอง */
  opened: boolean;
  /**
   * สั่งเปิดให้อัตโนมัติแล้ว แต่เบราว์เซอร์ไม่ยอมเปิดแท็บใหม่ และพาแท็บนี้ไปแทนก็ไม่ได้ ผู้ใช้จึงต้องแตะลิงก์เอง
   * เกิดกับคำสั่งเสียงเป็นหลัก เพราะไม่มีการแตะของผู้ใช้ เบราว์เซอร์จึงถือว่าเป็นป๊อปอัป
   */
  blocked: boolean;
  /**
   * เบราว์เซอร์ไม่ยอมเปิดแท็บใหม่ จึงพาแท็บนี้ไปยังหน้านั้นแทน เพื่อให้ผู้ใช้ไม่ต้องแตะลิงก์เอง
   * อ่านคู่กับ opened: ยังไม่ได้ออกจากหน้า (false) หรือออกไปแล้วและผู้ใช้กลับมา (true)
   */
  inPlace: boolean;
}

/**
 * pending: รอผู้ใช้ยืนยัน · filled: กรอกแล้ว · cancelled: ผู้ใช้ยกเลิก
 * failed: กรอกไม่ได้ (เช่นหน้าเว็บเปลี่ยนไปแล้ว)
 */
export type FillStatus = "pending" | "filled" | "cancelled" | "failed";

/** รายการค่าที่ AI เสนอให้กรอกลงฟอร์มของหน้าเว็บ ต้องผ่านการยืนยันของผู้ใช้ก่อนเสมอ */
export interface FillRequest {
  /** หน้าเว็บที่อ่านช่องมา ใช้ยืนยันว่ายังเป็นหน้าเดิมตอนกรอก */
  pageUrl: string;
  fields: FillValue[];
  status: FillStatus;
  /** จำนวนช่องที่กรอกสำเร็จ เมื่อ status เป็น filled */
  filledCount?: number;
}

/** สิ่งที่ Javis จำหรือลืมระหว่างตอบข้อความนี้ แสดงให้ผู้ใช้เห็นทุกครั้ง */
export interface MemoryNote {
  kind: "added" | "removed";
  /** รหัสของความจำที่เพิ่ม ใช้เมื่อผู้ใช้กดยกเลิก */
  id?: string;
  text: string;
  /** ผู้ใช้กดยกเลิกการจำเรื่องนี้แล้ว */
  undone?: boolean;
}

/** ความจำหนึ่งเรื่องที่ส่งไปให้ AI พร้อมคำถาม */
export interface MemoryEntry {
  id: string;
  text: string;
}

export interface ConversationMessage {
  id: string;
  role: Role;
  text: string;
  sources?: WebSource[];
  /**
   * แถบคำค้นที่เกี่ยวข้องของ Google (HTML สำเร็จรูปจาก Google) สำหรับคำตอบที่ได้จากการค้นด้วย Google
   * เงื่อนไขการใช้ของ Google กำหนดให้แสดงคู่กับคำตอบโดยไม่ดัดแปลง และไม่ให้เก็บไว้ จึงอยู่ในหน่วยความจำเท่านั้น
   */
  suggestions?: string[];
  link?: PageLink;
  fill?: FillRequest;
  memoryNotes?: MemoryNote[];
}

/**
 * idle: รอผู้ใช้ · starting: กำลังขอสิทธิ์และเตรียมเสียง · listening: กำลังฟัง
 * thinking: รอคำตอบจาก AI · speaking: กำลังอ่านคำตอบออกเสียง
 */
export type Phase = "idle" | "starting" | "listening" | "thinking" | "speaking";

export interface Notice {
  tone: "error" | "info";
  text: string;
}

export interface ConversationState {
  phase: Phase;
  /** อยู่ในโหมดสนทนาด้วยเสียง: ตอบเสร็จแล้วจะกลับมาฟังต่อเอง */
  active: boolean;
  messages: ConversationMessage[];
  /** ข้อความที่ได้ยินระหว่างผู้ใช้กำลังพูด */
  partial: string;
  notice: Notice | null;
  /** เสียงถูกแปลงเป็นข้อความภายในอุปกรณ์ ไม่ถูกส่งออกไปที่ใด */
  onDeviceListening: boolean;
  /** AI กำลังค้นข้อมูลจากเว็บก่อนตอบ */
  searching: boolean;
  /** รหัสข้อความที่มีรายการกรอกฟอร์มรอผู้ใช้ยืนยันอยู่ */
  pendingFillId: string | null;
  /** เวลาที่รอคำตอบครั้งล่าสุด นับจากส่งคำถามจนข้อความแรกมาถึง (มิลลิวินาที) หรือ null ถ้ายังไม่เคยได้คำตอบ */
  lastReplyMs: number | null;
}

export interface ChatTurn {
  role: Role;
  content: string;
}

/**
 * เหตุการณ์ที่ backend ส่งมาระหว่างตอบ
 * ต้องตรงกับชนิด ChatEvent ใน server/chatProtocol.ts
 */
export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "status"; status: "searching" }
  | { type: "sources"; sources: WebSource[] }
  | { type: "open"; url: string; title: string; auto: boolean }
  | { type: "fill"; fields: FillValue[] }
  /** AI ขอจำเรื่องใหม่ (ข้อความ) หรือลืมเรื่องเดิม (รหัสความจำ) */
  | { type: "memory"; added: string[]; removed: string[] }
  /** แถบคำค้นที่เกี่ยวข้องของ Google ที่ต้องแสดงคู่กับคำตอบจากการค้นด้วย Google */
  | { type: "suggestions"; html: string[] };

export interface ChatStreamOptions {
  signal: AbortSignal;
  onEvent: (event: ChatEvent) => void;
  /** หน้าเว็บที่ผู้ใช้เปิดอยู่ในแอปเดสก์ท็อป ส่งไปให้ AI รู้ว่ามีช่องอะไรให้กรอก */
  page?: PageContext | null;
  /** ความจำของผู้ใช้ที่เก็บในอุปกรณ์ ส่งไปให้ AI ใช้ปรับคำตอบ */
  memories?: MemoryEntry[];
}

/** ส่งประวัติบทสนทนาไปขอคำตอบ เรียก onEvent ทีละเหตุการณ์ และคืนข้อความคำตอบเต็มเมื่อจบ */
export type StreamChat = (messages: ChatTurn[], options: ChatStreamOptions) => Promise<string>;

/** ข้อผิดพลาดที่มีข้อความพร้อมแสดงให้ผู้ใช้อ่าน */
export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}
