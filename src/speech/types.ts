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

/** ตัวรับผลของการฟังต่อเนื่อง */
export interface DictationHandlers {
  /** คำที่กำลังได้ยินของช่วงคำพูดที่ยังไม่จบ */
  onPartial: (text: string) => void;
  /** ข้อความของช่วงคำพูดที่จบแล้ว */
  onFinal: (text: string) => void;
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
  /**
   * ฟังต่อเนื่องเพื่อจดคำพูดยาว ๆ (โหมดสรุปการประชุม): ส่งข้อความทีละช่วงคำพูดโดยไม่จบการฟังเมื่อผู้พูดหยุด
   * จบเมื่อระบบฟังจบการฟังเอง ซึ่งผู้เรียกควรเรียกใหม่เพื่อฟังต่อ ล้มเหลวด้วย SpeechError เหมือน listen
   * มีเฉพาะระบบฟังที่ทำได้ ที่อื่นผู้เรียกใช้ listen ทีละช่วงคำพูดแทน
   */
  dictate?(handlers: DictationHandlers): Promise<void>;
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

export type VoicePersonaId = "assistant" | "genz-girl" | "upbeat-buddy" | "calm-soft";

export interface VoiceSettings {
  /** null = ให้ระบบเลือกเสียงภาษาไทยที่ดีที่สุดเอง */
  voiceId: string | null;
  /** ความเร็วในการพูด 1 = ปกติ */
  rate: number;
  /**
   * ใช้เสียงพูดของ Gemini เมื่อเซิร์ฟเวอร์มีให้ (ชัดกว่า แต่ต้องใช้อินเทอร์เน็ตและเริ่มพูดช้ากว่าเล็กน้อย)
   * เมื่อเสียงนั้นใช้ไม่ได้ Javis สลับไปเสียงในอุปกรณ์เอง
   */
  cloud: boolean;
  /** เสียงของ Gemini ที่ผู้ใช้เลือก null = เสียงเริ่มต้นของเซิร์ฟเวอร์ */
  cloudVoice: string | null;
  /** บุคลิกและลีลาการพูดของ Javis */
  persona: VoicePersonaId;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voiceId: null,
  rate: DEFAULT_SPEECH_RATE,
  cloud: true,
  cloudVoice: "Leda",
  persona: "genz-girl"
};

/** ตัวพูด: อ่านข้อความออกเสียงด้วยเสียงของอุปกรณ์ */
export interface SpeechSynthesizer {
  /** เสียงภาษาไทยทั้งหมดที่อุปกรณ์มี (ว่างเปล่าถ้าไม่มี) */
  listVoices(): Promise<VoiceOption[]>;
  /** กำหนดเสียงและความเร็ว มีผลกับการพูดครั้งถัดไป */
  applySettings(settings: VoiceSettings): void;
  /** เลือกเพศเสียงสำรองในเครื่องอัตโนมัติ (female = เดลลูน่า, male = จาวิสตอนเสียงหลักขัดข้อง) */
  setFallbackGender?(gender: "female" | "male"): void;
  /**
   * เตรียมเสียงภาษาไทย ต้องเรียกภายในจังหวะที่ผู้ใช้แตะหน้าจอ
   * คืน false ถ้าอุปกรณ์ไม่มีเสียงภาษาไทย
   */
  prepare(): Promise<boolean>;
  /** อ่านข้อความจนจบ ไม่ล้มเหลว: ถ้าพูดไม่ได้หรือถูกยกเลิกจะจบทันที */
  speak(text: string): Promise<void>;
  /**
   * บอกล่วงหน้าว่าจะสั่งพูดข้อความนี้ในลำดับถัดไป ตัวพูดที่ต้องขอเสียงจากเซิร์ฟเวอร์ใช้เวลานี้เตรียมเสียงไว้
   * การพูดจึงต่อเนื่องไม่เว้นช่วงระหว่างประโยค ตัวพูดของอุปกรณ์ไม่ต้องเตรียม จึงไม่มีคำสั่งนี้
   */
  preload?(text: string): void;
  cancel(): void;
  /**
   * เบราว์เซอร์ยังไม่ยอมให้หน้านี้พูด เพราะผู้ใช้ยังไม่ได้แตะหรือกดอะไรบนหน้าเลย (กฎกันเว็บส่งเสียงเอง)
   * รู้จากผลของการสั่งพูดครั้งล่าสุด และเรียก prepare() ในจังหวะที่ผู้ใช้แตะเพื่อปลดได้
   * มีเฉพาะตัวพูดบนเบราว์เซอร์ ระบบเสียงของแอปมือถือไม่มีกฎนี้
   */
  isBlocked?(): boolean;
  /** เรียก listener เมื่อสถานะถูกบล็อกเปลี่ยน คืนฟังก์ชันเลิกติดตาม */
  onBlockedChange?(listener: () => void): () => void;
}
