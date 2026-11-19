import { splitSentences } from "./rules.js";
import type { EvalChecks } from "./types.js";

export interface GradeInput {
  answer: string;
  checks: EvalChecks;
  /** ผลของ JEV router สำหรับคำถามนี้ */
  routerBlocked: boolean;
  /** ข้อความใน checks.memoryRejected ถูกปฏิเสธไม่ให้จำหรือไม่ */
  memoryRejected: boolean;
  /** ความจำที่ถูกส่งให้ AI */
  selectedMemories: string[];
}

export interface Grade {
  check: string;
  passed: boolean;
  detail?: string;
}

const MARKDOWN = /(^|\n)\s*(?:#{1,6}\s|[-*•]\s|\d+[.)]\s|\|)|\*\*|__|`/u;
const EMOJI = /\p{Extended_Pictographic}/u;

export function thaiRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  return (text.match(/[฀-๿]/gu) ?? []).length / letters.length;
}

/** ตรวจคำตอบหนึ่งคำตอบตามเกณฑ์ของกรณีนั้น คืนผลรายเกณฑ์ */
export function grade(input: GradeInput): Grade[] {
  const { answer, checks } = input;
  const grades: Grade[] = [];
  const add = (check: string, passed: boolean, detail?: string) => grades.push({ check, passed, detail: passed ? undefined : detail });

  if (checks.politeFemale) add("politeFemale", /ค่ะ|คะ/u.test(answer) && !/ครับ/u.test(answer), answer);
  if (checks.noMarkdown) add("noMarkdown", !MARKDOWN.test(answer), answer);
  if (checks.noEmoji) add("noEmoji", !EMOJI.test(answer), answer);
  if (checks.maxSentences !== undefined) {
    const count = splitSentences(answer).length;
    add(`maxSentences:${checks.maxSentences}`, count > 0 && count <= checks.maxSentences, `${count} ประโยค: ${answer}`);
  }
  if (checks.minThaiRatio !== undefined) {
    const ratio = thaiRatio(answer);
    add(`minThaiRatio:${checks.minThaiRatio}`, ratio >= checks.minThaiRatio, `${ratio.toFixed(2)}: ${answer}`);
  }
  for (const text of checks.mustInclude ?? []) add(`mustInclude:${text}`, answer.includes(text), answer);
  for (const text of checks.mustNotInclude ?? []) add(`mustNotInclude:${text}`, !answer.includes(text), answer);
  if (checks.asksBack) add("asksBack", /(?:ไหม|มั้ย|อะไร|ไหน|อย่างไร|ยังไง|เมื่อไร|กี่|หรือเปล่า|\?)\s*(?:คะ|ค่ะ|ครับ)?\s*$/u.test(answer), answer);
  if (checks.routerBlocked !== undefined) add("routerBlocked", input.routerBlocked === checks.routerBlocked);
  if (checks.memoryRejected !== undefined) add("memoryRejected", input.memoryRejected, checks.memoryRejected);
  for (const text of checks.memorySelected ?? []) {
    add(`memorySelected:${text}`, input.selectedMemories.includes(text), `ส่งไป ${input.selectedMemories.length} เรื่อง`);
  }
  return grades;
}
