import { activeRules } from "./rules.js";
import type { EvalCase } from "./types.js";

/** บรรทัดความจำใน prompt มีรูปแบบ "- [m1] ผู้ใช้ชื่อไลท์" */
const MEMORY_LINE = /^- \[m[a-z0-9]{1,12}\] (.+)$/gmu;

function memoryLines(instructions: string): string[] {
  return [...instructions.matchAll(MEMORY_LINE)].map((match) => match[1] ?? "");
}

/** แทน {{memory:คำ}} ด้วยความจำที่มีคำนั้นใน prompt (เปลี่ยน "ผู้ใช้" เป็น "คุณ") หรือ "ยังไม่ทราบ" ถ้า prompt ไม่มีความจำนั้น */
export function fillMemories(draft: string, instructions: string): string {
  const lines = memoryLines(instructions);
  return draft.replace(/\{\{memory:([^}]+)\}\}/gu, (_placeholder, word: string) => {
    const found = lines.find((line) => line.includes(word));
    return found ? found.replace(/^ผู้ใช้/u, "คุณ") : "ยังไม่ทราบเรื่องนี้";
  });
}

/**
 * AI จำลองที่ไม่มีค่าใช้จ่ายและให้ผลเหมือนเดิมทุกครั้ง: เริ่มจากร่างคำตอบดิบของกรณีนั้น
 * แล้วปรับตามกฎที่ prompt สั่งไว้จริงเท่านั้น (evals/rules.ts) จึงใช้วัดได้ว่า prompt ใหม่ดีขึ้นหรือแย่ลง
 * ไม่ได้วัดความฉลาดของโมเดลจริง สำหรับนั้นต้องทดสอบกับโมเดลจริงแยกต่างหาก
 */
export function simulateAnswer(testCase: EvalCase, instructions: string): string {
  const rules = activeRules(instructions);
  const active = new Set(rules.map((rule) => rule.id));
  let answer = testCase.draft ?? "";
  if (testCase.clarifyDraft && active.has("ask-back")) answer = testCase.clarifyDraft;
  else if (testCase.thaiDraft && active.has("thai-first")) answer = testCase.thaiDraft;
  answer = fillMemories(answer, instructions);

  const context = { instructions, question: testCase.question };
  // ลำดับสำคัญ: ล้างรูปแบบก่อน แล้วจึงตัดจำนวนประโยค
  for (const id of ["no-markdown", "no-emoji", "no-false-claims", "female-polite", "short"]) {
    const rule = rules.find((entry) => entry.id === id);
    if (rule) answer = rule.apply(answer, context);
  }
  return answer.trim();
}
