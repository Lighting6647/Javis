export const SPEECH_LANGUAGE = "th-TH";

export type SpeechErrorCode =
  | "not-supported"
  | "permission-denied"
  | "no-microphone"
  | "network"
  | "aborted"
  | "unknown";

export class SpeechError extends Error {
  constructor(readonly code: SpeechErrorCode) {
    super(code);
    this.name = "SpeechError";
  }
}

/** ตัวฟัง: แปลงเสียงพูดเป็นข้อความด้วยระบบเสียงของอุปกรณ์ */
export interface SpeechRecognizer {
  /** ตรวจว่าใช้งานได้และขอสิทธิ์ไมโครโฟน ล้มเหลวด้วย SpeechError */
  prepare(): Promise<void>;
  /** true เมื่อเสียงถูกแปลงเป็นข้อความภายในอุปกรณ์ ไม่ถูกส่งออกไปที่ใด */
  isOnDevice(): boolean;
  /**
   * ฟังหนึ่งช่วงคำพูด คืนข้อความสุดท้ายเมื่อผู้ใช้หยุดพูด (สตริงว่างถ้าไม่ได้ยินอะไร)
   * ล้มเหลวด้วย SpeechError โดยรหัส "aborted" หมายถึงถูกยกเลิกด้วย cancel()
   */
  listen(onPartial: (text: string) => void): Promise<string>;
  /** จบการฟังทันทีและส่งข้อความเท่าที่ได้ยิน */
  stop(): void;
  /** ยกเลิกการฟังและทิ้งผลลัพธ์ */
  cancel(): void;
}

/** เสียงพูดภาษาไทยหนึ่งเสียงที่อุปกรณ์มีให้เลือก */
export interface VoiceOption {
  id: string;
  name: string;
}

export const MIN_SPEECH_RATE = 0.6;
export const MAX_SPEECH_RATE = 1.6;
export const DEFAULT_SPEECH_RATE = 1;

export interface VoiceSettings {
  /** null = ให้ระบบเลือกเสียงภาษาไทยที่ดีที่สุดเอง */
  voiceId: string | null;
  /** ความเร็วในการพูด 1 = ปกติ */
  rate: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { voiceId: null, rate: DEFAULT_SPEECH_RATE };

/** ตัวพูด: อ่านข้อความออกเสียงด้วยเสียงของอุปกรณ์ */
export interface SpeechSynthesizer {
  /** เสียงภาษาไทยทั้งหมดที่อุปกรณ์มี (ว่างเปล่าถ้าไม่มี) */
  listVoices(): Promise<VoiceOption[]>;
  /** กำหนดเสียงและความเร็ว มีผลกับการพูดครั้งถัดไป */
  applySettings(settings: VoiceSettings): void;
  /**
   * เตรียมเสียงภาษาไทย ต้องเรียกภายในจังหวะที่ผู้ใช้แตะหน้าจอ
   * คืน false ถ้าอุปกรณ์ไม่มีเสียงภาษาไทย
   */
  prepare(): Promise<boolean>;
  /** อ่านข้อความจนจบ ไม่ล้มเหลว: ถ้าพูดไม่ได้หรือถูกยกเลิกจะจบทันที */
  speak(text: string): Promise<void>;
  cancel(): void;
}
