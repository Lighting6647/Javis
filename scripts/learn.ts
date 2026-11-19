import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases, promptFor, readBaseline, runEvals } from "../evals/runEvals.js";
import { getUserStore, type FeedbackRecord } from "../server/userStore.js";
import { clusterFeedback, proposedCases, proposedPatch, renderProposals, repeatedClusters, type EvalComparison } from "./learning.js";

/**
 * npm run learn — วงจรเรียนรู้จากคำติชม
 * อ่านคำติชม 👎 พร้อมหมายเหตุของ 7 วันล่าสุด (จากฐานข้อมูลเมื่อตั้ง DATABASE_URL หรือจากไฟล์ที่ระบุ)
 * จัดกลุ่มปัญหาที่ซ้ำ แล้วเขียน learning/proposals-วันที่.md, learning/proposals-วันที่.patch.txt และ evals/proposed/learned-วันที่.json
 * ไม่แก้ prompt จริง ต้องรอคุณไลท์อนุมัติ
 *   --days <n>       ย้อนหลังกี่วัน (ค่าเริ่มต้น 7)
 *   --min <n>        นับเป็นปัญหาซ้ำเมื่อเกิดอย่างน้อยกี่ครั้ง (ค่าเริ่มต้น 2)
 *   --file <json>    อ่านคำติชมจากไฟล์ JSON (รายการ { rating, note, reply, createdAt }) แทนฐานข้อมูล
 *   --date <YYYY-MM-DD>  วันที่ในชื่อไฟล์ (ค่าเริ่มต้น วันนี้ตามเวลาไทย)
 *   --out <โฟลเดอร์>  เขียนไฟล์ผลลัพธ์ไว้ที่อื่นแทนโฟลเดอร์โปรเจกต์ (ทดลองรัน)
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueOf = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const days = Math.max(1, Number(valueOf("--days") ?? 7) || 7);
const minCount = Math.max(1, Number(valueOf("--min") ?? 2) || 2);
const OUT = path.resolve(valueOf("--out") ?? ROOT);
const date = valueOf("--date") ?? new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function readFeedback(): Promise<FeedbackRecord[]> {
  const file = valueOf("--file");
  if (file) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Array<Partial<FeedbackRecord>>;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return raw
      .filter((item) => item.rating === "down" || item.rating === "up")
      .map((item) => ({
        user: String(item.user ?? "_"),
        rating: item.rating as FeedbackRecord["rating"],
        note: String(item.note ?? ""),
        reply: String(item.reply ?? ""),
        createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now()
      }))
      .filter((item) => item.createdAt >= since);
  }
  const store = getUserStore();
  if (store.kind === "memory") {
    console.warn("ไม่ได้ตั้ง DATABASE_URL: คำติชมเก็บในหน่วยความจำของเซิร์ฟเวอร์ สคริปต์นี้อ่านไม่ได้ ใช้ --file แทน หรือตั้ง DATABASE_URL");
    return [];
  }
  return store.listFeedback({ user: null, days });
}

const summarize = (report: { score: number; passed: number; total: number }) => ({ score: report.score, passed: report.passed, total: report.total });

async function main(): Promise<void> {
  const records = await readFeedback();
  const down = records.filter((record) => record.rating === "down");
  console.log(`คำติชม ${days} วันล่าสุด: ${records.length} รายการ เป็น 👎 ${down.length} รายการ`);
  if (down.length === 0) {
    console.log("ไม่มีคำติชม 👎 ไม่มีอะไรต้องเสนอ");
    return;
  }

  const clusters = clusterFeedback(records);
  const repeated = repeatedClusters(clusters, minCount);
  const patch = proposedPatch(repeated);
  const cases = proposedCases(repeated, date);

  mkdirSync(path.join(OUT, "learning"), { recursive: true });
  const patchFile = `learning/proposals-${date}.patch.txt`;
  if (patch) writeFileSync(path.join(OUT, patchFile), `${patch}\n`);
  let casesFile: string | null = null;
  if (cases.length > 0) {
    mkdirSync(path.join(OUT, "evals/proposed"), { recursive: true });
    casesFile = `evals/proposed/learned-${date}.json`;
    writeFileSync(path.join(OUT, casesFile), `${JSON.stringify(cases, null, 2)}\n`);
  }

  // เทียบคะแนน: ชุดหลักต้องไม่ต่ำกว่าเกณฑ์เมื่อเพิ่มข้อเสนอ และคำถามใหม่ควรผ่านมากขึ้น
  const baseCases = loadCases();
  const evals: EvalComparison = {
    baseline: readBaseline()?.score ?? null,
    current: summarize(runEvals({ cases: baseCases })),
    withPatch: summarize(runEvals({ cases: baseCases, patch })),
    proposedCurrent: cases.length > 0 ? summarize(runEvals({ cases })) : null,
    proposedWithPatch: cases.length > 0 ? summarize(runEvals({ cases, patch })) : null
  };

  const markdown = renderProposals({
    date,
    days,
    total: records.length,
    downCount: down.length,
    clusters,
    repeated,
    patch,
    patchFile,
    casesFile,
    caseCount: cases.length,
    currentPrompt: promptFor({ id: "prompt", category: "x", question: "", checks: {} }).instructions,
    evals
  });
  const proposalFile = `learning/proposals-${date}.md`;
  writeFileSync(path.join(OUT, proposalFile), markdown);

  console.log(`กลุ่มปัญหาที่ซ้ำ: ${repeated.length} · คำถามทดสอบใหม่: ${cases.length}`);
  console.log(`เขียนข้อเสนอแล้ว: ${proposalFile}${patch ? ` และ ${patchFile}` : ""}${casesFile ? ` และ ${casesFile}` : ""}`);
  console.log("ยังไม่ได้แก้ prompt จริง รอคุณไลท์อนุมัติ");
  if (evals.baseline !== null && evals.withPatch.score < evals.baseline) {
    console.error("คำเตือน: prompt + ข้อเสนอได้คะแนนชุดหลักต่ำกว่าเกณฑ์");
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("npm run learn ไม่สำเร็จ", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
