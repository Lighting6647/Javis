import { type AccountCheckResult, aiAccount, describeAccountCheck, runAccountCheck } from "./aiAccount.js";
import type { AiProvider } from "./aiProvider.js";
import { createClaudeAccountProbe } from "./claudeClient.js";
import { claudeCodeSdkInstalled } from "./claudeCode.js";
import { config } from "./config.js";

let running: Promise<void> | null = null;

/**
 * Claude Code บนเครื่องนี้ไม่มีกุญแจและเครดิตให้ตรวจ ตรวจได้แค่ว่าติดตั้ง SDK แล้ว (ไม่ส่งคำถามจริง จึงไม่ใช้โควตา)
 * ยังไม่ได้ติดตั้ง = รายงานว่าโมเดลใช้ไม่ได้ ซึ่งทำให้สลับไปรายที่มีกุญแจตั้งแต่เริ่มเซิร์ฟเวอร์ ถ้ามี
 */
async function probeClaudeCode(): Promise<AccountCheckResult> {
  const installed = await claudeCodeSdkInstalled();
  if (!installed) console.warn("ผู้ให้บริการ claude-code: ยังไม่ได้ติดตั้ง @anthropic-ai/claude-agent-sdk ให้รัน npm install @anthropic-ai/claude-agent-sdk");
  return { chat: installed ? "ok" : "model", transcribe: "unsupported", credits: "skipped", retiring: [] };
}

function probeProvider(ai: AiProvider): Promise<AccountCheckResult> {
  if (ai.apiStyle === "claude-code") return probeClaudeCode();
  return runAccountCheck({
    baseUrl: ai.baseUrl,
    apiKey: ai.apiKey,
    chatModel: ai.chatModel,
    transcribeModel: ai.transcribeModel,
    creditCheck: ai.creditCheck,
    // Claude ถูกเรียกผ่าน SDK ของ Anthropic จึงมีตัวตรวจของตัวเอง รายอื่นตรวจด้วย HTTP ตามรูปแบบของรายนั้น
    ...(ai.apiStyle === "claude"
      ? ai.apiKey
        ? { probe: createClaudeAccountProbe({ apiKey: ai.apiKey, baseUrl: ai.baseUrl }) }
        : {}
      : { apiStyle: ai.apiStyle })
  });
}

function buildSettingsReport(ai: AiProvider) {
  return {
    // Claude Code ไม่ใช้กุญแจ จึงไม่ต้องเตือนว่ายังไม่ได้ตั้งกุญแจ
    hasApiKey: Boolean(ai.apiKey) || ai.apiStyle === "claude-code",
    chatModel: ai.chatModel,
    transcribeModel: ai.transcribeModel,
    keyVariable: ai.keyVariable,
    chatModelVariable: ai.chatModelVariable,
    providerLabel: ai.label
  };
}

/**
 * ตรวจบัญชี AI แล้วบันทึกผลไว้ให้ /health และ /api/status รายงาน
 * หากบัญชีหลักใช้งานไม่ได้ (quota/auth/model) และมีผู้ให้บริการสำรองพร้อมใช้ จะสลับอัตโนมัติทันที
 * การเรียกซ้อนกันจะรอผลของรอบที่กำลังทำอยู่ ไม่ส่งคำขอซ้ำ
 * @param announce เขียนผลลง log เสมอ ถ้าเป็น false จะเขียนเฉพาะเมื่อสถานะเปลี่ยน
 */
export function checkAiAccount(announce: boolean): Promise<void> {
  running ??= (async () => {
    const ai = config.ai;
    const before = aiAccount.snapshot();
    const result = await probeProvider(ai);

    if ((result.chat === "quota" || result.chat === "auth" || result.chat === "model") && config.fallbackAi.length > 0) {
      for (let idx = 0; idx < config.fallbackAi.length; idx += 1) {
        const candidate = config.fallbackAi[idx]!;
        const candidateResult = await probeProvider(candidate);
        if (candidateResult.chat === "ok") {
          config.fallbackAi.splice(idx, 1);
          config.ai = candidate;
          aiAccount.apply(candidateResult);
          console.warn(
            `ตรวจบัญชี AI: ${ai.label} ใช้งานไม่ได้ (${result.chat}) จึงสลับไปใช้ ${candidate.label} (${candidate.chatModel}) อัตโนมัติ`
          );
          for (const { level, message } of describeAccountCheck(candidateResult, buildSettingsReport(candidate))) {
            console[level](message);
          }
          return;
        }
      }
    }

    aiAccount.apply(result);

    const after = aiAccount.snapshot();
    if (!announce && before.chat === after.chat && before.transcribe === after.transcribe) return;

    for (const { level, message } of describeAccountCheck(result, buildSettingsReport(ai))) console[level](message);
  })().finally(() => {
    running = null;
  });
  return running;
}

export interface OnDemandCheckOptions {
  /** ตรวจบัญชีหนึ่งรอบ */
  run: () => Promise<void>;
  /** สถานะล่าสุดปกติดีหรือไม่ ถ้าปกติจะไม่ตรวจซ้ำ */
  isHealthy: () => boolean;
  /** ระหว่างที่ยังมีปัญหา ตรวจซ้ำได้ถี่สุดเท่านี้ */
  recheckMs: number;
  now?: () => number;
}

/**
 * ตรวจบัญชีตอนที่มีคนถามสถานะ สำหรับโฮสต์แบบ serverless ที่ไม่มีตัวจับเวลาเบื้องหลัง
 * ตรวจครั้งแรกที่ถูกเรียก จากนั้นตรวจซ้ำเฉพาะตอนที่ยังมีปัญหาและผลเดิมเก่าเกินกำหนด
 * ตอนปกติจึงไม่มีค่าใช้จ่ายเพิ่ม และสถานะกลับมาปกติเองหลังผู้ดูแลแก้ไข
 */
export function createOnDemandCheck(options: OnDemandCheckOptions): () => Promise<void> {
  const { run, isHealthy, recheckMs } = options;
  const now = options.now ?? Date.now;
  let lastStartedAt: number | null = null;
  let pending: Promise<void> | null = null;

  return () => {
    if (pending) return pending;

    const due = lastStartedAt === null || (!isHealthy() && now() - lastStartedAt >= recheckMs);
    if (!due) return Promise.resolve();

    lastStartedAt = now();
    pending = run().finally(() => {
      pending = null;
    });
    return pending;
  };
}
