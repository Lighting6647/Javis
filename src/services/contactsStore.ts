/**
 * สมุดรายชื่อสำหรับสั่งงานด้วยเสียง (Voice Contacts)
 * เก็บใน localStorage คีย์ javis.contacts (สูงสุด 50 รายชื่อ)
 * รองรับการเรียกด้วยชื่อหลักหรือชื่อเล่น เช่น "โทรหาแม่", "ส่งเมลหาทีม"
 */
export const CONTACTS_STORAGE_KEY = "javis.contacts";
export const MAX_CONTACTS = 50;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface VoiceContact {
  id: string;
  name: string;
  aliases: string[];
  phone?: string;
  email?: string;
  createdAt: number;
}

function cleanPhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[\s()-]/g, "").trim();
  if (!/^\+?\d{3,15}$/.test(digits)) return undefined;
  return digits;
}

function cleanEmail(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().slice(0, 120);
  return EMAIL_PATTERN.test(trimmed) ? trimmed : undefined;
}

function cleanAliases(raw: string[] | string | undefined): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const item of list) {
    const clean = item.trim().slice(0, 40);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(clean);
    if (aliases.length >= 6) break;
  }
  return aliases;
}

function readStored(): VoiceContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONTACTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is VoiceContact => {
        if (typeof item !== "object" || item === null) return false;
        const candidate = item as Record<string, unknown>;
        return typeof candidate.id === "string" && typeof candidate.name === "string" && candidate.name.trim().length > 0;
      })
      .slice(0, MAX_CONTACTS);
  } catch {
    return [];
  }
}

function writeStored(items: VoiceContact[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_CONTACTS)));
  } catch {
    // หน่วยความจำเบราว์เซอร์เต็มหรือไม่พร้อมใช้งาน
  }
}

const listeners = new Set<() => void>();
let snapshot: VoiceContact[] = readStored();

function emit(next: VoiceContact[]): void {
  snapshot = next;
  writeStored(next);
  listeners.forEach((listener) => listener());
}

export function resolveContactFromList(query: string, contacts: readonly VoiceContact[]): VoiceContact | null {
  const target = query.trim().toLowerCase();
  if (!target) return null;

  return (
    contacts.find((c) => c.name.trim().toLowerCase() === target) ??
    contacts.find((c) => c.aliases.some((alias) => alias.trim().toLowerCase() === target)) ??
    contacts.find(
      (c) =>
        c.name.trim().toLowerCase().includes(target) ||
        c.aliases.some((alias) => alias.trim().toLowerCase().includes(target))
    ) ??
    null
  );
}

export const contactsStore = {
  get(): VoiceContact[] {
    return snapshot;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  add(input: {
    name: string;
    aliases?: string[] | string;
    phone?: string;
    email?: string;
  }): { ok: true; contact: VoiceContact } | { ok: false; error: string } {
    const name = input.name.trim().slice(0, 60);
    if (!name) return { ok: false, error: "กรุณาระบุชื่อรายชื่อติดต่อค่ะ" };

    const phone = input.phone?.trim() ? cleanPhone(input.phone) : undefined;
    if (input.phone?.trim() && !phone) {
      return { ok: false, error: "รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (3–15 หลัก) ค่ะ" };
    }
    const email = input.email?.trim() ? cleanEmail(input.email) : undefined;
    if (input.email?.trim() && !email) {
      return { ok: false, error: "รูปแบบอีเมลไม่ถูกต้องค่ะ" };
    }
    if (!phone && !email) {
      return { ok: false, error: "กรุณาใส่เบอร์โทรศัพท์หรืออีเมลอย่างน้อย 1 ช่องค่ะ" };
    }
    if (snapshot.length >= MAX_CONTACTS) {
      return { ok: false, error: `เพิ่มรายชื่อได้สูงสุด ${MAX_CONTACTS} รายการค่ะ` };
    }

    const contact: VoiceContact = {
      id: `contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      aliases: cleanAliases(input.aliases),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      createdAt: Date.now()
    };
    emit([contact, ...snapshot]);
    return { ok: true, contact };
  },

  remove(id: string): void {
    const next = snapshot.filter((item) => item.id !== id);
    if (next.length !== snapshot.length) emit(next);
  },

  resolve(query: string): VoiceContact | null {
    return resolveContactFromList(query, snapshot);
  },

  mergeFromServer(remote: readonly VoiceContact[]): boolean {
    const byId = new Map<string, VoiceContact>();
    for (const item of snapshot) byId.set(item.id, item);
    let changed = false;
    for (const item of remote) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
        changed = true;
      }
    }
    if (changed) {
      emit([...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_CONTACTS));
    }
    return changed;
  },

  resetForTests(): void {
    snapshot = [];
    writeStored([]);
  }
};
