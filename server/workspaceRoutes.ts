import type { Request, RequestHandler } from "express";
import { z } from "zod";
import {
  createCalendarEvent,
  createGoogleTask,
  getGoogleWorkspaceStatus,
  listCalendarEvents,
  listImportantEmails
} from "./googleWorkspace.js";
import { MAX_NOTE_CONTENT, MAX_NOTE_TITLE, type NotesStore } from "./notesStore.js";
import type { PreferencesStore } from "./preferencesStore.js";
import { ANONYMOUS_USER } from "./userStore.js";

const createEventSchema = z.object({
  title: z.string().trim().min(1).max(180),
  startIso: z.string().trim().min(10).max(60),
  endIso: z.string().trim().min(10).max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  location: z.string().trim().max(200).optional()
});

const createNoteSchema = z.object({
  title: z.string().trim().max(MAX_NOTE_TITLE).optional(),
  content: z.string().trim().min(1).max(MAX_NOTE_CONTENT),
  tags: z.array(z.string().trim().min(1).max(32)).max(6).optional(),
  pinned: z.boolean().optional(),
  syncGoogleTasks: z.boolean().optional()
});

const updateNoteSchema = z.object({
  title: z.string().trim().max(MAX_NOTE_TITLE).optional(),
  content: z.string().trim().min(1).max(MAX_NOTE_CONTENT).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(6).optional(),
  pinned: z.boolean().optional()
});

function currentUser(request: Request): string {
  const user = (request as Request & { authUser?: string }).authUser;
  return typeof user === "string" && user.trim() ? user.trim() : ANONYMOUS_USER;
}

export interface WorkspaceRouteHandlers {
  status: RequestHandler;
  briefing: RequestHandler;
  listEmails: RequestHandler;
  listCalendar: RequestHandler;
  createCalendar: RequestHandler;
  listNotes: RequestHandler;
  createNote: RequestHandler;
  updateNote: RequestHandler;
  deleteNote: RequestHandler;
  getPreferences: RequestHandler;
  putPreferences: RequestHandler;
}

