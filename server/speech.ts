import type { RequestHandler } from "express";
import { z } from "zod";
import type { AiProvider } from "./aiProvider.js";
import { GEMINI_API_REVISION } from "./geminiInteractions.js";
import { readUpstreamErrorCodes, sanitizeUpstreamMessage } from "./upstreamError.js";

/**
 * เสียงพูดของ Gemini: อ่านคำตอบของ Javis ออกเสียงด้วยโมเดลสร้างเสียงของ Google ซึ่งชัดและเป็นธรรมชาติกว่าเสียงในอุปกรณ์
 * หน้าเว็บส่งข้อความมาทีละช่วง เซิร์ฟเวอร์ขอเสียงจาก Interactions API ด้วยกุญแจของตัวเอง แล้วส่งไฟล์เสียงกลับ
 * ทุกความล้มเหลวตอบด้วยรหัสที่หน้าเว็บใช้ตัดสินว่าจะสลับไปเสียงในอุปกรณ์นานแค่ไหน ผู้ใช้จึงได้ยินคำตอบเสมอ
 *
 * รูปแบบคำขอและคำตอบเขียนตามเอกสารของ Google (aistudio.google.com/docs/speech-generation อ่านเมื่อ 2026-11-13)
 */

/** ความยาวสูงสุดของข้อความต่อคำขอ (ตัวอักษร) ราวครึ่งนาทีของเสียงพูด ซึ่งเป็นไฟล์เสียงราว 1.5 MB */
export const MAX_SPEECH_TEXT_LENGTH = 400;
/** โมเดลสร้างเสียงหลักและโมเดลสำรองที่พูดภาษาไทยได้ */
export const DEFAULT_TTS_MODEL = "gemini-3.8-flash-tts";
export const DEFAULT_TTS_FALLBACK_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"] as const;
/** เสียงที่ Google บรรยายว่า "ชัด" */
export const DEFAULT_TTS_VOICE = "Iapetus";
/** ลีลาการพูดที่ส่งไปกับทุกข้อความ */
const DEFAULT_TTS_STYLE = "Speak in Thai, clearly and calmly, like a courteous personal assistant, at a natural conversational pace.";

/** เสียงสำเร็จรูปทั้งหมดที่ Gemini มีให้เลือก */
export const TTS_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat"
] as const;

const UPSTREAM_TIMEOUT_MS = 20_000;
/** ต้นทางบอกว่าโควตาหมดแต่ไม่บอกว่าต้องรอนานแค่ไหน */
const DEFAULT_QUOTA_PAUSE_MS = 60_000;
const MIN_QUOTA_PAUSE_MS = 5_000;
/** โควตาต่อวันหมดต้องรอนานเป็นชั่วโมง แต่ลองใหม่ชั่วโมงละครั้งก็ไม่เปลือง และกลับมาใช้ได้เองเมื่อโควตาคืน */
const MAX_QUOTA_PAUSE_MS = 60 * 60_000;
/** ต้นทางไม่ให้ใช้โมเดลนี้ (สิทธิ์หรือชื่อโมเดล): เป็นเรื่องการตั้งค่า ลองซ้ำทุกประโยคไม่ช่วย */
const REJECTED_PAUSE_MS = 30 * 60_000;
const MAX_STYLE_LENGTH = 200;
const MODEL_NAME = /^[A-Za-z0-9._/-]{1,100}$/;
/** กุญแจ API ที่ถูกวางผิดช่อง */
const KEY_LIKE = /^(AIza|sk-|tvly-)/;

/** เสียงที่ได้เป็นข้อมูลดิบ: 24 kHz ช่องเดียว 16 บิต ตามค่าเริ่มต้นของต้นทาง */
const PCM_SAMPLE_RATE = 24_000;
const PCM_CHANNELS = 1;
const PCM_BITS = 16;

export const TTS_PERSONAS = ["assistant", "genz-girl", "upbeat-buddy", "calm-soft"] as const;
export type TtsPersonaId = (typeof TTS_PERSONAS)[number];

