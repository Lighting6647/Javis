import { readFileSync, writeFileSync } from "node:fs";
import { BASELINE_FILE, readBaseline, runEvals } from "./runEvals.js";

/**
 * npm run eval — ตรวจคุณภาพคำตอบของเดลลูน่ากับ AI จำลอง (ไม่มีค่าใช้จ่าย ไม่ต่อเครือข่าย)
 *   --patch <ไฟล์>         ต่อท้าย prompt ด้วยคำสั่งในไฟล์ (ทดสอบข้อเสนอจาก npm run learn ก่อนแก้ prompt จริง)
 *   --include-proposed     รวมคำถามที่เสนอใหม่ใน evals/proposed/
 *   --update-baseline      บันทึกคะแนนนี้เป็นเกณฑ์ (ใช้หลังคุณไลท์อนุมัติการเปลี่ยน prompt)
 *   --verbose              แสดงคำตอบของทุกกรณี
 * จบด้วยรหัส 1 เมื่อคะแนนต่ำกว่าเกณฑ์ใน evals/baseline.json
 */
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const valueOf = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const patchFile = valueOf("--patch");
const patch = patchFile ? readFileSync(patchFile, "utf8") : undefined;
const report = runEvals({ patch, includeProposed: flag("--include-proposed") });
const baseline = readBaseline();
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

console.log(`เดลลูน่า eval: ${report.cases} คำถาม ${report.total} เกณฑ์ ผ่าน ${report.passed} (${percent(report.score)})${patchFile ? ` · patch: ${patchFile}` : ""}`);
for (const [category, counts] of Object.entries(report.byCategory)) {
  console.log(`  ${category.padEnd(9)} ${counts.passed}/${counts.total}`);
}
if (report.failures.length > 0) {
  console.log("\nเกณฑ์ที่ไม่ผ่าน:");
  for (const failure of report.failures) {
    console.log(`  ✗ ${failure.caseId} · ${failure.check}${failure.detail ? ` · ${failure.detail.slice(0, 160)}` : ""}`);
  }
}
if (flag("--verbose")) {
  console.log("\nคำตอบ:");
  for (const [id, answer] of Object.entries(report.answers)) console.log(`  ${id}: ${answer || "(ถูกระงับก่อนถึง AI)"}`);
}

if (flag("--update-baseline")) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify({ score: report.score, passed: report.passed, total: report.total, updatedAt: new Date().toISOString().slice(0, 10) }, null, 2)}\n`
  );
  console.log(`\nบันทึกเกณฑ์ใหม่: ${percent(report.score)}`);
} else if (baseline) {
  if (report.score < baseline.score) {
    console.error(`\nไม่ผ่าน: คะแนน ${percent(report.score)} ต่ำกว่าเกณฑ์ ${percent(baseline.score)} (evals/baseline.json)`);
    process.exit(1);
  }
  console.log(`\nผ่าน: คะแนนไม่ต่ำกว่าเกณฑ์ ${percent(baseline.score)}`);
} else {
  console.log("\nยังไม่มีเกณฑ์ รัน npm run eval -- --update-baseline เพื่อบันทึก");
}
