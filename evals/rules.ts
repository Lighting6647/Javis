/**
 * กฎการตอบที่ AI จำลองเข้าใจ: แต่ละกฎผูกกับ "ถ้อยคำใน prompt" ที่ทำให้กฎนั้นมีผล
 * AI จำลองจะทำตามกฎก็ต่อเมื่อ prompt มีถ้อยคำนั้น คะแนน eval จึงสะท้อนว่า prompt สั่งครบไหม
 * สคริปต์ npm run learn ใช้ `instruction` ของกฎเป็นข้อเสนอปรับ prompt เมื่อคำติชม 👎 ตรงกับปัญหาของกฎนั้น
 */

export interface RuleContext {
  /** prompt ทั้งหมดที่ส่งให้ AI (คำสั่งระบบ + ความจำ) */
  instructions: string;
  question: string;
}

export interface AnswerRule {
  id: string;
  /** ชื่อปัญหาภาษาไทยสำหรับรายงาน */
  label: string;
  /** prompt มีถ้อยคำนี้ = สั่งกฎนี้แล้ว */
  promptPattern: RegExp;
  /** ประโยคคำสั่งมาตรฐานที่ใช้เสนอเพิ่มใน prompt (ต้องตรง promptPattern) */
  instruction: string;
  /** คำในหมายเหตุ 👎 ที่บอกว่าผู้ใช้เจอปัญหานี้ */
  feedbackKeywords: RegExp;
  apply: (answer: string, context: RuleContext) => string;
}

/** ประโยคที่อ้างว่าทำงานภายนอกเสร็จแล้ว เช่น ส่งอีเมลให้แล้ว โทรให้แล้ว จองให้เรียบร้อยแล้ว */
const FALSE_CLAIM = /(?:ส่ง|จอง|โทร|โอน)\S*ให้(?:เรียบร้อย)?แล้ว/u;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
/** แยกประโยคภาษาไทยที่เว้นวรรคระหว่างประโยค: ตัดหลังคำลงท้ายหรือเครื่องหมายจบประโยค */
export const SENTENCE_BREAK = /(?<=(?:ค่ะ|คะ|ครับ|นะ|จ้ะ|[.!?]))\s+/u;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map((part) => part.trim())
    .filter(Boolean);
}

const THAI_NUMBERS: Record<string, number> = { หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6 };

/** อ่านจำนวนประโยคสูงสุดจาก prompt เช่น "ไม่เกินสามถึงสี่ประโยค" หรือ "ไม่เกิน 2 ประโยค" (เอาค่าที่น้อยที่สุดที่สั่งไว้) */
export function maxSentencesFrom(instructions: string): number | null {
  const pattern = /ไม่เกิน\s*(?:(\d|หนึ่ง|สอง|สาม|สี่|ห้า|หก)\s*(?:ถึง|–|-)\s*)?(\d|หนึ่ง|สอง|สาม|สี่|ห้า|หก)\s*ประโยค/gu;
  let smallest: number | null = null;
  for (const match of instructions.matchAll(pattern)) {
    const raw = match[2] ?? "";
    const value = THAI_NUMBERS[raw] ?? Number(raw);
    if (Number.isFinite(value) && value > 0) smallest = smallest === null ? value : Math.min(smallest, value);
  }
  return smallest;
}

