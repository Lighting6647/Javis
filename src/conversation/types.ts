export type Role = "user" | "assistant";

export interface ConversationMessage {
  id: string;
  role: Role;
  text: string;
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
}

export interface ChatTurn {
  role: Role;
  content: string;
}

export interface ChatStreamOptions {
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}

/** ส่งประวัติบทสนทนาไปขอคำตอบ เรียก onDelta ทีละส่วน และคืนคำตอบเต็มเมื่อจบ */
export type StreamChat = (messages: ChatTurn[], options: ChatStreamOptions) => Promise<string>;

/** ข้อผิดพลาดที่มีข้อความพร้อมแสดงให้ผู้ใช้อ่าน */
export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}
