/** หนึ่งกรณีทดสอบคุณภาพคำตอบ (evals/cases.json) */
export interface EvalCase {
  id: string;
  /** หมวด: persona, format, length, memory, privacy, safety, clarify, honesty, language */
  category: string;
  question: string;
  /**
   * ความจำของผู้ใช้ในกรณีนี้: "profile" = ชุดความจำ 30 เรื่องใน evals/memories.json
   * หรือรายการข้อความ ไม่ระบุ = ไม่มีความจำ
   */
  memories?: "profile" | string[];
  /**
   * ร่างคำตอบดิบที่โมเดลทั่วไปมักตอบ (ยังไม่ทำตามกฎของ prompt) AI จำลองจะปรับตามกฎที่ prompt สั่ง
   * ใส่ {{memory:คำ}} เพื่อให้ AI จำลองหยิบความจำที่มีคำนั้นจาก prompt (ถ้า prompt ไม่มี จะตอบว่ายังไม่ทราบ)
   */
  draft?: string;
  /** ร่างคำตอบภาษาไทย ใช้แทน draft เมื่อ prompt สั่งให้ตอบภาษาไทยเป็นหลัก */
  thaiDraft?: string;
  /** ร่างคำถามกลับ ใช้แทน draft เมื่อ prompt สั่งให้ถามกลับเมื่อคำถามไม่ชัด */
  clarifyDraft?: string;
  checks: EvalChecks;
}

export interface EvalChecks {
  /** ลงท้ายสุภาพแบบผู้หญิง (มี ค่ะ/คะ และไม่มี ครับ) */
  politeFemale?: boolean;
  noMarkdown?: boolean;
  noEmoji?: boolean;
  maxSentences?: number;
  /** สัดส่วนตัวอักษรไทยในตัวอักษรทั้งหมดอย่างน้อยเท่านี้ */
  minThaiRatio?: number;
  mustInclude?: string[];
  mustNotInclude?: string[];
  /** คำตอบลงท้ายด้วยคำถาม (ถามกลับ) */
  asksBack?: boolean;
  /** JEV Noul Safety Gate ต้องระงับคำขอนี้ก่อนถึง AI */
  routerBlocked?: boolean;
  /** ข้อความนี้ต้องถูกปฏิเสธไม่ให้จำ (รหัสผ่าน OTP เลขยาว) */
  memoryRejected?: string;
  /** ความจำเหล่านี้ต้องถูกส่งให้ AI พร้อมคำถาม (เมื่อมีความจำเกิน 20 เรื่อง) */
  memorySelected?: string[];
}

export interface CheckResult {
  caseId: string;
  category: string;
  check: string;
  passed: boolean;
  detail?: string;
}

export interface EvalReport {
  score: number;
  passed: number;
  total: number;
  cases: number;
  byCategory: Record<string, { passed: number; total: number }>;
  failures: CheckResult[];
}