export const ANSWER_RULES: AnswerRule[] = [
  {
    id: "female-polite",
    label: "ใช้คำลงท้ายไม่ตรงบุคลิก (ครับ แทน ค่ะ)",
    promptPattern: /คำลงท้ายสุภาพแบบผู้หญิง/,
    instruction: "ใช้สรรพนามและคำลงท้ายสุภาพแบบผู้หญิง (เช่น ค่ะ, นะคะ) ทุกประโยค ห้ามใช้ ครับ",
    feedbackKeywords: /ครับ|ผู้ชาย|คำลงท้าย|ไม่สุภาพ|ห้วน/,
    apply: (answer) => answer.replace(/นะครับ/g, "นะคะ").replace(/ครับ/g, "ค่ะ").replace(/(^|\s)ผม(?=คือ|จะ|ชื่อ|ช่วย|ขอ|คิด|แนะนำ|ไม่)/g, "$1เดลลูน่า")
  },
  {
    id: "no-markdown",
    label: "ใช้ Markdown หัวข้อ หรือรายการ (อ่านออกเสียงแล้วแปลก)",
    promptPattern: /ห้ามใช้ Markdown/,
    instruction: "ห้ามใช้ Markdown รายการหัวข้อ ตัวหนา หรือตาราง ให้เขียนเป็นประโยคต่อเนื่อง",
    feedbackKeywords: /markdown|มาร์กดาวน์|ดอกจัน|\*|หัวข้อ|bullet|ตาราง|สัญลักษณ์/i,
    apply: (answer) =>
      answer
        .split("\n")
        .filter((line) => !/^\s*\|/.test(line))
        .map((line) => line.replace(/^\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, "").replace(/\*\*|__|`/g, ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
  },
  {
    id: "no-emoji",
    label: "ใส่อีโมจิ",
    promptPattern: /ห้ามใช้[^。]*อีโมจิ/,
    instruction: "ห้ามใช้อีโมจิหรือสัญลักษณ์พิเศษในคำตอบ",
    feedbackKeywords: /อีโมจิ|emoji|อิโมจิ/i,
    apply: (answer) => answer.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim()
  },
  {
    id: "short",
    label: "ตอบยาวเกินไป",
    promptPattern: /ไม่เกิน\s*\S*\s*ประโยค/,
    instruction: "ตอบให้จบภายในไม่เกินสามประโยค ตัดรายละเอียดที่ผู้ใช้ไม่ได้ถามออก",
    feedbackKeywords: /ยาว|เยิ่นเย้อ|น้ำเยอะ|สั้น|กระชับ|long/i,
    apply: (answer, context) => {
      const max = maxSentencesFrom(context.instructions);
      return max === null ? answer : splitSentences(answer).slice(0, max).join(" ");
    }
  },
  {
    id: "thai-first",
    label: "ตอบเป็นภาษาอังกฤษทั้งที่ถามภาษาไทย",
    promptPattern: /ตอบเป็นภาษาไทยเป็นหลัก/,
    instruction: "ตอบเป็นภาษาไทยเป็นหลัก ใช้คำภาษาอังกฤษเฉพาะชื่อเฉพาะหรือศัพท์เทคนิคที่จำเป็น",
    feedbackKeywords: /อังกฤษ|english|ภาษาไทย|แปล/i,
    // AI จำลองตอบภาษาไทยด้วยร่างคำตอบภาษาไทยของกรณีนั้น (ถ้ามี)
    apply: (answer) => answer
  },
  {
    id: "no-false-claims",
    label: "อ้างว่าทำสิ่งที่ทำไม่ได้หรือไม่ได้ทำจริง",
    promptPattern: /ห้ามอ้างว่าทำสิ่งที่ไม่ได้ทำจริง/,
    instruction: "ห้ามอ้างว่าทำสิ่งที่ไม่ได้ทำจริง เช่น ส่งอีเมล โทรออก หรือจองให้แล้ว ถ้าทำไม่ได้ให้บอกตรง ๆ",
    feedbackKeywords: /โกหก|ไม่จริง|มั่ว|อ้างว่า|ไม่ได้ทำ|hallucinat/i,
    // คำตอบที่อ้างว่าทำให้แล้ว ถูกแทนทั้งคำตอบด้วยการบอกตรง ๆ ว่าทำไม่ได้ พร้อมเสนอสิ่งที่ช่วยได้จริง
    apply: (answer) =>
      FALSE_CLAIM.test(answer) ? "เดลลูน่ายังทำเรื่องนี้ให้โดยตรงไม่ได้ค่ะ ถ้าต้องการ เดลลูน่าช่วยร่างข้อความให้ได้นะคะ" : answer
  },
  {
    id: "ask-back",
    label: "เดาคำตอบเมื่อคำถามไม่ชัด แทนการถามกลับ",
    promptPattern: /ไม่ชัดเจนให้ถามกลับ/,
    instruction: "ถ้าคำถามไม่ชัดเจนให้ถามกลับทีละคำถาม อย่าเดาคำตอบ",
    feedbackKeywords: /เดา|ไม่ถาม|ไม่เข้าใจคำถาม|ไม่ตรงคำถาม|ตอบไม่ตรง/,
    // การถามกลับจัดการใน AI จำลอง (ใช้ร่างคำถามกลับของกรณีนั้น)
    apply: (answer) => answer
  }
];

/** กฎที่ prompt นี้สั่งไว้ */
export function activeRules(instructions: string): AnswerRule[] {
  return ANSWER_RULES.filter((rule) => rule.promptPattern.test(instructions));
}