const TTS_PERSONA_CONFIG: Record<TtsPersonaId, { defaultVoice?: (typeof TTS_VOICES)[number]; style?: string; openAiVoice: string }> = {
  assistant: { openAiVoice: "onyx" },
  "genz-girl": {
    defaultVoice: "Leda",
    style: "Speak in Thai like a cheerful, bright Thai Gen Z teenage girl, energetic, playful, friendly, and natural.",
    openAiVoice: "nova"
  },
  "upbeat-buddy": {
    defaultVoice: "Zephyr",
    style: "Speak in Thai in a lively, upbeat, crisp, enthusiastic companion style.",
    openAiVoice: "alloy"
  },
  "calm-soft": {
    defaultVoice: "Aoede",
    style: "Speak in Thai in a soft, gentle, warm, relaxing storytelling tone.",
    openAiVoice: "shimmer"
  }
};

export const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_SPEECH_TEXT_LENGTH),
  /** เสียงที่ผู้ใช้เลือก ไม่ส่ง = เสียงเริ่มต้นของเซิร์ฟเวอร์ */
  voice: z.enum(TTS_VOICES).optional(),
  /** บุคลิก/ลีลาการพูดที่ผู้ใช้เลือก */
  persona: z.enum(TTS_PERSONAS).optional(),
  /** รหัสของช่องวินิจฉัยของผู้ดูแล แอปไม่ส่งค่านี้ */
  diagnose: z.string().max(200).optional()
});

export interface OpenAiSpeechFallback {
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
}

/** การตั้งค่าเสียงพูดของ Gemini ที่เซิร์ฟเวอร์นี้ใช้ */
export interface CloudVoice {
  apiKey: string;
  /** ที่อยู่ของ Interactions API */
  url: string;
  model: string;
  /** โมเดล Gemini TTS สำรอง เมื่อโมเดลหลักโควตาเต็มหรือถูกจำกัดสิทธิ์ */
  fallbackModels?: string[];
  /** บริการ OpenAI TTS สำรอง เมื่อตั้งค่า OPENAI_API_KEY ไว้ด้วย */
  openaiFallback?: OpenAiSpeechFallback;
  /** เสียงเริ่มต้น เมื่อผู้ใช้ไม่ได้เลือกเอง */
  voice: string;
  /** ลีลาการพูด เขียนเป็นคำบรรยาย */
  style: string;
}

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * เสียงพูดของ Gemini ที่เซิร์ฟเวอร์นี้ให้ใช้ได้ หรือ null ถ้าไม่มี
 * มีเมื่อผู้ให้บริการ AI ที่ใช้อยู่คือ Gemini (จึงมีกุญแจอยู่แล้ว) และผู้ดูแลไม่ได้ปิดด้วย GEMINI_VOICE_ENABLED=false
 */
