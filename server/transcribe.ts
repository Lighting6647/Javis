import type { RequestHandler } from "express";
import { config } from "./config.js";

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

  if (!config.apiKey) {
    response.status(500).json({ error: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY บนเซิร์ฟเวอร์" });
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
  form.append("model", config.transcribeModel);
  // โมเดลรุ่นใหม่รับคำใบ้ภาษาเป็นรายการ ส่วนรุ่นเดิมรับภาษาเดียว และห้ามส่งทั้งสองแบบพร้อมกัน
  if (config.transcribeModel.startsWith("gpt-transcribe")) form.append("languages[]", SPEECH_LANGUAGE);
  else form.append("language", SPEECH_LANGUAGE);

  let upstream: Response;
  try {
    upstream = await fetch(`${config.openaiBaseUrl}/audio/transcriptions`, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form
    });
  } catch (error) {
    console.error("Transcribe upstream error", error instanceof Error ? error.message : "unknown");
    response.status(502).json({ error: "เชื่อมต่อบริการแปลงเสียงไม่สำเร็จ กรุณาลองใหม่" });
    return;
  }

  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    console.error("Transcribe upstream failed", upstream.status);
    const busy = upstream.status === 429;
    response.status(busy ? 503 : 502).json({
      error: busy ? "บริการแปลงเสียงมีผู้ใช้งานหนาแน่น กรุณาลองใหม่ในอีกสักครู่" : "แปลงเสียงเป็นข้อความไม่สำเร็จ กรุณาลองใหม่"
    });
    return;
  }

  try {
    const payload = (await upstream.json()) as { text?: unknown };
    response.json({ text: typeof payload.text === "string" ? payload.text.trim() : "" });
  } catch {
    response.status(502).json({ error: "แปลงเสียงเป็นข้อความไม่สำเร็จ กรุณาลองใหม่" });
  }
};
