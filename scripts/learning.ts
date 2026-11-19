import { ANSWER_RULES, splitSentences, type AnswerRule } from "../evals/rules.js";
import type { EvalCase, EvalChecks } from "../evals/types.js";
import { tokenize } from "../server/memoryRelevance.js";
import type { FeedbackRecord } from "../server/userStore.js";

/**
 * วงจรเรียนรู้ของเดลลูน่า (ใช้โดย scripts/learn.ts): อ่านคำติชม 👎 จัดกลุ่มปัญหาที่ซ้ำ แล้วร่างข้อเสนอปรับ prompt และคำถามทดสอบใหม่
 * ไม่แก้ prompt จริงเอง ทุกข้อเสนอต้องรอคุณไลท์อนุมัติ
 */

export interface FeedbackCluster {
  /** รหัสกฎใน evals/rules.ts หรือ other-N สำหรับปัญหาที่ไม่ตรงกฎใด */
  id: string;
  label: string;
  rule: AnswerRule | null;
  items: FeedbackRecord[];
  /** คำที่พบบ่อยในหมายเหตุ (กลุ่มที่ไม่ตรงกฎ) */
  keywords: string[];
}

const EMOJI = /\p{Extended_Pictographic}/u;
const MARKDOWN = /(^|\n)\s*(?:#{1,6}\s|[-*•]\s|\d+[.)]\s|\|)|\*\*/u;

/** ตรวจจากข้อความคำตอบเองว่ามีปัญหาของกฎใด (ใช้เมื่อผู้ใช้ไม่ได้เขียนหมายเหตุ) */
function detectFromReply(reply: string): string[] {
  if (!reply) return [];
  const found: string[] = [];
  if (/ครับ/u.test(reply)) found.push("female-polite");
  if (MARKDOWN.test(reply)) found.push("no-markdown");
  if (EMOJI.test(reply)) found.push("no-emoji");
  if (splitSentences(reply).length > 4) found.push("short");
  const letters = reply.match(/\p{L}/gu) ?? [];
  const thai = reply.match(/[฀-๿]/gu) ?? [];
  if (letters.length > 20 && thai.length / letters.length < 0.4) found.push("thai-first");
  if (/(?:ส่ง|จอง|โทร|โอน)\S*ให้(?:เรียบร้อย)?แล้ว/u.test(reply)) found.push("no-false-claims");
  return found;
}

/** กฎที่คำติชมหนึ่งรายการชี้ถึง: จากคำในหมายเหตุก่อน ถ้าไม่มีจึงดูจากคำตอบ */
export function rulesFor(record: FeedbackRecord): AnswerRule[] {
  const byNote = record.note ? ANSWER_RULES.filter((rule) => rule.feedbackKeywords.test(record.note)) : [];
  if (byNote.length > 0) return byNote;
  const ids = new Set(detectFromReply(record.reply));
  return ANSWER_RULES.filter((rule) => ids.has(rule.id));
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/** จัดกลุ่มคำติชม 👎: ตามกฎที่ตรง และกลุ่มหมายเหตุที่คล้ายกันสำหรับปัญหาที่ไม่ตรงกฎใด */
export function clusterFeedback(records: FeedbackRecord[]): FeedbackCluster[] {
  const byRule = new Map<string, FeedbackCluster>();
  const others: Array<{ tokens: Set<string>; cluster: FeedbackCluster }> = [];

  for (const record of records.filter((entry) => entry.rating === "down")) {
    const rules = rulesFor(record);
    for (const rule of rules) {
      const cluster = byRule.get(rule.id) ?? { id: rule.id, label: rule.label, rule, items: [], keywords: [] };
      cluster.items.push(record);
      byRule.set(rule.id, cluster);
    }
    if (rules.length > 0 || !record.note) continue;

    const tokens = new Set(tokenize(record.note));
    const match = others.find((entry) => jaccard(entry.tokens, tokens) >= 0.3);
    if (match) {
      match.cluster.items.push(record);
      tokens.forEach((token) => match.tokens.add(token));
    } else {
      others.push({ tokens, cluster: { id: `other-${others.length + 1}`, label: "", rule: null, items: [record], keywords: [] } });
    }
  }

  for (const { cluster } of others) {
    const counts = new Map<string, number>();
    for (const item of cluster.items) for (const token of new Set(tokenize(item.note))) counts.set(token, (counts.get(token) ?? 0) + 1);
    cluster.keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([token]) => token);
    cluster.label = `ปัญหาอื่นที่ผู้ใช้บอก: ${cluster.keywords.join(" ") || "(ไม่มีคำสำคัญ)"}`;
  }

  return [...byRule.values(), ...others.map((entry) => entry.cluster)].sort((a, b) => b.items.length - a.items.length);
}

/** ปัญหาที่ซ้ำ: เกิดตั้งแต่ minCount ครั้งขึ้นไป */
export const repeatedClusters = (clusters: FeedbackCluster[], minCount = 2) => clusters.filter((cluster) => cluster.items.length >= minCount);

/** คำถามทดสอบตัวแทนของแต่ละกฎ (ระบบไม่เก็บคำถามของผู้ใช้ จึงใช้คำถามกลางคู่กับคำตอบจริงที่ถูกติ) */
const RULE_QUESTIONS: Record<string, string> = {
  "female-polite": "ช่วยแนะนำวิธีพักผ่อนหลังเลิกงานหน่อย",
  "no-markdown": "สรุปขั้นตอนให้ฟังหน่อย",
  "no-emoji": "วันนี้อากาศดีจัง",
  short: "อธิบายเรื่องนี้ให้ฟังหน่อย",
  "thai-first": "อธิบายเรื่องนี้เป็นภาษาไทยหน่อย",
  "no-false-claims": "ช่วยจัดการเรื่องนี้ให้หน่อย",
  "ask-back": "ช่วยหน่อย"
};

const RULE_CHECKS: Record<string, EvalChecks> = {
  "female-polite": { politeFemale: true },
  "no-markdown": { noMarkdown: true },
  "no-emoji": { noEmoji: true },
  short: { maxSentences: 3 },
  "thai-first": { minThaiRatio: 0.6 },
  "no-false-claims": { mustNotInclude: ["ให้แล้ว", "ให้เรียบร้อยแล้ว"] },
  "ask-back": { asksBack: true }
};

/** คำถามทดสอบใหม่จากคำตอบจริงที่ถูกติ (สูงสุด 3 ข้อต่อกลุ่ม) สำหรับ evals/proposed/ */
export function proposedCases(clusters: FeedbackCluster[], date: string): EvalCase[] {
  const cases: EvalCase[] = [];
  for (const cluster of clusters) {
    if (!cluster.rule) continue;
    const examples = cluster.items.filter((item) => item.reply).slice(0, 3);
    examples.forEach((item, index) => {
      cases.push({
        id: `learned-${date}-${cluster.id}-${index + 1}`,
        category: "learned",
        question: RULE_QUESTIONS[cluster.id] ?? "ช่วยตอบคำถามนี้หน่อย",
        draft: item.reply,
        checks: RULE_CHECKS[cluster.id] ?? {}
      });
    });
  }
  return cases;
}

/** ข้อความคำสั่งที่เสนอเพิ่มใน prompt (ไฟล์ .patch.txt ใช้กับ npm run eval -- --patch) */
export function proposedPatch(clusters: FeedbackCluster[]): string {
  return clusters
    .filter((cluster) => cluster.rule)
    .map((cluster) => cluster.rule?.instruction ?? "")
    .join("\n");
}

export interface EvalComparison {
  baseline: number | null;
  current: { score: number; passed: number; total: number };
  withPatch: { score: number; passed: number; total: number };
  proposedCurrent: { score: number; passed: number; total: number } | null;
  proposedWithPatch: { score: number; passed: number; total: number } | null;
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const quote = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max)}…` : text).replace(/\n/g, " ");

/** เนื้อหาไฟล์ learning/proposals-วันที่.md */
export function renderProposals(input: {
  date: string;
  days: number;
  total: number;
  downCount: number;
  clusters: FeedbackCluster[];
  repeated: FeedbackCluster[];
  patch: string;
  patchFile: string;
  casesFile: string | null;
  caseCount: number;
  currentPrompt: string;
  evals: EvalComparison | null;
}): string {
  const lines: string[] = [];
  lines.push(`# ข้อเสนอปรับคำสั่งของเดลลูน่า — ${input.date}`);
  lines.push("");
  lines.push("> **สถานะ: รออนุมัติจากคุณไลท์** สคริปต์นี้ไม่ได้แก้ prompt จริง (`server/chat/instructions.ts`) ข้อเสนอด้านล่างมีผลก็ต่อเมื่อคุณไลท์อนุมัติและมีคนนำไปแก้เอง");
  lines.push("");
  lines.push(`ข้อมูล: คำติชม ${input.days} วันล่าสุด ทั้งหมด ${input.total} รายการ เป็น 👎 ${input.downCount} รายการ พบปัญหาที่ซ้ำ (≥2 ครั้ง) ${input.repeated.length} กลุ่ม`);
  lines.push("");

  lines.push("## กลุ่มปัญหาที่ซ้ำ");
  lines.push("");
  if (input.repeated.length === 0) lines.push("ยังไม่มีปัญหาที่เกิดซ้ำ ไม่มีข้อเสนอปรับ prompt รอบนี้");
  for (const cluster of input.repeated) {
    const inPrompt = cluster.rule ? cluster.rule.promptPattern.test(input.currentPrompt) : false;
    lines.push(`### ${cluster.label} (${cluster.items.length} ครั้ง)`);
    lines.push("");
    if (cluster.rule) {
      lines.push(
        inPrompt
          ? "- prompt ปัจจุบันมีกฎนี้อยู่แล้ว แต่ผู้ใช้ยังเจอปัญหา: เสนอเพิ่มคำสั่งเน้นย้ำด้านล่าง และควรทดสอบกับโมเดลจริงด้วย"
          : "- prompt ปัจจุบันยังไม่มีกฎนี้: เสนอเพิ่มคำสั่งด้านล่าง"
      );
      lines.push(`- คำสั่งที่เสนอ: “${cluster.rule.instruction}”`);
    } else {
      lines.push("- ไม่ตรงกับกฎที่ระบบรู้จัก ต้องให้คนอ่านแล้วตัดสินว่าจะแก้อย่างไร (ไม่มีคำสั่งอัตโนมัติ)");
    }
    lines.push("- ตัวอย่างจากผู้ใช้:");
    for (const item of cluster.items.slice(0, 3)) {
      lines.push(`  - หมายเหตุ: ${item.note ? `“${quote(item.note)}”` : "(ไม่ได้เขียน)"}${item.reply ? ` · คำตอบที่ถูกติ: “${quote(item.reply)}”` : ""}`);
    }
    lines.push("");
  }

  const otherSingles = input.clusters.filter((cluster) => !input.repeated.includes(cluster));
  if (otherSingles.length > 0) {
    lines.push("## ปัญหาที่พบครั้งเดียว (ยังไม่เสนอแก้)");
    lines.push("");
    for (const cluster of otherSingles) lines.push(`- ${cluster.label}`);
    lines.push("");
  }

  lines.push("## คำสั่งที่เสนอเพิ่มใน prompt");
  lines.push("");
  if (input.patch) {
    lines.push(`ไฟล์: \`${input.patchFile}\``);
    lines.push("");
    lines.push("```text");
    lines.push(input.patch);
    lines.push("```");
  } else {
    lines.push("ไม่มี");
  }
  lines.push("");

  lines.push("## คำถามทดสอบใหม่");
  lines.push("");
  lines.push(input.casesFile ? `เพิ่ม ${input.caseCount} ข้อใน \`${input.casesFile}\` (ยังไม่อยู่ในชุดหลัก รันด้วย \`npm run eval -- --include-proposed\`)` : "ไม่มี");
  lines.push("");

  lines.push("## ผล eval (AI จำลอง)");
  lines.push("");
  if (input.evals) {
    const e = input.evals;
    lines.push(`| ชุด | prompt ปัจจุบัน | prompt + ข้อเสนอ |`);
    lines.push(`| --- | --- | --- |`);
    lines.push(`| ชุดหลัก (เกณฑ์ ${e.baseline === null ? "ยังไม่มี" : percent(e.baseline)}) | ${percent(e.current.score)} | ${percent(e.withPatch.score)} |`);
    if (e.proposedCurrent && e.proposedWithPatch) {
      lines.push(`| คำถามใหม่จากคำติชม | ${percent(e.proposedCurrent.score)} | ${percent(e.proposedWithPatch.score)} |`);
    }
    lines.push("");
    const ok = e.baseline === null || e.withPatch.score >= e.baseline;
    lines.push(ok ? "prompt + ข้อเสนอ **ไม่ต่ำกว่าเกณฑ์** ของชุดหลัก" : "**คะแนนต่ำกว่าเกณฑ์** ห้ามนำข้อเสนอนี้ไปใช้จนกว่าจะแก้");
  } else {
    lines.push("ไม่ได้รัน");
  }
  lines.push("");

  lines.push("## ขั้นตอนหลังคุณไลท์อนุมัติ");
  lines.push("");
  lines.push("1. เพิ่มคำสั่งที่อนุมัติลงใน `CORE_INSTRUCTIONS` ของ `server/chat/instructions.ts`");
  lines.push("2. ย้ายคำถามที่อนุมัติจาก `evals/proposed/` เข้า `evals/cases.json`");
  lines.push("3. รัน `npm run eval` ต้องไม่ต่ำกว่า `evals/baseline.json` แล้วจึง `npm run eval -- --update-baseline`");
  lines.push("4. รัน `npm run build`, `npm run lint`, `npm test`, `node e2e/meeting.e2e.mjs` ให้ผ่านทั้งหมดก่อน commit");
  lines.push("");
  return lines.join("\n");
}