export function createWorkspaceRoutes(
  getNotesStore: () => NotesStore,
  getPreferencesStore?: () => PreferencesStore
): WorkspaceRouteHandlers {
  return {
    status: (_request, response) => {
      response.set("Cache-Control", "no-store").json({
        ok: true,
        google: getGoogleWorkspaceStatus(),
        notesStorage: getNotesStore().kind
      });
    },

    briefing: async (request, response) => {
      const user = currentUser(request);
      const google = getGoogleWorkspaceStatus();
      const [emailsRes, calendarRes, notes] = await Promise.all([
        google.configured ? listImportantEmails({ maxResults: 5 }) : Promise.resolve(null),
        google.configured ? listCalendarEvents({ days: 2, maxResults: 6 }) : Promise.resolve(null),
        getNotesStore().listNotes(user)
      ]);

      const emails = emailsRes?.ok ? emailsRes.emails : [];
      const events = calendarRes?.ok ? calendarRes.events : [];
      const recentNotes = notes.slice(0, 6);

      const parts: string[] = [];
      if (!google.configured) {
        parts.push(`ยังไม่ได้เชื่อมต่อ Google OAuth สำหรับ ${google.accountEmail} จึงยังดึงเมลและปฏิทินไม่ได้`);
      } else {
        parts.push(
          emails.length > 0
            ? `มีอีเมลสำคัญ ${emails.length} ฉบับ ล่าสุดเรื่อง ${emails[0]?.subject}`
            : "ยังไม่มีอีเมลสำคัญหรือยังไม่อ่านใหม่"
        );
        parts.push(
          events.length > 0
            ? `มีนัดหมายช่วงวันนี้และพรุ่งนี้ ${events.length} รายการ ถัดไปคือ ${events[0]?.title}`
            : "วันนี้และพรุ่งนี้ยังไม่มีนัดหมายในปฏิทิน"
        );
      }
      parts.push(
        recentNotes.length > 0
          ? `มีโน้ตที่จดไว้ ${recentNotes.length} รายการ ล่าสุดคือ ${recentNotes[0]?.title}`
          : "ยังไม่มีโน้ตค้างไว้"
      );

      response.set("Cache-Control", "no-store").json({
        ok: true,
        generatedAt: Date.now(),
        google,
        emails,
        events,
        notes: recentNotes,
        spokenSummary: parts.join(" ")
      });
    },

    listEmails: async (request, response) => {
      const rawLimit = Number(request.query.limit);
      const maxResults = Number.isFinite(rawLimit) ? rawLimit : 5;
      const query = typeof request.query.q === "string" ? request.query.q.slice(0, 160) : undefined;
      const result = await listImportantEmails({ maxResults, ...(query ? { query } : {}) });
      if (!result.ok) {
        response.status(result.configured ? 502 : 503).json(result);
        return;
      }
      response.set("Cache-Control", "no-store").json(result);
    },

    listCalendar: async (request, response) => {
      const rawDays = Number(request.query.days);
      const days = Number.isFinite(rawDays) ? rawDays : 7;
      const result = await listCalendarEvents({ days });
      if (!result.ok) {
        response.status(result.configured ? 502 : 503).json(result);
        return;
      }
      response.set("Cache-Control", "no-store").json(result);
    },

    createCalendar: async (request, response) => {
      const parsed = createEventSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ ok: false, error: "ข้อมูลนัดหมายไม่ครบถ้วนหรือไม่ถูกต้อง" });
        return;
      }
      const result = await createCalendarEvent(parsed.data);
      if (!result.ok) {
        response.status(result.configured ? 502 : 503).json(result);
        return;
      }
      response.status(201).json(result);
    },

    listNotes: async (request, response) => {
      const store = getNotesStore();
      const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
      const notes = query ? await store.searchNotes(currentUser(request), query) : await store.listNotes(currentUser(request));
      response.set("Cache-Control", "no-store").json({ ok: true, notes, storage: store.kind });
    },

    createNote: async (request, response) => {
      const parsed = createNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ ok: false, error: "กรุณาระบุเนื้อหาโน้ตให้ถูกต้อง" });
        return;
      }

      let googleTaskId: string | undefined;
      let googleTaskSynced = false;
      if (parsed.data.syncGoogleTasks !== false && getGoogleWorkspaceStatus().configured) {
        const taskRes = await createGoogleTask({
          title: parsed.data.title || parsed.data.content.slice(0, 80),
          notes: parsed.data.content
        });
        if (taskRes.ok) {
          googleTaskId = taskRes.task.id;
          googleTaskSynced = true;
        }
      }

      const store = getNotesStore();
      const { note, rejected } = await store.addNote(currentUser(request), {
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        content: parsed.data.content,
        ...(parsed.data.tags ? { tags: parsed.data.tags } : {}),
        ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
        ...(googleTaskId ? { googleTaskId } : {})
      });
      if (rejected) {
        response.status(400).json({ ok: false, error: "ไม่อนุญาตให้บันทึกข้อมูลอ่อนไหว เช่น รหัสผ่าน OTP หรือเลขบัตรลงในโน้ต" });
        return;
      }
      if (!note) {
        response.status(400).json({ ok: false, error: "ไม่สามารถบันทึกโน้ตได้" });
        return;
      }
      response.status(201).json({ ok: true, note, googleTaskSynced });
    },

    updateNote: async (request, response) => {
      const id = typeof request.params.id === "string" ? request.params.id : "";
      const parsed = updateNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ ok: false, error: "ข้อมูลแก้ไขโน้ตไม่ถูกต้อง" });
        return;
      }
      const { note, rejected } = await getNotesStore().updateNote(currentUser(request), id, parsed.data);
      if (rejected) {
        response.status(400).json({ ok: false, error: "ไม่อนุญาตให้บันทึกข้อมูลอ่อนไหว เช่น รหัสผ่าน OTP หรือเลขบัตรลงในโน้ต" });
        return;
      }
      if (!note) {
        response.status(404).json({ ok: false, error: "ไม่พบโน้ตที่ต้องการแก้ไข" });
        return;
      }
      response.json({ ok: true, note });
    },

    deleteNote: async (request, response) => {
      const id = typeof request.params.id === "string" ? request.params.id : "";
      const deleted = await getNotesStore().deleteNote(currentUser(request), id);
      if (!deleted) {
        response.status(404).json({ ok: false, error: "ไม่พบโน้ตที่ต้องการลบ" });
        return;
      }
      response.json({ ok: true, id });
    },

    getPreferences: async (request, response) => {
      if (!getPreferencesStore) {
        response.json({ ok: true, contacts: [], customApps: [], updatedAt: 0, storage: "memory" });
        return;
      }
      const store = getPreferencesStore();
      const prefs = await store.getPreferences(currentUser(request));
      response.set("Cache-Control", "no-store").json({ ok: true, ...prefs, storage: store.kind });
    },

    putPreferences: async (request, response) => {
      if (!getPreferencesStore) {
        response.json({ ok: true, contacts: [], customApps: [], updatedAt: Date.now(), storage: "memory" });
        return;
      }
      const body = request.body as { contacts?: unknown; customApps?: unknown } | undefined;
      if (!body || typeof body !== "object") {
        response.status(400).json({ ok: false, error: "ข้อมูลการตั้งค่าไม่ถูกต้อง" });
        return;
      }
      const store = getPreferencesStore();
      const saved = await store.putPreferences(currentUser(request), {
        ...(body.contacts !== undefined ? { contacts: body.contacts } : {}),
        ...(body.customApps !== undefined ? { customApps: body.customApps } : {})
      });
      response.json({ ok: true, ...saved, storage: store.kind });
    }
  };
}
