import { randomUUID } from "node:crypto";
import { describeDbError, getDatabase, type Database } from "./db.js";
import { isSensitiveMemory } from "./responseStream.js";
import { ANONYMOUS_USER, type StorageKind } from "./userStore.js";

export const MAX_STORED_NOTES = 100;
export const MAX_NOTE_TITLE = 120;
export const MAX_NOTE_CONTENT = 2000;
export const MAX_NOTE_TAGS = 6;
const NOTE_ID_PATTERN = /^note-[A-Za-z0-9_-]{4,48}$/;

export interface StoredNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned?: boolean;
  googleTaskId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateNoteInput {
  title?: string;
  content: string;
  tags?: string[];
  pinned?: boolean;
  googleTaskId?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  tags?: string[];
  pinned?: boolean;
}

export interface NotesStore {
  readonly kind: StorageKind;
  listNotes(user: string): Promise<StoredNote[]>;
  addNote(user: string, input: CreateNoteInput): Promise<{ note: StoredNote | null; rejected: boolean }>;
  updateNote(user: string, id: string, input: UpdateNoteInput): Promise<{ note: StoredNote | null; rejected: boolean }>;
  deleteNote(user: string, id: string): Promise<boolean>;
  searchNotes(user: string, query: string): Promise<StoredNote[]>;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    const clean = cleanText(item, 32).replace(/\s+/g, "-").toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    tags.push(clean);
    if (tags.length >= MAX_NOTE_TAGS) break;
  }
  return tags;
}

function buildNote(input: CreateNoteInput, now: () => number): { note: StoredNote | null; rejected: boolean } {
  const content = cleanText(input.content, MAX_NOTE_CONTENT);
  const title = cleanText(input.title, MAX_NOTE_TITLE) || content.split(/\r?\n/)[0]?.slice(0, 60) || "บันทึกใหม่";
  if (!content) return { note: null, rejected: false };
  if (isSensitiveMemory(`${title} ${content}`)) return { note: null, rejected: true };

  const timestamp = now();
  const id = `note-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const note: StoredNote = {
    id,
    title,
    content,
    tags: cleanTags(input.tags),
    pinned: input.pinned === true,
    ...(input.googleTaskId ? { googleTaskId: cleanText(input.googleTaskId, 120) } : {}),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return { note, rejected: false };
}

function sortNotes(notes: StoredNote[]): StoredNote[] {
  return [...notes].sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    return pinDiff !== 0 ? pinDiff : b.updatedAt - a.updatedAt;
  });
}

function filterNotesByQuery(notes: StoredNote[], query: string): StoredNote[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return notes.slice(0, 10);
  const terms = normalized.split(/\s+/).filter(Boolean);
  return notes
    .filter((note) => {
      const haystack = `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 10);
}

export function createMemoryNotesStore(now: () => number = Date.now): NotesStore {
  const byUser = new Map<string, StoredNote[]>();

  return {
    kind: "memory",

    async listNotes(user) {
      return sortNotes(byUser.get(user || ANONYMOUS_USER) ?? []);
    },

    async addNote(user, input) {
      const built = buildNote(input, now);
      if (!built.note) return built;
      const key = user || ANONYMOUS_USER;
      const next = sortNotes([built.note, ...(byUser.get(key) ?? [])]).slice(0, MAX_STORED_NOTES);
      byUser.set(key, next);
      return built;
    },

    async updateNote(user, id, input) {
      if (!NOTE_ID_PATTERN.test(id)) return { note: null, rejected: false };
      const key = user || ANONYMOUS_USER;
      const current = byUser.get(key) ?? [];
      const existing = current.find((note) => note.id === id);
      if (!existing) return { note: null, rejected: false };

      const nextTitle = input.title !== undefined ? cleanText(input.title, MAX_NOTE_TITLE) || existing.title : existing.title;
      const nextContent = input.content !== undefined ? cleanText(input.content, MAX_NOTE_CONTENT) : existing.content;
      if (!nextContent) return { note: null, rejected: false };
      if (isSensitiveMemory(`${nextTitle} ${nextContent}`)) return { note: null, rejected: true };

      const updated: StoredNote = {
        ...existing,
        title: nextTitle,
        content: nextContent,
        tags: input.tags !== undefined ? cleanTags(input.tags) : existing.tags,
        pinned: input.pinned !== undefined ? input.pinned : Boolean(existing.pinned),
        updatedAt: now()
      };
      byUser.set(
        key,
        sortNotes(current.map((note) => (note.id === id ? updated : note)))
      );
      return { note: updated, rejected: false };
    },

    async deleteNote(user, id) {
      if (!NOTE_ID_PATTERN.test(id)) return false;
      const key = user || ANONYMOUS_USER;
      const current = byUser.get(key) ?? [];
      const next = current.filter((note) => note.id !== id);
      if (next.length === current.length) return false;
      byUser.set(key, next);
      return true;
    },

    async searchNotes(user, query) {
      const current = byUser.get(user || ANONYMOUS_USER) ?? [];
      return filterNotesByQuery(current, query);
    }
  };
}