export function resolveCloudVoice(env: Env, ai: AiProvider, warn: (message: string) => void = console.warn): CloudVoice | null {
  if (ai.name !== "gemini" || !ai.apiKey) return null;
  if (env.GEMINI_VOICE_ENABLED?.trim().toLowerCase() === "false") return null;

  let model = env.GEMINI_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
  if (!MODEL_NAME.test(model) || KEY_LIKE.test(model)) {
    // ไม่พิมพ์ค่าที่ใส่มา เพราะอาจเป็นกุญแจที่วางผิดช่อง
    warn(`ค่า GEMINI_TTS_MODEL ไม่ใช่ชื่อโมเดล จึงใช้ ${DEFAULT_TTS_MODEL} แทน`);
    model = DEFAULT_TTS_MODEL;
  }

  const wanted = env.GEMINI_TTS_VOICE?.trim();
  let voice: string = DEFAULT_TTS_VOICE;
  if (wanted) {
    const known = TTS_VOICES.find((name) => name.toLowerCase() === wanted.toLowerCase());
    if (known) voice = known;
    else warn(`ค่า GEMINI_TTS_VOICE ไม่ใช่ชื่อเสียงที่ Gemini มี จึงใช้ ${DEFAULT_TTS_VOICE} แทน`);
  }

  const openAiKey = env.OPENAI_API_KEY?.trim();
  const fallbackModels = DEFAULT_TTS_FALLBACK_MODELS.filter((candidate) => candidate !== model);

  return {
    apiKey: ai.apiKey,
    // ที่อยู่ที่ตั้งไว้ให้ Gemini เป็นของทางที่เข้ากันได้กับ OpenAI (ลงท้ายด้วย /openai) ส่วน Interactions API อยู่ระดับเดียวกัน
    url: `${ai.baseUrl.replace(/\/openai\/?$/, "")}/interactions`,
    model,
    fallbackModels,
    ...(openAiKey
      ? {
          openaiFallback: {
            apiKey: openAiKey,
            baseUrl: (env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
            model: "gpt-4o-mini-tts",
            voice: "onyx"
          }
        }
      : {}),
    voice,
    style: env.GEMINI_TTS_STYLE?.trim().slice(0, MAX_STYLE_LENGTH) || DEFAULT_TTS_STYLE
  };
}

/**
 * เนื้อหาคำขอเสียงพูดผู้พูดคนเดียวของ Interactions API
 * @param chosenVoice เสียงที่ผู้ใช้เลือก ใช้แทนเสียงเริ่มต้นของเซิร์ฟเวอร์
 */
export function buildSpeechRequest(
  text: string,
  voice: CloudVoice,
  chosenVoice?: string,
  modelOverride?: string,
  persona?: TtsPersonaId
): Json {
  const preset = persona ? TTS_PERSONA_CONFIG[persona] : undefined;
  const resolvedStyle = preset?.style ?? voice.style;
  const resolvedVoice = chosenVoice ?? preset?.defaultVoice ?? voice.voice;
  return {
    model: modelOverride ?? voice.model,
    input: [
      {
        type: "user_input",
        // ข้อความถูกอ่านตามตัวอักษร ส่วนลีลาการพูดส่งแยกเป็นคำกำกับ ไม่ปนในข้อความ
        content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: resolvedStyle }] }]
      }
    ],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: resolvedVoice }] },
    // ไม่ให้ต้นทางเก็บข้อความของผู้ใช้ไว้
    store: false
  };
}

