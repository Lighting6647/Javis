import type { RequestHandler } from "express";
import { aiAccount } from "./aiAccount.js";
import { config } from "./config.js";
import { describeUpstreamFailure, readRejectedResponse } from "./upstreamError.js";

const UPSTREAM_TIMEOUT_MS = 30_000;
/** เสียงสั้นกว่านี้ไม่มีคำพูดให้แปลง ตอบว่างได้เลยโดยไม่เสียค่าใช้จ่าย */
const MIN_AUDIO_BYTES = 1024;
const SPEECH_LANGUAGE = "th";

/** ชนิดไฟล์เสียงที่รับ คู่กับนามสกุลที่ต้นทางใช้ดูชนิดไฟล์ */
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg"
};

export function audioExtension(contentType: string | undefined): string | null {
  const mediaType = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return AUDIO_EXTENSIONS[mediaType] ?? null;
}

/**
 * รับเสียงที่อัดจากแอปเดสก์ท็อป แล้วส่งไปแปลงเป็นข้อความภาษาไทย
 * ใช้เฉพาะที่ที่ระบบรู้จำเสียงของอุปกรณ์ใช้ไม่ได้
 */
export const transcribeHandler: RequestHandler = async (request, response) => {
  response.setHeader("Cache-Control", "no-store");

  const ai = config.ai;
  if (!ai.transcribeModel) {
    // ผู้ให้บริการ AI ที่ตั้งค่าไว้ไม่มีการแปลงเสียง แอปจะแจ้งให้ผู้ใช้พิมพ์แทน
    response.status(503).json({ error: "บริการ AI ที่ใช้อยู่ยังไม่รองรับการแปลงเสียง กรุณาพิมพ์ข้อความแทน" });
    return;
  }
  if (!ai.apiKey) {
    response.status(500).json({ error: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่ากุญแจของบริการ AI กรุณาแจ้งผู้ดูแลระบบ" });
    return;
  }

  const extension = audioExtension(request.headers["content-type"]);
  const audio: unknown = request.body;
  if (!extension || !Buffer.isBuffer(audio)) {
    response.status(400).json({ error: "รูปแบบไฟล์เสียงไม่รองรับ" });
    return;
  }
  if (audio.length < MIN_AUDIO_BYTES) {
    response.json({ text: "" });
    return;
  }

  const mediaType = `audio/${extension === "mp3" ? "mpeg" : extension}`;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mediaType }), `speech.${extension}`);
  form.append("model", ai.transcribeModel);
  // โมเดลรุ่นใหม่รับคำใบ้ภาษาเป็นรายการ ส่วนรุ่นเดิมรับภาษาเดียว และห้ามส่งทั้งสองแบบพร้อมกัน
  if (ai.transcribeModel.startsWith("gpt-transcribe")) form.append("languages[]", SPEECH_LANGUAGE);
  else form.append("language", SPEECH_LANGUAGE);

  let upstream: Response;
  try {
    upstream = await fetch(`${ai.baseUrl}/audio/transcriptions`, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${ai.apiKey}` },
      body: form
    });
  } catch (error) {
    console.error("Transcribe upstream error", error instanceof Error ? error.message : "unknown");
    response.status(502).json({ error: "เชื่อมต่อบริการแปลงเสียงไม่สำเร็จ กรุณาลองใหม่" });
    return;
  }

  if (!upstream.ok) {
    const codes = await readRejectedResponse(upstream);
    const failure = describeUpstreamFailure("transcribe", upstream.status, codes);
    console.error("Transcribe upstream failed", upstream.status, failure.reason, codes.join(","));
    aiAccount.reportFailure("transcribe", failure.reason);
    response.status(failure.status).json({ error: failure.message });
    return;
  }

  try {
    const payload = (await upstream.json()) as { text?: unknown };
    aiAccount.reportSuccess("transcribe");
    response.json({ text: typeof payload.text === "string" ? payload.text.trim() : "" });
  } catch {
    response.status(502).json({ error: "แปลงเสียงเป็นข้อความไม่สำเร็จ กรุณาลองใหม่" });
  }
};