export function createPostgresNotesStore(db: Database, now: () => number = Date.now): NotesStore {
  const fallback = createMemoryNotesStore(now);
  let readyPromise: Promise<void> | null = null;

  const ensureTable = (): Promise<void> => {
    readyPromise ??= (async () => {
      await db.query(
        `CREATE TABLE IF NOT EXISTS user_notes (
          user_key TEXT NOT NULL,
          id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          pinned BOOLEAN NOT NULL DEFAULT false,
          google_task_id TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_key, id)
        )`
      );
      await db.query(`ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false`);
    })().catch((error: unknown) => {
      readyPromise = null;
      throw error;
    });
    return readyPromise;
  };

  return {
    kind: "postgres",

    async listNotes(user) {
      const key = user || ANONYMOUS_USER;
      try {
        await ensureTable();
        const rows = await db.query(
          `SELECT id, title, content, tags, pinned, google_task_id, created_at, updated_at
           FROM user_notes
           WHERE user_key = $1
           ORDER BY pinned DESC, updated_at DESC
           LIMIT $2`,
          [key, MAX_STORED_NOTES]
        );
        return rows.map((row) => ({
          id: String(row.id),
          title: String(row.title),
          content: String(row.content),
          tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
          pinned: row.pinned === true,
          ...(row.google_task_id ? { googleTaskId: String(row.google_task_id) } : {}),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at)
        }));
      } catch (error) {
        console.warn("อ่าน user_notes จากฐานข้อมูลไม่สำเร็จ ใช้หน่วยความจำแทน", describeDbError(error));
        return fallback.listNotes(key);
      }
    },

    async addNote(user, input) {
      const key = user || ANONYMOUS_USER;
      const built = buildNote(input, now);
      if (!built.note) return built;
      try {
        await ensureTable();
        const note = built.note;
        await db.query(
          `INSERT INTO user_notes (user_key, id, title, content, tags, pinned, google_task_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
          [
            key,
            note.id,
            note.title,
            note.content,
            JSON.stringify(note.tags),
            Boolean(note.pinned),
            note.googleTaskId ?? null,
            note.createdAt,
            note.updatedAt
          ]
        );
        return built;
      } catch (error) {
        console.warn("บันทึก user_notes ลงฐานข้อมูลไม่สำเร็จ ใช้หน่วยความจำแทน", describeDbError(error));
        return fallback.addNote(key, input);
      }
    },

    async updateNote(user, id, input) {
      if (!NOTE_ID_PATTERN.test(id)) return { note: null, rejected: false };
      const key = user || ANONYMOUS_USER;
      try {
        await ensureTable();
        const existingRows = await db.query(
          `SELECT id, title, content, tags, pinned, google_task_id, created_at, updated_at
           FROM user_notes
           WHERE user_key = $1 AND id = $2
           LIMIT 1`,
          [key, id]
        );
        const existing = existingRows[0];
        if (!existing) return { note: null, rejected: false };

        const nextTitle =
          input.title !== undefined ? cleanText(input.title, MAX_NOTE_TITLE) || String(existing.title) : String(existing.title);
        const nextContent = input.content !== undefined ? cleanText(input.content, MAX_NOTE_CONTENT) : String(existing.content);
        if (!nextContent) return { note: null, rejected: false };
        if (isSensitiveMemory(`${nextTitle} ${nextContent}`)) return { note: null, rejected: true };

        const nextTags =
          input.tags !== undefined ? cleanTags(input.tags) : Array.isArray(existing.tags) ? existing.tags.map(String) : [];
        const nextPinned = input.pinned !== undefined ? input.pinned : existing.pinned === true;
        const updatedAt = now();

        await db.query(
          `UPDATE user_notes
           SET title = $3, content = $4, tags = $5::jsonb, pinned = $6, updated_at = $7
           WHERE user_key = $1 AND id = $2`,
          [key, id, nextTitle, nextContent, JSON.stringify(nextTags), nextPinned, updatedAt]
        );

        return {
          note: {
            id,
            title: nextTitle,
            content: nextContent,
            tags: nextTags,
            pinned: nextPinned,
            ...(existing.google_task_id ? { googleTaskId: String(existing.google_task_id) } : {}),
            createdAt: Number(existing.created_at),
            updatedAt
          },
          rejected: false
        };
      } catch (error) {
        console.warn("แก้ไข user_notes ในฐานข้อมูลไม่สำเร็จ ใช้หน่วยความจำแทน", describeDbError(error));
        return fallback.updateNote(key, id, input);
      }
    },

    async deleteNote(user, id) {
      if (!NOTE_ID_PATTERN.test(id)) return false;
      const key = user || ANONYMOUS_USER;
      try {
        await ensureTable();
        const rows = await db.query(
          `DELETE FROM user_notes
           WHERE user_key = $1 AND id = $2
           RETURNING id`,
          [key, id]
        );
        return rows.length > 0;
      } catch (error) {
        console.warn("ลบ user_notes ในฐานข้อมูลไม่สำเร็จ", describeDbError(error));
        return fallback.deleteNote(key, id);
      }
    },

    async searchNotes(user, query) {
      const all = await this.listNotes(user);
      return filterNotesByQuery(all, query);
    }
  };
}

let cachedNotesStore: NotesStore | null = null;

export function getNotesStore(): NotesStore {
  if (cachedNotesStore) return cachedNotesStore;
  const db = getDatabase();
  cachedNotesStore = db ? createPostgresNotesStore(db) : createMemoryNotesStore();
  return cachedNotesStore;
}

export function resetNotesStoreForTests(store: NotesStore | null = null): void {
  cachedNotesStore = store;
}
