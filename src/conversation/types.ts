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
  /**
   * หน้านี้แสดงอยู่ในกรอบของแอปเอง (เจ้าของเว็บยอมให้แสดงในกรอบ) ผู้ใช้จึงไม่ต้องออกจาก Javis
   * แตะลิงก์แล้วจะแสดงหน้านั้นในกรอบอีกครั้ง ไม่เปิดแท็บใหม่
   */
  framed?: boolean;
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
  /** ข้อความนี้คือคำสรุปการประชุม: บันทึกคำพูดทั้งหมดที่ใช้สรุป ให้ผู้ใช้คัดลอกหรือดาวน์โหลดได้ */
  meeting?: MeetingRecord;
}

/** บันทึกการประชุมที่ส่งให้ AI สรุป */
export interface MeetingTranscript {
  /** คำพูดทั้งหมดที่จดได้ บรรทัดละช่วงคำพูด */
  transcript: string;
  /** ความยาวของการประชุมเป็นนาที */
  minutes: number;
}

/** บันทึกของการประชุมที่สรุปแล้ว แนบไว้กับข้อความคำสรุป */
export interface MeetingRecord extends MeetingTranscript {
  /** เวลาที่เริ่มประชุม (มิลลิวินาทีของนาฬิกาเครื่อง) */
  startedAt: number;
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

export interface ProjectActionProposal {
  id: string;
  projectId: string;
  projectName: string;
  action: "build" | "test" | "lint" | "redeploy";
  reason: string;
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
  /** คำสั่งควบคุมโปรเจกต์ที่รอผู้ใช้ยืนยันก่อนรันจริง */
  pendingProjectAction: ProjectActionProposal | null;
  /** คำสั่งเปิดโปรแกรมในคอมพิวเตอร์หรือแอปบนมือถือที่รอผู้ใช้ยืนยันก่อนเปิดจริง */
  pendingAppLaunch: AppLaunchProposal | null;
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
  /** embed: เซิร์ฟเวอร์ตรวจแล้วว่าเจ้าของเว็บยอมให้แสดงหน้านี้ในกรอบของเว็บอื่น */
  | { type: "open"; url: string; title: string; auto: boolean; embed?: boolean }
  | { type: "fill"; fields: FillValue[] }
  /** AI ขอจำเรื่องใหม่ (ข้อความ) หรือลืมเรื่องเดิม (รหัสความจำ) */
  | { type: "memory"; added: string[]; removed: string[] }
  /** AI เสนอคำสั่งควบคุมโปรเจกต์ (ต้องให้ผู้ใช้กดยืนยันก่อนรันจริง) */
  | { type: "project_action"; proposal: ProjectActionProposal }
  /** AI เสนอเปิดโปรแกรมในคอมพิวเตอร์หรือแอปในมือถือ (ต้องให้ผู้ใช้กดยืนยันก่อนเปิดจริง) */
  | { type: "open_app"; proposal: AppLaunchProposal }
  /** แถบคำค้นที่เกี่ยวข้องของ Google ที่ต้องแสดงคู่กับคำตอบจากการค้นด้วย Google */
  | { type: "suggestions"; html: string[] };

export interface AppLaunchProposal {
  id: string;
  appId: string;
  appName: string;
  reason: string;
}

export interface CapturedImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

export type AssistantIdentity = "delluna" | "javis";

export interface ChatStreamOptions {
  signal: AbortSignal;
  onEvent: (event: ChatEvent) => void;
  /** หน้าเว็บที่ผู้ใช้เปิดอยู่ในแอป (แอปเดสก์ท็อปส่งช่องกรอกและข้อความ เว็บในเบราว์เซอร์ส่งที่อยู่และชื่อหน้า) */
  page?: PageContext | null;
  /** สรุปข้อมูลที่แสดงอยู่บนหน้าจอแอป Javis ตอนนี้ สำหรับคำสั่งอ่านหน้าจอ */
  screen?: string | null;
  /** ภาพหน้าจอ/โปรแกรมที่ผู้ใช้จับมาให้ AI อ่าน */
  image?: CapturedImage;
  /** ความจำของผู้ใช้ที่เก็บในอุปกรณ์ ส่งไปให้ AI ใช้ปรับคำตอบ */
  memories?: MemoryEntry[];
  /** แอปแสดงหน้าเว็บในกรอบของตัวเองได้ ขอให้เซิร์ฟเวอร์ตรวจมาด้วยว่าหน้าที่จะเปิดยอมให้แสดงในกรอบไหม */
  frames?: boolean;
  /** ขอให้สรุปบันทึกการประชุมนี้ แทนการตอบบทสนทนา (โหมดสรุปการประชุม) */
  meeting?: MeetingTranscript;
  /** ตัวตนผู้ช่วยในเทิร์นนี้: delluna (หลักเมื่อเสียงลูน่าปกติ) หรือ javis (สลับอัตโนมัติเมื่อเสียงลูน่าขัดข้อง) */
  identity?: AssistantIdentity;
}

export interface SendTextOptions {
  /** บังคับอ่านคำตอบออกเสียง แม้ไม่ได้เปิดไมโครโฟนสนทนาอยู่ (เช่น กดปุ่มอ่านหน้าจอหรือดึงเว็บมาอ่าน) */
  speak?: boolean;
  /** ภาพหน้าจอที่แนบไปกับคำสั่งนี้ */
  image?: CapturedImage;
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
