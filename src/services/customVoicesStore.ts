import type { CustomVoiceRecord } from "./customVoicesApi";

const STORAGE_KEY = "javis.customVoices";

function load(): CustomVoiceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomVoiceRecord =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as CustomVoiceRecord).id === "string" &&
        typeof (item as CustomVoiceRecord).displayName === "string"
    );
  } catch {
    return [];
  }
}

let current: CustomVoiceRecord[] = load();
const listeners = new Set<() => void>();

function save(next: CustomVoiceRecord[]): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ข้ามหาก storage เต็ม
  }
  listeners.forEach((listener) => listener());
}

export const customVoicesStore = {
  get: (): CustomVoiceRecord[] => current,
  replaceAll: (voices: CustomVoiceRecord[]): void => {
    save(voices);
  },
  add: (voice: CustomVoiceRecord): void => {
    const filtered = current.filter((item) => item.id !== voice.id);
    save([voice, ...filtered]);
  },
  remove: (id: string): void => {
    save(current.filter((item) => item.id !== id));
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
