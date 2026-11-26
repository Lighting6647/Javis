import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { buildRawEmail, MAX_EMAIL_BODY, MAX_EMAIL_RECIPIENTS, MAX_EMAIL_SUBJECT } from "./emailDraft.js";
import {
  createCalendarEvent,
  createGoogleTask,
  deleteCalendarEvent,
  getGoogleWorkspaceStatus,
  listCalendarEvents,
  listImportantEmails,
  resolveGoogleWorkspaceConfig,
  sendGmailMessage,
  updateCalendarEvent
} from "./googleWorkspace.js";
import { fetchWeather, readCoordinates } from "./weather.js";
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

/** อีเมลที่ผู้ใช้กดส่งในการ์ด ตรวจรูปแบบอีกชั้นที่เซิร์ฟเวอร์ */
const sendEmailSchema = z.object({
  to: z.array(z.string().trim().email()).min(1).max(MAX_EMAIL_RECIPIENTS),
  subject: z.string().trim().min(1).max(MAX_EMAIL_SUBJECT),
  body: z.string().trim().min(1).max(MAX_EMAIL_BODY),
  threadId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).optional(),
  inReplyTo: z.string().trim().max(300).optional(),
  references: z.string().trim().max(2000).optional()
});

/** การแก้หรือลบนัดที่ผู้ใช้กดยืนยันในการ์ด */
const calendarChangeSchema = z.object({
  action: z.enum(["update", "delete"]),
  eventId: z.string().trim().min(1).max(1024).regex(/^[A-Za-z0-9_@.-]+$/),
  title: z.string().trim().max(180).optional(),
  startIso: z.string().trim().min(10).max(60).optional(),
  endIso: z.string().trim().min(10).max(60).optional()
});

/** ข้อความเมื่อเซิร์ฟเวอร์เปิดให้ทุกคนใช้ (ไม่บังคับเข้าสู่ระบบ) บนเว็บจริง จึงไม่ยอมให้ส่งอีเมลหรือแก้ปฏิทิน */
export const ACTIONS_LOCKED_MESSAGE =
  "เว็บนี้ยังไม่ได้ตั้งรหัสเข้าใช้ (ACCESS_CODES) ลูน่าจึงยังไม่ส่งอีเมลหรือแก้ปฏิทินแทนคุณบนเว็บนี้ เพื่อไม่ให้คนอื่นที่รู้ลิงก์ใช้ได้ค่ะ";

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
  sendEmail: RequestHandler;
  changeCalendar: RequestHandler;
  listNotes: RequestHandler;
  createNote: RequestHandler;
  updateNote: RequestHandler;
  deleteNote: RequestHandler;
  getPreferences: RequestHandler;
  putPreferences: RequestHandler;
}

export function createWorkspaceRoutes(
  getNotesStore: () => NotesStore,
  getPreferencesStore?: () => PreferencesStore,
  /**
   * ส่งอีเมลและแก้ปฏิทินได้ไหม: ได้เมื่อบังคับเข้าสู่ระบบ หรือเซิร์ฟเวอร์รันบนเครื่องของผู้ใช้เอง
   * เว็บสาธารณะที่ไม่ตั้งรหัสเข้าใช้ไม่ได้ เพราะใครรู้ลิงก์ก็จะส่งอีเมลในนามผู้ใช้ได้
   */
  actionsAllowed: () => boolean = () => true
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
      const coords = readCoordinates(request.query.lat, request.query.lon);
      const [emailsRes, calendarRes, notes, weather] = await Promise.all([
        google.configured ? listImportantEmails({ maxResults: 5 }) : Promise.resolve(null),
        google.configured ? listCalendarEvents({ days: 2, maxResults: 6 }) : Promise.resolve(null),
        getNotesStore().listNotes(user),
        coords ? fetchWeather(coords) : Promise.resolve(null)
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
        weather,
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

    sendEmail: async (request, response) => {
      if (!actionsAllowed()) {
        response.status(403).json({ ok: false, error: ACTIONS_LOCKED_MESSAGE, code: "locked" });
        return;
      }
      const parsed = sendEmailSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ ok: false, error: "ข้อมูลอีเมลไม่ครบหรือไม่ถูกต้องค่ะ" });
        return;
      }
      const cfg = resolveGoogleWorkspaceConfig();
      if (!cfg) {
        response.status(503).json({ ok: false, error: "ยังไม่ได้เชื่อมต่อ Gmail ค่ะ" });
        return;
      }
      const { to, subject, body, threadId, inReplyTo, references } = parsed.data;
      const raw = buildRawEmail({ from: cfg.accountEmail, to, subject, body, ...(inReplyTo ? { inReplyTo } : {}), ...(references ? { references } : {}) });
      const result = await sendGmailMessage(raw, threadId || undefined);
      if (!result.ok) {
        response.status(result.code === "scope" ? 403 : result.configured ? 502 : 503).json(result);
        return;
      }
      response.status(201).json(result);
    },

    changeCalendar: async (request, response) => {
      if (!actionsAllowed()) {
        response.status(403).json({ ok: false, error: ACTIONS_LOCKED_MESSAGE, code: "locked" });
        return;
      }
      const parsed = calendarChangeSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ ok: false, error: "ข้อมูลนัดหมายไม่ครบหรือไม่ถูกต้องค่ะ" });
        return;
      }
      const { action, eventId, title, startIso, endIso } = parsed.data;
      const result =
        action === "delete"
          ? await deleteCalendarEvent(eventId)
          : await updateCalendarEvent(eventId, { ...(title ? { title } : {}), ...(startIso ? { startIso } : {}), ...(endIso ? { endIso } : {}) });
      if (!result.ok) {
        response.status(result.code === "scope" ? 403 : result.code === "not-found" ? 404 : result.configured ? 502 : 503).json(result);
        return;
      }
      response.json(result);
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
