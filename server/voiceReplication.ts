import type { RequestHandler } from "express";
import { z } from "zod";
import type { CloudVoice } from "./speech.js";
import { readUpstreamErrorCodes, sanitizeUpstreamMessage } from "./upstreamError.js";

/** ประโยคยินยอมภาษาไทยตามข้อกำหนดอย่างเป็นทางการของ Gemini Voice Replication */
export const THAI_CONSENT_PHRASE = "ฉันเป็นเจ้าของเสียงนี้ และฉันยินยอมให้ Google ใช้เสียงนี้เพื่อสร้างแบบจำลองเสียงสังเคราะห์";

export const CUSTOM_VOICE_ID_PATTERN = /^voice(?:key)?_[A-Za-z0-9._-]{4,120}$/;

const REPLICATION_MODELS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"] as const;
const UPSTREAM_TIMEOUT_MS = 45_000;
const MAX_CLIP_BASE64_LENGTH = 2_800_000;
const MIN_CLIP_BYTES = 8_000;

export const replicateVoiceSchema = z.object({
  displayName: z.string().trim().min(1).max(60).default("เสียงของคุณไลท์"),
  sourceAudioBase64: z.string().trim().min(100).max(MAX_CLIP_BASE64_LENGTH),
  consentAudioBase64: z.string().trim().min(100).max(MAX_CLIP_BASE64_LENGTH),
  mimeType: z.enum(["audio/wav", "audio/l16", "audio/pcm"]).default("audio/wav")
});

export interface StoredCustomVoice {
  id: string;
  displayName: string;
  createTime?: string;
}

export interface VoiceReplicationDeps {
  voice: CloudVoice | null;
  fetch?: typeof fetch;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

export function resolveVoicesBaseUrl(voice: CloudVoice): string {
  return `${voice.url.replace(/\/interactions\/?$/, "")}/voices`;
}

function isValidWavBase64(b64: string): boolean {
  try {
    const bytes = Buffer.from(b64, "base64");
    return bytes.length >= MIN_CLIP_BYTES;
  } catch {
    return false;
  }
}

function parseVoiceEntry(item: unknown): StoredCustomVoice | null {
  if (!isObject(item) || typeof item.id !== "string" || !CUSTOM_VOICE_ID_PATTERN.test(item.id)) return null;
  return {
    id: item.id,
    displayName: typeof item.display_name === "string" && item.display_name.trim() ? item.display_name.trim() : "เสียงที่บันทึกไว้",
    ...(typeof item.create_time === "string" ? { createTime: item.create_time } : {})
  };
}

function describeReplicationError(status: number, message: string): string {
  if (status === 429) {
    return "โควตาการสร้างเสียงจำลองของ Gemini เต็มชั่วคราว กรุณารอสักครู่แล้วลองใหม่ หรือตรวจสอบ Billing ของ Google AI Studio";
  }
  if (status === 401 || status === 403 || status === 404) {
    return "API Key นี้ยังไม่มีสิทธิ์ใช้งานฟีเจอร์จำลองเสียง (Gemini 3.8 Voice Replication) บน Google AI Studio";
  }
  if (status === 400) {
    const lower = message.toLowerCase();
    if (lower.includes("consent")) {
      return `Google ตรวจไม่พบประโยคยินยอมที่ตรงเงื่อนไข กรุณาอัดคลิปยืนยันโดยอ่านข้อความนี้ให้ชัด: "${THAI_CONSENT_PHRASE}"`;
    }
    return "ไฟล์เสียงตัวอย่างสั้นเกินไปหรือไม่ชัดเจน กรุณาอัดเสียงพูดธรรมชาติ 10–25 วินาที และคลิปยินยอมในที่เงียบแล้วลองใหม่";
  }
  return "บันทึกและสร้างโมเดลเสียงจำลองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

export function createVoiceReplicationHandlers(deps: VoiceReplicationDeps): {
  listVoices: RequestHandler;
  replicateVoice: RequestHandler;
  deleteVoice: RequestHandler;
} {
  const { voice } = deps;
  const callUpstream = deps.fetch ?? fetch;

  const listVoices: RequestHandler = async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!voice) {
      response.json({ ok: true, available: false, voices: [], consentPhrase: THAI_CONSENT_PHRASE });
      return;
    }

    try {
      const upstream = await callUpstream(`${resolveVoicesBaseUrl(voice)}?type=replicated&page_size=50`, {
        method: "GET",
        signal: AbortSignal.timeout(15_000),
        headers: { "x-goog-api-key": voice.apiKey }
      });
      if (!upstream.ok) {
        response.json({ ok: true, available: true, voices: [], consentPhrase: THAI_CONSENT_PHRASE });
        return;
      }
      const payload: unknown = await upstream.json().catch(() => null);
      const list = isObject(payload) && Array.isArray(payload.voices)
        ? payload.voices.map(parseVoiceEntry).filter((entry): entry is StoredCustomVoice => entry !== null)
        : [];
      response.json({ ok: true, available: true, voices: list, consentPhrase: THAI_CONSENT_PHRASE });
    } catch {
      response.json({ ok: true, available: true, voices: [], consentPhrase: THAI_CONSENT_PHRASE });
    }
  };