/** ใส่หัวไฟล์ WAV ให้ข้อมูลเสียงดิบ เพื่อให้เบราว์เซอร์เล่นได้ */
function wrapPcm(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = PCM_CHANNELS * (PCM_BITS / 8);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(PCM_CHANNELS, 22);
  header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  header.writeUInt32LE(PCM_SAMPLE_RATE * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(PCM_BITS, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * หยิบเสียงจากคำตอบของ Interactions API คืนเป็นไฟล์ WAV หรือ null ถ้าคำตอบไม่มีเสียง
 * เสียงอยู่ในขั้นคำตอบของโมเดล เป็นข้อความ base64 ปกติเป็นไฟล์ WAV ครบ ถ้ามาเป็นข้อมูลดิบจะใส่หัวไฟล์ให้
 */
export function readSpeechAudio(payload: unknown): Buffer | null {
  if (!isObject(payload) || !Array.isArray(payload.steps)) return null;

  for (const step of payload.steps) {
    if (!isObject(step) || step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const part of step.content) {
      if (!isObject(part) || part.type !== "audio" || typeof part.data !== "string" || !part.data) continue;
      const bytes = Buffer.from(part.data, "base64");
      if (bytes.length === 0) continue;
      const isWav = bytes.length > 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WAVE";
      return isWav ? bytes : wrapPcm(bytes);
    }
  }
  return null;
}

/** เวลาที่ต้นทางขอให้รอก่อนลองใหม่ (มิลลิวินาที) จากรายละเอียดของข้อผิดพลาด หรือ null ถ้าไม่ได้บอก */
export function readRetryDelayMs(payload: unknown): number | null {
  if (!isObject(payload) || !isObject(payload.error) || !Array.isArray(payload.error.details)) return null;

  for (const detail of payload.error.details) {
    if (!isObject(detail) || typeof detail.retryDelay !== "string") continue;
    const match = /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay.trim());
    if (match) return Math.round(Number(match[1]) * 1000);
  }
  return null;
}

export interface SpeechHandlerDeps {
  /** การตั้งค่าเสียงพูดของ Gemini หรือ null ถ้าเซิร์ฟเวอร์นี้ไม่มี */
  voice: CloudVoice | null;
  fetch?: typeof fetch;
  /** นาฬิกาของเครื่อง (มิลลิวินาที) แยกไว้เพื่อให้ทดสอบการพักได้โดยไม่ต้องรอจริง */
  now?: () => number;
  /** รหัสที่แนบมาคือรหัสวินิจฉัยของผู้ดูแลไหม */
  isDiagnostic?: (token: string | undefined) => boolean;
}

/** เหตุที่พักการเรียกต้นทางไว้ พร้อมเวลาที่จะลองใหม่ */
interface Pause {
  code: "quota" | "rejected";
  until: number;
}

const MESSAGES = {
  unavailable: "เซิร์ฟเวอร์นี้ไม่ได้เปิดเสียงพูดของ Gemini",
  invalid: "ข้อความที่ให้อ่านออกเสียงไม่ถูกต้อง",
  quota: "โควตาเสียงพูดของ Gemini หมดชั่วคราว Javis ใช้เสียงในอุปกรณ์แทนไปก่อน",
  rejected: "บริการเสียงพูดของ Gemini ไม่ให้ใช้โมเดลที่ตั้งค่าไว้ Javis ใช้เสียงในอุปกรณ์แทน",
  failed: "ขอเสียงพูดจาก Gemini ไม่สำเร็จ Javis ใช้เสียงในอุปกรณ์แทน"
} as const;

/**
 * ตัวรับคำขอเสียงพูด: รับข้อความหนึ่งช่วง ตอบเป็นไฟล์เสียง WAV
 * เมื่อโควตาหมดหรือต้นทางไม่ให้ใช้โมเดล จะพักการเรียกต้นทางไว้ช่วงหนึ่ง คำขอระหว่างนั้นได้คำตอบทันทีโดยไม่เสียเวลาเรียก
 * (บนโฮสต์แบบ serverless การพักจำอยู่ในแต่ละอินสแตนซ์ หน้าเว็บจึงพักเองตามรหัสที่ได้ด้วย)
 */
export function createSpeechHandler(deps: SpeechHandlerDeps): RequestHandler {
  const { voice } = deps;
  const callUpstream = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const pauses = new Map<string, Pause>();

  const activePauseOf = (key: string): Pause | null => {
    const entry = pauses.get(key);
    if (!entry) return null;
    if (now() >= entry.until) {
      pauses.delete(key);
      return null;
    }
    return entry;
  };

  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");

    if (!voice) {
      response.status(404).json({ error: MESSAGES.unavailable, code: "unavailable" });
      return;
    }

    const parsed = speechRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: MESSAGES.invalid, code: "invalid" });
      return;
    }
    const { text, voice: chosenVoice, persona, diagnose } = parsed.data;
    const diagnosing = deps.isDiagnostic?.(diagnose) ?? false;

    const sendQuota = (retryMs: number, detail: Record<string, unknown> = {}) => {
      const seconds = Math.max(1, Math.ceil(retryMs / 1000));
      response.status(429).set("Retry-After", String(seconds)).json({ error: MESSAGES.quota, code: "quota", retryAfterSeconds: seconds, ...detail });
    };

    const models = diagnosing ? [voice.model] : [voice.model, ...(voice.fallbackModels ?? [])];
    let lastErrorKind: "quota" | "rejected" | "failed" | null = null;
    let lastRetryMs = DEFAULT_QUOTA_PAUSE_MS;
    let lastDetail: Record<string, unknown> = {};

    for (const candidate of models) {
      if (!diagnosing) {
        const paused = activePauseOf(candidate);
        if (paused) {
          lastErrorKind = paused.code;
          lastRetryMs = Math.max(1000, paused.until - now());
          continue;
        }
      }

      let upstream: Response;
      try {
        upstream = await callUpstream(voice.url, {
          method: "POST",
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          headers: { "x-goog-api-key": voice.apiKey, "Api-Revision": GEMINI_API_REVISION, "Content-Type": "application/json" },
          body: JSON.stringify(buildSpeechRequest(text, voice, chosenVoice, candidate, persona))
        });
      } catch (error) {
        console.error("Speech upstream error", error instanceof Error ? error.name : "unknown");
        lastErrorKind = "failed";
        continue;
      }

      const payload: unknown = await upstream.json().catch(() => null);

      if (!upstream.ok) {
        const codes = readUpstreamErrorCodes(payload);
        const message = sanitizeUpstreamMessage(isObject(payload) && isObject(payload.error) ? payload.error.message : undefined);
        console.error("Speech upstream failed", candidate, upstream.status, codes.join(","), upstream.status === 400 ? message : "");
        const detail = diagnosing ? { upstream: { httpStatus: upstream.status, codes, message } } : {};
        lastDetail = detail;

        if (upstream.status === 429) {
          const wait = Math.min(MAX_QUOTA_PAUSE_MS, Math.max(MIN_QUOTA_PAUSE_MS, readRetryDelayMs(payload) ?? DEFAULT_QUOTA_PAUSE_MS));
          pauses.set(candidate, { code: "quota", until: now() + wait });
          lastErrorKind = "quota";
          lastRetryMs = wait;
          continue;
        }
        if (upstream.status === 401 || upstream.status === 403 || upstream.status === 404) {
          pauses.set(candidate, { code: "rejected", until: now() + REJECTED_PAUSE_MS });
          lastErrorKind = "rejected";
          continue;
        }
        lastErrorKind = "failed";
        break;
      }

      const audio = readSpeechAudio(payload);
      if (!audio) {
        console.error("Speech upstream returned no audio", candidate);
        const steps = isObject(payload) && Array.isArray(payload.steps) ? payload.steps.map((step) => (isObject(step) ? String(step.type) : "?")) : [];
        lastDetail = diagnosing ? { upstream: { httpStatus: upstream.status, codes: steps, message: "no audio in response" } } : {};
        lastErrorKind = "failed";
        continue;
      }

      response.status(200).type("audio/wav").send(audio);
      return;
    }

    // ถ้าโมเดล Gemini TTS ไม่พร้อมใช้งานและมี OPENAI_API_KEY ตั้งไว้ด้วย ให้สลับไปขอเสียงจาก OpenAI TTS อัตโนมัติ
    if (!diagnosing && voice.openaiFallback && !activePauseOf("openai-tts")) {
      const fb = voice.openaiFallback;
      const preset = persona ? TTS_PERSONA_CONFIG[persona] : undefined;
      try {
        const oaRes = await callUpstream(`${fb.baseUrl}/audio/speech`, {
          method: "POST",
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          headers: { Authorization: `Bearer ${fb.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: fb.model,
            voice: preset?.openAiVoice ?? fb.voice,
            input: text,
            response_format: "wav",
            instructions: preset?.style ?? "Speak clearly in natural, courteous Thai."
          })
        });
        if (oaRes.ok) {
          const bytes = Buffer.from(await oaRes.arrayBuffer());
          if (bytes.length > 44) {
            response.status(200).type("audio/wav").send(bytes);
            return;
          }
        } else if (oaRes.status === 429) {
          pauses.set("openai-tts", { code: "quota", until: now() + DEFAULT_QUOTA_PAUSE_MS });
        } else if (oaRes.status === 401 || oaRes.status === 403 || oaRes.status === 404) {
          pauses.set("openai-tts", { code: "rejected", until: now() + REJECTED_PAUSE_MS });
        }
      } catch {
        // ข้ามไปคืนผลให้หน้าเว็บสลับเป็นเสียงในอุปกรณ์
      }
    }

    if (lastErrorKind === "quota") {
      sendQuota(lastRetryMs, lastDetail);
      return;
    }
    if (lastErrorKind === "rejected") {
      response.status(502).json({ error: MESSAGES.rejected, code: "rejected", ...lastDetail });
      return;
    }
    response.status(502).json({ error: MESSAGES.failed, code: "failed", ...lastDetail });
  };
}
