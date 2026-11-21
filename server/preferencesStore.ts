import { describeDbError, getDatabase, type Database } from "./db.js";
import { ANONYMOUS_USER, type StorageKind } from "./userStore.js";

export const MAX_SYNCED_CONTACTS = 50;
export const MAX_SYNCED_CUSTOM_APPS = 20;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_APP_EXT = /\.(exe|lnk|bat|cmd|app|sh)$/i;
const WINDOWS_ABS_PATH = /^[A-Za-z]:\\/;
const POSIX_ABS_PATH = /^\//;
const UNSAFE_PATH_CHARS = /[;&|<>`$]/;

export interface SyncedVoiceContact {
  id: string;
  name: string;
  aliases: string[];
  phone?: string;
  email?: string;
  createdAt: number;
}

export interface SyncedCustomDesktopApp {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export interface WorkspacePreferences {
  contacts: SyncedVoiceContact[];
  customApps: SyncedCustomDesktopApp[];
  updatedAt: number;
}

export interface PreferencesStore {
  readonly kind: StorageKind;
  getPreferences(user: string): Promise<WorkspacePreferences>;
  putPreferences(user: string, input: { contacts?: unknown; customApps?: unknown }): Promise<WorkspacePreferences>;
}

function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeContacts(value: unknown): SyncedVoiceContact[] {
  if (!Array.isArray(value)) return [];
  const contacts: SyncedVoiceContact[] = [];
  const seenIds = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const id = cleanLine(item.id, 64);
    const name = cleanLine(item.name, 60);
    if (!id || !name || seenIds.has(id)) continue;

    const rawPhone = typeof item.phone === "string" ? item.phone.replace(/[\s()-]/g, "").trim() : "";
    const phone = /^\+?\d{3,15}$/.test(rawPhone) ? rawPhone : undefined;
    const rawEmail = cleanLine(item.email, 120);
    const email = EMAIL_PATTERN.test(rawEmail) ? rawEmail : undefined;
    if (!phone && !email) continue;

    const aliases = Array.isArray(item.aliases)
      ? item.aliases.map((a) => cleanLine(a, 40)).filter(Boolean).slice(0, 6)
      : [];

    seenIds.add(id);
    contacts.push({
      id,
      name,
      aliases,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
    });
    if (contacts.length >= MAX_SYNCED_CONTACTS) break;
  }

  return contacts;
}

export function sanitizeCustomApps(value: unknown): SyncedCustomDesktopApp[] {
  if (!Array.isArray(value)) return [];
  const apps: SyncedCustomDesktopApp[] = [];
  const seenIds = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const id = cleanLine(item.id, 64);
    const name = cleanLine(item.name, 60);
    const appPath = typeof item.path === "string" ? item.path.trim().slice(0, 400) : "";
    if (
      !id ||
      !name ||
      seenIds.has(id) ||
      !appPath ||
      UNSAFE_PATH_CHARS.test(appPath) ||
      (!WINDOWS_ABS_PATH.test(appPath) && !POSIX_ABS_PATH.test(appPath)) ||
      !SAFE_APP_EXT.test(appPath)
    ) {
      continue;
    }

    seenIds.add(id);
    apps.push({
      id,
      name,
      path: appPath,
      createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
    });
    if (apps.length >= MAX_SYNCED_CUSTOM_APPS) break;
  }

  return apps;
}

export function createMemoryPreferencesStore(now: () => number = Date.now): PreferencesStore {
  const byUser = new Map<string, WorkspacePreferences>();

  return {
    kind: "memory",

    async getPreferences(user) {
      return byUser.get(user || ANONYMOUS_USER) ?? { contacts: [], customApps: [], updatedAt: 0 };
    },

    async putPreferences(user, input) {
      const key = user || ANONYMOUS_USER;
      const existing = await this.getPreferences(key);
      const next: WorkspacePreferences = {
        contacts: input.contacts !== undefined ? sanitizeContacts(input.contacts) : existing.contacts,
        customApps: input.customApps !== undefined ? sanitizeCustomApps(input.customApps) : existing.customApps,
        updatedAt: now()
      };
      byUser.set(key, next);
      return next;
    }
  };
}

export function createPostgresPreferencesStore(db: Database, now: () => number = Date.now): PreferencesStore {
  const fallback = createMemoryPreferencesStore(now);
  let readyPromise: Promise<void> | null = null;

  const ensureTable = (): Promise<void> => {
    readyPromise ??= db
      .query(
        `CREATE TABLE IF NOT EXISTS user_preferences (
          user_key TEXT PRIMARY KEY,
          contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
          custom_apps JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at BIGINT NOT NULL DEFAULT 0
        )`
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        readyPromise = null;
        throw error;
      });
    return readyPromise;
  };

  return {
    kind: "postgres",

    async getPreferences(user) {
      const key = user || ANONYMOUS_USER;
      try {
        await ensureTable();
        const rows = await db.query(
          `SELECT contacts, custom_apps, updated_at
           FROM user_preferences
           WHERE user_key = $1
           LIMIT 1`,
          [key]
        );
        const row = rows[0];
        if (!row) return { contacts: [], customApps: [], updatedAt: 0 };
        return {
          contacts: sanitizeContacts(row.contacts),
          customApps: sanitizeCustomApps(row.custom_apps),
          updatedAt: Number(row.updated_at) || 0
        };
      } catch (error) {
        console.warn("อ่าน user_preferences จากฐานข้อมูลไม่สำเร็จ ใช้หน่วยความจำแทน", describeDbError(error));
        return fallback.getPreferences(key);
      }
    },

    async putPreferences(user, input) {
      const key = user || ANONYMOUS_USER;
      try {
        await ensureTable();
        const existing = await this.getPreferences(key);
        const next: WorkspacePreferences = {
          contacts: input.contacts !== undefined ? sanitizeContacts(input.contacts) : existing.contacts,
          customApps: input.customApps !== undefined ? sanitizeCustomApps(input.customApps) : existing.customApps,
          updatedAt: now()
        };
        await db.query(
          `INSERT INTO user_preferences (user_key, contacts, custom_apps, updated_at)
           VALUES ($1, $2::jsonb, $3::jsonb, $4)
           ON CONFLICT (user_key) DO UPDATE
           SET contacts = EXCLUDED.contacts,
               custom_apps = EXCLUDED.custom_apps,
               updated_at = EXCLUDED.updated_at`,
          [key, JSON.stringify(next.contacts), JSON.stringify(next.customApps), next.updatedAt]
        );
        return next;
      } catch (error) {
        console.warn("บันทึก user_preferences ลงฐานข้อมูลไม่สำเร็จ ใช้หน่วยความจำแทน", describeDbError(error));
        return fallback.putPreferences(key, input);
      }
    }
  };
}

let cachedPreferencesStore: PreferencesStore | null = null;

export function getPreferencesStore(): PreferencesStore {
  if (cachedPreferencesStore) return cachedPreferencesStore;
  const db = getDatabase();
  cachedPreferencesStore = db ? createPostgresPreferencesStore(db) : createMemoryPreferencesStore();
  return cachedPreferencesStore;
}

export function resetPreferencesStoreForTests(store: PreferencesStore | null = null): void {
  cachedPreferencesStore = store;
}
