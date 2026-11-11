import {
  DEFAULT_VOICE_SETTINGS,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  type VoiceSettings
} from "../speech/types";

const STORAGE_KEY = "javis.voiceSettings";

/** แปลงค่าที่อ่านจากเครื่อง (ซึ่งอาจเสียหายหรือมาจากรุ่นเก่า) ให้เป็นการตั้งค่าที่ใช้ได้เสมอ */
export function sanitizeVoiceSettings(value: unknown): VoiceSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_VOICE_SETTINGS;

  const { voiceId, rate } = value as Record<string, unknown>;
  const validRate = typeof rate === "number" && Number.isFinite(rate);
  return {
    voiceId: typeof voiceId === "string" && voiceId ? voiceId : null,
    rate: validRate
      ? Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, Math.round(rate * 10) / 10))
      : DEFAULT_VOICE_SETTINGS.rate
  };
}

function load(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeVoiceSettings(JSON.parse(raw)) : DEFAULT_VOICE_SETTINGS;
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
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