  const replicateVoice: RequestHandler = async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!voice) {
      response.status(404).json({ ok: false, error: "เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่า Gemini API สำหรับสร้างเสียงจำลอง", code: "unavailable" });
      return;
    }

    const parsed = replicateVoiceSchema.safeParse(request.body);
    if (!parsed.success || !isValidWavBase64(parsed.data.sourceAudioBase64) || !isValidWavBase64(parsed.data.consentAudioBase64)) {
      response.status(400).json({
        ok: false,
        error: "ข้อมูลเสียงไม่สมบูรณ์ กรุณาอัดเสียงตัวอย่างและเสียงยืนยันสิทธิ์ให้ครบก่อนบันทึก",
        code: "invalid"
      });
      return;
    }

    const { displayName, sourceAudioBase64, consentAudioBase64, mimeType } = parsed.data;
    const baseUrl = resolveVoicesBaseUrl(voice);

    let lastStatus = 502;
    let lastMessage = "";

    for (const model of REPLICATION_MODELS) {
      let upstream: Response;
      try {
        upstream = await callUpstream(baseUrl, {
          method: "POST",
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          headers: { "x-goog-api-key": voice.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            store: true,
            voice: {
              model,
              type: "replicated",
              display_name: displayName,
              replicated: {
                source_audio: { mime_type: mimeType, data: sourceAudioBase64 },
                consent_audio: { mime_type: mimeType, data: consentAudioBase64 }
              }
            }
          })
        });
      } catch {
        lastStatus = 502;
        continue;
      }

      const payload: unknown = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        lastStatus = upstream.status;
        const codes = readUpstreamErrorCodes(payload);
        lastMessage = sanitizeUpstreamMessage(isObject(payload) && isObject(payload.error) ? payload.error.message : undefined);
        console.error("Voice replication failed", model, upstream.status, codes.join(","), upstream.status === 400 ? lastMessage : "");
        if (upstream.status === 429) continue;
        break;
      }

      const created = parseVoiceEntry(payload);
      if (!created) {
        lastStatus = 502;
        continue;
      }

      response.status(201).json({ ok: true, voice: created, model });
      return;
    }

    response.status(lastStatus === 429 ? 429 : lastStatus === 400 ? 400 : 502).json({
      ok: false,
      error: describeReplicationError(lastStatus, lastMessage),
      code: lastStatus === 429 ? "quota" : lastStatus === 400 ? "invalid" : "failed"
    });
  };

  const deleteVoice: RequestHandler = async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!voice) {
      response.status(404).json({ ok: false, error: "ไม่พบบริการเสียงของ Gemini" });
      return;
    }
    const id = String(request.params.id ?? "").trim();
    if (!CUSTOM_VOICE_ID_PATTERN.test(id)) {
      response.status(400).json({ ok: false, error: "รหัสเสียงไม่ถูกต้อง" });
      return;
    }
    try {
      const upstream = await callUpstream(`${resolveVoicesBaseUrl(voice)}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(15_000),
        headers: { "x-goog-api-key": voice.apiKey }
      });
      if (!upstream.ok && upstream.status !== 404) {
        response.status(502).json({ ok: false, error: "ลบเสียงจำลองออกจาก Gemini ไม่สำเร็จ" });
        return;
      }
      response.json({ ok: true, id });
    } catch {
      response.status(502).json({ ok: false, error: "เชื่อมต่อบริการลบเสียงไม่สำเร็จ" });
    }
  };

  return { listVoices, replicateVoice, deleteVoice };
}
