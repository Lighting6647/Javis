import { isVoicePersonaId } from "../speech/cloudVoices";
import {
  DEFAULT_VOICE_SETTINGS,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  type VoiceSettings
} from "../speech/types";

const STORAGE_KEY = "javis.voiceSettings";
const STORAGE_VERSION = 3;

/** แปลงค่าที่อ่านจากเครื่อง (ซึ่งอาจเสียหายหรือมาจากรุ่นเก่า) ให้เป็นการตั้งค่าที่ใช้ได้เสมอ */
export function sanitizeVoiceSettings(value: unknown): VoiceSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_VOICE_SETTINGS;

  const { voiceId, rate, cloud, cloudVoice, persona } = value as Record<string, unknown>;
  const validRate = typeof rate === "number" && Number.isFinite(rate);
  const cleanCloudVoice = typeof cloudVoice === "string" ? cloudVoice.trim() : "";
  return {
    voiceId: typeof voiceId === "string" && voiceId ? voiceId : null,
    rate: validRate
      ? Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, Math.round(rate * 10) / 10))
      : DEFAULT_VOICE_SETTINGS.rate,
    cloud: typeof cloud === "boolean" ? cloud : DEFAULT_VOICE_SETTINGS.cloud,
    cloudVoice: cleanCloudVoice ? cleanCloudVoice : DEFAULT_VOICE_SETTINGS.cloudVoice,
    persona: typeof persona === "string" && isVoicePersonaId(persona) ? persona : DEFAULT_VOICE_SETTINGS.persona
  };
}

function load(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    const sanitized = sanitizeVoiceSettings(parsed);
    // อัปเกรดค่าเริ่มต้นรุ่นเก่าที่เป็นเสียงผู้ช่วยชายหรือยังไม่ได้ระบุเสียงหลัก ให้ใช้เสียงหญิงหลักของเดลลูน่า (Leda)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { version?: unknown }).version !== STORAGE_VERSION &&
      ((sanitized.persona === "assistant" && (!sanitized.cloudVoice || sanitized.cloudVoice === "Iapetus" || sanitized.cloudVoice === "Kore")) ||
        !sanitized.cloudVoice)
    ) {
      const migrated: VoiceSettings = {
        ...sanitized,
        persona: sanitized.persona === "assistant" ? "genz-girl" : sanitized.persona,
        cloudVoice: sanitized.cloudVoice ?? DEFAULT_VOICE_SETTINGS.cloudVoice
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...migrated, version: STORAGE_VERSION }));
      return migrated;
    }
    return sanitized;
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

let current = load();
const listeners = new Set<() => void>();

/** การตั้งค่าเสียงของผู้ใช้ เก็บไว้ในเครื่องเพื่อใช้ต่อในครั้งถัดไป */
export const voiceSettingsStore = {
  get: (): VoiceSettings => current,
  update: (patch: Partial<VoiceSettings>): void => {
    current = sanitizeVoiceSettings({ ...current, ...patch });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, version: STORAGE_VERSION }));
    } catch {
      // เก็บลงเครื่องไม่ได้: การตั้งค่ายังมีผลจนกว่าจะปิดหน้า
    }
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
