import { describe, expect, it } from "vitest";
import { grade, thaiRatio } from "./graders.js";
import { activeRules, ANSWER_RULES, maxSentencesFrom, splitSentences } from "./rules.js";
import { loadCases, promptFor, readBaseline, runEvals } from "./runEvals.js";
import { fillMemories, simulateAnswer } from "./simulatedModel.js";
import type { EvalCase } from "./types.js";

describe("ชุดคำถาม evals/cases.json", () => {
  const cases = loadCases();

  it("มีราว 30 คำถามภาษาไทย รหัสไม่ซ้ำ และทุกกรณีมีเกณฑ์", () => {
    expect(cases.length).toBeGreaterThanOrEqual(28);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    for (const item of cases) expect(Object.keys(item.checks).length).toBeGreaterThan(0);
    // คำถามส่วนใหญ่เป็นภาษาไทย (บางข้อจงใจมีคำสั่งภาษาอังกฤษ เช่น prompt injection)
    expect(cases.filter((item) => thaiRatio(item.question) > 0.5).length).toBeGreaterThanOrEqual(25);
  });

  it("prompt ปัจจุบันได้คะแนนไม่ต่ำกว่าเกณฑ์ใน evals/baseline.json", () => {
    const baseline = readBaseline();
    expect(baseline).not.toBeNull();
    expect(runEvals().score).toBeGreaterThanOrEqual(baseline?.score ?? 1);
  });
});

describe("AI จำลองทำตามเฉพาะกฎที่ prompt สั่ง", () => {
  const sample: EvalCase = {
    id: "x",
    category: "format",
    question: "สอนทำไข่เจียว",
    draft: "## วิธีทำ\n1. ตีไข่ครับ\n2. ใส่น้ำมันครับ\n3. ทอดครับ\n4. ตักครับ\n5. เสิร์ฟครับ 🍳",
    checks: { noMarkdown: true, noEmoji: true, politeFemale: true, maxSentences: 4 }
  };

  it("prompt ไม่มีกฎ: คำตอบเป็นร่างเดิม ไม่ผ่านเกณฑ์", () => {
    const answer = simulateAnswer(sample, "คุณคือผู้ช่วย");
    expect(answer).toContain("##");
    const failed = grade({ answer, checks: sample.checks, routerBlocked: false, memoryRejected: false, selectedMemories: [] }).filter((g) => !g.passed);
    expect(failed.map((g) => g.check)).toEqual(["politeFemale", "noMarkdown", "noEmoji", "maxSentences:4"]);
  });

  it("prompt จริงของเดลลูน่า: ผ่านทุกเกณฑ์", () => {
    const { instructions } = promptFor(sample);
    const answer = simulateAnswer(sample, instructions);
    expect(grade({ answer, checks: sample.checks, routerBlocked: false, memoryRejected: false, selectedMemories: [] }).every((g) => g.passed)).toBe(true);
  });

  it("ข้อความเพิ่มเติม (patch) ที่สั่งสั้นลงมีผลกับคำตอบ", () => {
    const { instructions } = promptFor(sample, "ตอบให้จบภายในไม่เกินสองประโยค");
    expect(splitSentences(simulateAnswer(sample, instructions))).toHaveLength(2);
  });

  it("หยิบความจำจาก prompt ได้เฉพาะเรื่องที่ถูกส่งไป", () => {
    expect(fillMemories("{{memory:แมว}}", "- [m1] ผู้ใช้มีแมวชื่อมะลิ")).toBe("คุณมีแมวชื่อมะลิ");
    expect(fillMemories("{{memory:แมว}}", "ไม่มีความจำ")).toBe("ยังไม่ทราบเรื่องนี้");
  });

  it("prompt ที่ตัดกฎออกได้คะแนนต่ำกว่า (eval จับการถดถอยได้)", () => {
    // จำลอง prompt ที่ไม่มีกฎเลย: ทุกกรณีที่มีร่างคำตอบถูกตรวจกับร่างดิบ
    const raw = loadCases().filter((item) => item.draft);
    const rawFailures = raw.filter((item) => {
      const answer = simulateAnswer(item, "คุณคือผู้ช่วย");
      return grade({ answer, checks: { ...item.checks, memorySelected: undefined, memoryRejected: undefined, routerBlocked: undefined }, routerBlocked: false, memoryRejected: false, selectedMemories: [] }).some((g) => !g.passed);
    });
    expect(rawFailures.length).toBeGreaterThan(raw.length / 2);
  });
});

describe("rules", () => {
  it("อ่านจำนวนประโยคสูงสุดจาก prompt (เอาค่าที่น้อยที่สุด)", () => {
    expect(maxSentencesFrom("ไม่เกินสามถึงสี่ประโยค")).toBe(4);
    expect(maxSentencesFrom("ไม่เกินสามถึงสี่ประโยค และไม่เกิน 2 ประโยค")).toBe(2);
    expect(maxSentencesFrom("ตอบสั้น")).toBeNull();
  });

  it("ทุกกฎมีคำสั่งมาตรฐานที่ตรงกับรูปแบบที่ AI จำลองตรวจ", () => {
    for (const rule of ANSWER_RULES) expect(activeRules(rule.instruction).map((entry) => entry.id)).toContain(rule.id);
  });
});
