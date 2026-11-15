// ตรวจว่าเว็บจริงของ Javis ยังใช้งานได้ โดยถาม /health แล้วดูทั้งเซิร์ฟเวอร์และบัญชี AI
// .github/workflows/uptime.yml รันทุก 5 นาที รันเองได้: node scripts/uptime-check.mjs [url]
// ออกด้วยรหัส 0 เมื่อปกติ และ 1 เมื่อใช้งานไม่ได้ พร้อมเขียนผลลง GITHUB_OUTPUT ให้ขั้นถัดไปเปิดหรือปิด issue แจ้งเตือน
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_HEALTH_URL = "https://javis-bice.vercel.app/health";
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;

/** สถานะบริการ AI ที่ทำให้คุยกับ Javis ไม่ได้ (ชุดเดียวกับที่ server/aiAccount.ts รายงานใน /health) */
const AI_PROBLEM_LABEL = {
  quota: "โควตาหรือเครดิตหมด",
  auth: "กุญแจ API ใช้ไม่ได้",
  model: "ชื่อโมเดลใช้ไม่ได้",
  unreachable: "ติดต่อผู้ให้บริการไม่ได้"
};

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * แปลงคำตอบของ /health เป็นผลตรวจ
 * ใช้งานไม่ได้เมื่อไม่ได้ HTTP 200, ไม่มี ok: true หรือบัญชี AI อยู่ในสถานะ degraded (คุยกับ Javis ไม่ได้)
 * เหตุผลสร้างจากค่าที่รู้จักเท่านั้น ข้อความอื่นจากคำตอบไม่ถูกส่งต่อไปใน issue
 */
export function evaluateHealth(status, body) {
  if (status !== 200) return { healthy: false, reason: `/health ตอบ HTTP ${status}` };
  if (!isRecord(body) || body.ok !== true) return { healthy: false, reason: "/health ไม่ได้ตอบ ok: true" };

  const ai = isRecord(body.ai) ? body.ai : null;
  if (ai?.status === "degraded") {
    const problems = ["chat", "transcribe"]
      .filter((service) => typeof ai[service] === "string" && Object.hasOwn(AI_PROBLEM_LABEL, ai[service]))
      .map((service) => `${service}: ${AI_PROBLEM_LABEL[ai[service]]}`);
    return { healthy: false, reason: `บัญชี AI มีปัญหา${problems.length > 0 ? ` (${problems.join(", ")})` : ""}` };
  }
  return { healthy: true, reason: "ใช้งานได้ปกติ" };
}

function describeError(error, timeoutMs) {
  if (error?.name === "TimeoutError") return `ไม่ตอบภายใน ${timeoutMs / 1000} วินาที`;
  const code = error?.cause?.code;
  return typeof code === "string" ? code : (error?.name ?? "unknown");
}

/** ถาม /health หนึ่งครั้ง เครือข่ายขัดข้องหรือหมดเวลานับเป็นใช้งานไม่ได้ ไม่โยนข้อผิดพลาดออกไป */
export async function checkOnce(url, { timeoutMs = TIMEOUT_MS, fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "javis-uptime-check" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await response.json().catch(() => null);
    return evaluateHealth(response.status, body);
  } catch (error) {
    return { healthy: false, reason: `เชื่อมต่อ /health ไม่ได้ (${describeError(error, timeoutMs)})` };
  }
}

/** ลองซ้ำก่อนสรุปว่าล่ม เพื่อไม่ให้ cold start หรือเครือข่ายสะดุดครั้งเดียวกลายเป็นการแจ้งเตือน */
export async function checkWithRetries(
  url,
  { attempts = ATTEMPTS, retryDelayMs = RETRY_DELAY_MS, check = checkOnce, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}
) {
  let result = { healthy: false, reason: "ยังไม่ได้ตรวจ" };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = await check(url);
    if (result.healthy) return { ...result, attempts: attempt };
    if (attempt < attempts) await sleep(retryDelayMs);
  }
  return { ...result, attempts };
}

function writeGithubOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/[\r\n]+/g, " ")}`);
  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

async function main() {
  const url = process.argv[2] || process.env.HEALTH_URL || DEFAULT_HEALTH_URL;
  if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
    console.error(`ที่อยู่ที่จะตรวจไม่ถูกต้อง: ${url}`);
    process.exitCode = 2;
    return;
  }

  const result = await checkWithRetries(url);
  const line = `${result.healthy ? "UP" : "DOWN"} ${url} - ${result.reason} (ลอง ${result.attempts} ครั้ง)`;
  process.stdout.write(`${line}\n`);
  writeGithubOutputs({ healthy: result.healthy, reason: result.reason, url });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  process.exitCode = result.healthy ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
