import type { Transcribe } from "../speech/recorderRecognizer";
import { SpeechError } from "../speech/types";
import { aiStatusStore } from "./aiStatusStore";
import { fetchWithTimeout } from "./http";
import { sessionStore } from "./sessionStore";

const TRANSCRIBE_TIMEOUT_MS = 30_000;

/** ส่งเสียงที่อัดไปให้เซิร์ฟเวอร์ Javis แปลงเป็นข้อความ (ใช้ในแอปเดสก์ท็อป) */
export const transcribeAudio: Transcribe = async (audio, signal) => {
  let response: Response;
  try {
    response = await fetchWithTimeout("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm", ...sessionStore.authHeaders() },
      body: audio,
      signal,
      timeoutMs: TRANSCRIBE_TIMEOUT_MS
    });
  } catch {
    throw new SpeechError(signal.aborted ? "aborted" : "network");
  }

  if (response.status === 401) {
    // โทเค็นหมดอายุหรือถูกเพิกถอน: ล้างทิ้งเพื่อให้หน้าเข้าสู่ระบบกลับมา
    sessionStore.clear();
    throw new SpeechError("network");
  }
  if (!response.ok) {
    // อาจเป็นปัญหาของบัญชี AI: ให้แถบแจ้งเตือนอัปเดตทันที
    aiStatusStore.noteRequest(false);
    throw new SpeechError("network");
  }

  try {
    const payload = (await response.json()) as { text?: unknown };
    aiStatusStore.noteRequest(true);
    return typeof payload.text === "string" ? payload.text : "";
  } catch {
    throw new SpeechError("network");
  }
};
