import { API_BASE } from "./http";
import { sessionStore } from "./sessionStore";

export interface CustomVoiceRecord {
  id: string;
  displayName: string;
  createTime?: string;
}

export interface CustomVoicesResponse {
  ok: boolean;
  available: boolean;
  voices: CustomVoiceRecord[];
  consentPhrase: string;
}

export async function fetchCustomVoices(): Promise<CustomVoicesResponse> {
  const response = await fetch(`${API_BASE}/api/voices`, {
    method: "GET",
    headers: { ...sessionStore.authHeaders() }
  });
  if (response.status === 401) {
    sessionStore.clear();
    throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  }
  const payload = (await response.json().catch(() => null)) as CustomVoicesResponse | null;
  if (!response.ok || !payload) {
    throw new Error("ดึงรายการเสียงที่บันทึกไว้ไม่สำเร็จ");
  }
  return payload;
}

export async function createReplicatedVoice(input: {
  displayName: string;
  sourceAudioBase64: string;
  consentAudioBase64: string;
}): Promise<CustomVoiceRecord> {
  const response = await fetch(`${API_BASE}/api/voices/replicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
    body: JSON.stringify({
      displayName: input.displayName,
      sourceAudioBase64: input.sourceAudioBase64,
      consentAudioBase64: input.consentAudioBase64,
      mimeType: "audio/wav"
    })
  });
  if (response.status === 401) {
    sessionStore.clear();
    throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  }
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; voice?: CustomVoiceRecord; error?: string } | null;
  if (!response.ok || !payload?.ok || !payload.voice) {
    throw new Error(payload?.error || "บันทึกและสร้างโมเดลเสียงจำลองไม่สำเร็จ");
  }
  return payload.voice;
}

export async function deleteCustomVoice(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/voices/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...sessionStore.authHeaders() }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "ลบเสียงจำลองไม่สำเร็จ");
  }
}
