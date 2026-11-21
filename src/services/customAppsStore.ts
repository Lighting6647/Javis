/**
 * คลังรายการโปรแกรมเฉพาะทางในเครื่องที่ผู้ใช้เพิ่มเอง (Custom Desktop App Paths)
 * เก็บใน localStorage คีย์ javis.customApps (สูงสุด 20 รายการ) พร้อมตรวจความปลอดภัยของพาธ
 */
export const CUSTOM_APPS_STORAGE_KEY = "javis.customApps";
export const MAX_CUSTOM_APPS = 20;

const SAFE_EXT_PATTERN = /\.(exe|lnk|bat|cmd|app|sh)$/i;
const WINDOWS_ABS_PATH = /^[A-Za-z]:\\/;
const POSIX_ABS_PATH = /^\//;
const UNSAFE_CHARS = /[;&|<>`$]/;

export interface CustomDesktopApp {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export function validateCustomAppPath(rawPath: string): { ok: true; path: string } | { ok: false; error: string } {
  const trimmed = rawPath.trim().replace(/^"(.*)"$/, "$1");
  if (!trimmed) return { ok: false, error: "กรุณาระบุพาธไฟล์โปรแกรมค่ะ" };
  if (UNSAFE_CHARS.test(trimmed)) return { ok: false, error: "พาธมีอักขระต้องห้ามเพื่อความปลอดภัยค่ะ" };
  if (!WINDOWS_ABS_PATH.test(trimmed) && !POSIX_ABS_PATH.test(trimmed)) {
    return { ok: false, error: "กรุณาใส่พาธเต็ม เช่น C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe ค่ะ" };
  }
  if (!SAFE_EXT_PATTERN.test(trimmed)) {
    return { ok: false, error: "รองรับเฉพาะไฟล์ .exe, .lnk, .bat, .cmd, .app หรือ .sh เท่านั้นค่ะ" };
  }
  return { ok: true, path: trimmed };
}

function readStored(): CustomDesktopApp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_APPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is CustomDesktopApp => {
        if (typeof item !== "object" || item === null) return false;
        const candidate = item as Record<string, unknown>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.name === "string" &&
          typeof candidate.path === "string" &&
          validateCustomAppPath(candidate.path).ok
        );
      })
      .slice(0, MAX_CUSTOM_APPS);
  } catch {
    return [];
  }
}

function writeStored(items: CustomDesktopApp[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_APPS_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_CUSTOM_APPS)));
  } catch {
    // หน่วยความจำเบราว์เซอร์เต็มหรือไม่พร้อมใช้งาน
  }
}

const listeners = new Set<() => void>();
let snapshot: CustomDesktopApp[] = readStored();

function emit(next: CustomDesktopApp[]): void {
  snapshot = next;
  writeStored(next);
  listeners.forEach((listener) => listener());
}

export const customAppsStore = {
  get(): CustomDesktopApp[] {
    return snapshot;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  add(input: { name: string; path: string }): { ok: true; app: CustomDesktopApp } | { ok: false; error: string } {
    const name = input.name.trim().slice(0, 60);
    if (!name) return { ok: false, error: "กรุณาตั้งชื่อโปรแกรมค่ะ" };
    const validated = validateCustomAppPath(input.path);
    if (!validated.ok) return validated;
    if (snapshot.length >= MAX_CUSTOM_APPS) {
      return { ok: false, error: `เพิ่มได้สูงสุด ${MAX_CUSTOM_APPS} โปรแกรมค่ะ` };
    }

    const app: CustomDesktopApp = {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      path: validated.path,
      createdAt: Date.now()
    };
    emit([app, ...snapshot]);
    return { ok: true, app };
  },

  remove(id: string): void {
    const next = snapshot.filter((item) => item.id !== id);
    if (next.length !== snapshot.length) emit(next);
  },

  find(idOrName: string): CustomDesktopApp | null {
    const normalized = idOrName.trim().toLowerCase();
    if (!normalized) return null;
    return (
      snapshot.find((item) => item.id.toLowerCase() === normalized) ??
      snapshot.find((item) => item.name.toLowerCase() === normalized) ??
      null
    );
  },

  mergeFromServer(remote: readonly CustomDesktopApp[]): boolean {
    const byId = new Map<string, CustomDesktopApp>();
    for (const item of snapshot) byId.set(item.id, item);
    let changed = false;
    for (const item of remote) {
      if (!byId.has(item.id) && validateCustomAppPath(item.path).ok) {
        byId.set(item.id, item);
        changed = true;
      }
    }
    if (changed) {
      emit([...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_CUSTOM_APPS));
    }
    return changed;
  },

  resetForTests(): void {
    snapshot = [];
    writeStored([]);
  }
};
