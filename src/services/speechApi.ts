import { CloudVoiceError, type CloudVoiceFailure } from "../speech/cloudVoice";
import { cloudVoiceStore } from "./aiStatusStore";
import { fetchWithTimeout } from "./http";
import { sessionStore } from "./sessionStore";

const SPEECH_TIMEOUT_MS = 25_000;

function readRetryAfterMs(response: Response, payload: unknown): number | undefined {
  if (typeof payload === "object" && payload !== null) {
    const seconds = (payload as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
      return Math.round(seconds * 1000);
    }
  }
  const header = response.headers.get("Retry-After");
  if (header) {
    const parsed = Number(header);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 1000);
  }
  return undefined;
}

function readFailureCode(response: Response, payload: unknown): CloudVoiceFailure {
  if (typeof payload === "object" && payload !== null) {
    const code = (payload as { code?: unknown }).code;
    if (code === "unavailable" || code === "quota" || code === "rate" || code === "rejected" || code === "failed") {
      return code;
    }
  }
  if (response.status === 404) return "unavailable";
  if (response.status === 429) return "rate";
  return "failed";
}

/** ขอไฟล์เสียงพูดของ Gemini จากเซิร์ฟเวอร์ Javis (/api/speech) */
export async function fetchCloudSpeech(text: string, voice: string | null, signal: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetchWithTimeout("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
      body: JSON.stringify(voice ? { text, voice } : { text }),
      signal,
      timeoutMs: SPEECH_TIMEOUT_MS
    });
  } catch {
    throw new CloudVoiceError("failed");
  }

  if (response.status === 401) {
    sessionStore.clear();
    throw new CloudVoiceError("failed");
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const kind = readFailureCode(response, payload);
    if (kind === "unavailable") cloudVoiceStore.set(false);
    const retryAfterMs = kind === "quota" || kind === "rate" ? readRetryAfterMs(response, payload) : undefined;
    throw new CloudVoiceError(kind, retryAfterMs);
  }

  const blob = await response.blob();
  if (blob.size === 0) throw new CloudVoiceError("failed");
  return blob;
}
