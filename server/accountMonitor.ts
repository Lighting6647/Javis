import { aiAccount, describeAccountCheck, runAccountCheck } from "./aiAccount.js";
import { createClaudeAccountProbe } from "./claudeClient.js";
import { config } from "./config.js";

let running: Promise<void> | null = null;

/**
 * ตรวจบัญชี AI แล้วบันทึกผลไว้ให้ /health และ /api/status รายงาน
 * การเรียกซ้อนกันจะรอผลของรอบที่กำลังทำอยู่ ไม่ส่งคำขอซ้ำ
 * @param announce เขียนผลลง log เสมอ ถ้าเป็น false จะเขียนเฉพาะเมื่อสถานะเปลี่ยน
 */
export function checkAiAccount(announce: boolean): Promise<void> {
  running ??= (async () => {
    const ai = config.ai;
    const before = aiAccount.snapshot();
    const result = await runAccountCheck({
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
    aiAccount.apply(result);

    const after = aiAccount.snapshot();
    if (!announce && before.chat === after.chat && before.transcribe === after.transcribe) return;

    const settings = {
      hasApiKey: Boolean(ai.apiKey),
      chatModel: ai.chatModel,
      transcribeModel: ai.transcribeModel,
      keyVariable: ai.keyVariable,
      chatModelVariable: ai.chatModelVariable,
      providerLabel: ai.label
    };
    for (const { level, message } of describeAccountCheck(result, settings)) console[level](message);
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
