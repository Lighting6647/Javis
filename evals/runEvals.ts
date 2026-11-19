import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInstructions } from "../server/chat.js";
import { evaluateLocalSystemOne } from "../server/jevRouter.js";
import { selectRelevantMemories } from "../server/memoryRelevance.js";
import { isSensitiveMemory } from "../server/responseStream.js";
import { grade } from "./graders.js";
import { simulateAnswer } from "./simulatedModel.js";
import type { CheckResult, EvalCase, EvalReport } from "./types.js";

export const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
/** วันที่คงที่ ให้ prompt เหมือนเดิมทุกครั้งที่รัน */
const FIXED_TODAY = "วันพฤหัสบดีที่ 19 พฤศจิกายน พ.ศ. 2569";

export interface RunOptions {
  /** ข้อความคำสั่งเพิ่มเติมที่ต่อท้าย prompt (ข้อเสนอจาก npm run learn) */
  patch?: string;
  /** รวมคำถามที่เสนอใหม่ใน evals/proposed/ ด้วย */
  includeProposed?: boolean;
  /** ใช้ชุดคำถามนี้แทนไฟล์ (เทสต์) */
  cases?: EvalCase[];
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** ชุดคำถามหลัก (evals/cases.json) และคำถามที่เสนอใหม่ (evals/proposed/*.json) ถ้าขอ */
export function loadCases(includeProposed = false): EvalCase[] {
  const cases = readJson<EvalCase[]>(path.join(EVALS_DIR, "cases.json"));
  if (!includeProposed) return cases;
  const proposedDir = path.join(EVALS_DIR, "proposed");
  let files: string[];
  try {
    files = readdirSync(proposedDir).filter((file) => file.endsWith(".json"));
  } catch {
    return cases;
  }
  return [...cases, ...files.flatMap((file) => readJson<EvalCase[]>(path.join(proposedDir, file)))];
}

const profileMemories = () => readJson<string[]>(path.join(EVALS_DIR, "memories.json"));

/** prompt ที่ระบบจริงสร้างให้คำถามนี้ (คำสั่งระบบ + ความจำที่ถูกเลือก) พร้อมข้อความเพิ่มเติม */
export function promptFor(testCase: EvalCase, patch = "") {
  const texts = testCase.memories === "profile" ? profileMemories() : (testCase.memories ?? []);
  const memories = texts.map((text, index) => ({ id: `m${index.toString(36)}`, text }));
  const selected = selectRelevantMemories(memories, testCase.question);
  const base = buildInstructions(undefined, selected, false, FIXED_TODAY);
  return { instructions: patch.trim() ? `${base}\n\n${patch.trim()}` : base, selected: selected.map((memory) => memory.text) };
}

/** รันทุกกรณีกับ AI จำลอง แล้วให้คะแนนรายเกณฑ์ */
export function runEvals(options: RunOptions = {}): EvalReport & { answers: Record<string, string> } {
  const cases = options.cases ?? loadCases(options.includeProposed);
  const results: CheckResult[] = [];
  const answers: Record<string, string> = {};

  for (const testCase of cases) {
    const routerBlocked = !evaluateLocalSystemOne({ goal: testCase.question }).safeToRun;
    const { instructions, selected } = promptFor(testCase, options.patch);
    // คำขอที่ถูกระงับไม่ถึง AI จึงไม่มีคำตอบให้ตรวจ ตรวจเฉพาะว่าถูกระงับจริง
    const answer = routerBlocked ? "" : simulateAnswer(testCase, instructions);
    answers[testCase.id] = answer;
    const checks = routerBlocked ? { routerBlocked: testCase.checks.routerBlocked ?? false } : testCase.checks;
    const grades = grade({
      answer,
      checks,
      routerBlocked,
      memoryRejected: testCase.checks.memoryRejected ? isSensitiveMemory(testCase.checks.memoryRejected) : false,
      selectedMemories: selected
    });
    for (const result of grades) results.push({ caseId: testCase.id, category: testCase.category, ...result });
  }

  const byCategory: EvalReport["byCategory"] = {};
  for (const result of results) {
    const bucket = (byCategory[result.category] ??= { passed: 0, total: 0 });
    bucket.total += 1;
    if (result.passed) bucket.passed += 1;
  }
  const passed = results.filter((result) => result.passed).length;
  return {
    score: results.length > 0 ? Number((passed / results.length).toFixed(4)) : 0,
    passed,
    total: results.length,
    cases: cases.length,
    byCategory,
    failures: results.filter((result) => !result.passed),
    answers
  };
}

export interface Baseline {
  score: number;
  passed: number;
  total: number;
  updatedAt: string;
}

export const BASELINE_FILE = path.join(EVALS_DIR, "baseline.json");

export function readBaseline(): Baseline | null {
  try {
    return readJson<Baseline>(BASELINE_FILE);
  } catch {
    return null;
  }
}
