/**
 * ตัวเชื่อมต่อ Google Workspace (Gmail + Google Calendar + Google Tasks)
 * สำหรับบัญชี Lighting6647@gmail.com ผ่าน Google OAuth 2.0 Refresh Token ฝั่ง Backend เท่านั้น
 * ไม่เก็บหรือส่งต่อ Token ใด ๆ ออกไปฝั่งหน้าเว็บ
 */
import { CALENDAR_SCOPE_MISSING, isScopeError, SEND_SCOPE_MISSING } from "./emailDraft.js";

export const DEFAULT_GOOGLE_ACCOUNT_EMAIL = "Lighting6647@gmail.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";
const TASKS_API_BASE = "https://tasks.googleapis.com/tasks/v1/lists/@default";
const UPSTREAM_TIMEOUT_MS = 10_000;
const BANGKOK_TIMEZONE = "Asia/Bangkok";

export interface GoogleWorkspaceConfig {
  accountEmail: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ImportantEmailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  important: boolean;
}

export interface CalendarEventSummary {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  htmlLink?: string;
}

export interface CreateCalendarEventInput {
  title: string;
  startIso: string;
  endIso?: string;
  description?: string;
  location?: string;
}

export interface GoogleTaskSummary {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: string;
}

export interface GoogleWorkspaceStatus {
  configured: boolean;
  accountEmail: string;
  services: {
    gmail: boolean;
    calendar: boolean;
    tasks: boolean;
  };
}

export function resolveGoogleWorkspaceConfig(env: NodeJS.ProcessEnv = process.env): GoogleWorkspaceConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = env.GOOGLE_REFRESH_TOKEN?.trim() ?? "";
  const accountEmail = env.GOOGLE_ACCOUNT_EMAIL?.trim() || DEFAULT_GOOGLE_ACCOUNT_EMAIL;

  if (!clientId || !clientSecret || !refreshToken) return null;
  return { accountEmail, clientId, clientSecret, refreshToken };
}

export function getGoogleWorkspaceStatus(env: NodeJS.ProcessEnv = process.env): GoogleWorkspaceStatus {
  const cfg = resolveGoogleWorkspaceConfig(env);
  const configured = cfg !== null;
  return {
    configured,
    accountEmail: cfg?.accountEmail ?? (env.GOOGLE_ACCOUNT_EMAIL?.trim() || DEFAULT_GOOGLE_ACCOUNT_EMAIL),
    services: {
      gmail: configured,
      calendar: configured,
      tasks: configured
    }
  };
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  cacheKey: string;
}

let tokenCache: CachedToken | null = null;

export function clearGoogleTokenCacheForTests(): void {
  tokenCache = null;
}

async function fetchWithTimeout(url: string, init: RequestInit, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(cfg: GoogleWorkspaceConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  const cacheKey = `${cfg.clientId}:${cfg.refreshToken.slice(-8)}`;
  if (tokenCache && tokenCache.cacheKey === cacheKey && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetchWithTimeout(
    GOOGLE_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    },
    fetchImpl
  );

  if (!response.ok) {
    throw new Error(`google-oauth-failed:${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("google-oauth-no-token");

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in) || 3600) * 1000,
    cacheKey
  };
  return data.access_token;
}

function readHeader(headers: Array<{ name?: string; value?: string }> | undefined, target: string): string {
  if (!Array.isArray(headers)) return "";
  const found = headers.find((header) => header.name?.toLowerCase() === target.toLowerCase());
  return found?.value?.trim() ?? "";
}

/** อ่านรายการอีเมลสำคัญหรือยังไม่อ่านจาก Gmail ของบัญชีที่เชื่อมต่อ */
export async function listImportantEmails(
  options: { maxResults?: number; query?: string; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; accountEmail: string; emails: ImportantEmailSummary[] } | { ok: false; configured: boolean; accountEmail: string; error: string }> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cfg = resolveGoogleWorkspaceConfig(env);
  const accountEmail = cfg?.accountEmail ?? (env.GOOGLE_ACCOUNT_EMAIL?.trim() || DEFAULT_GOOGLE_ACCOUNT_EMAIL);

  if (!cfg) {
    return {
      ok: false,
      configured: false,
      accountEmail,
      error: `ยังไม่ได้เชื่อมต่อ Google OAuth สำหรับ ${accountEmail} กรุณาตั้งค่า GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET และ GOOGLE_REFRESH_TOKEN ใน .env.local`
    };
  }

  try {
    const token = await getAccessToken(cfg, fetchImpl);
    const maxResults = Math.min(Math.max(options.maxResults ?? 5, 1), 10);
    const q = options.query?.trim() || "is:important OR is:unread -category:promotions -category:social";
    const listUrl = `${GMAIL_API_BASE}/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`;

    const listRes = await fetchWithTimeout(listUrl, { headers: { Authorization: `Bearer ${token}` } }, fetchImpl);
    if (!listRes.ok) {
      return { ok: false, configured: true, accountEmail, error: `ไม่สามารถอ่านรายการอีเมลได้ (HTTP ${listRes.status})` };
    }

    const listData = (await listRes.json()) as { messages?: Array<{ id?: string }> };
    const messageIds = (listData.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)).slice(0, maxResults);

    const emails: ImportantEmailSummary[] = [];
    for (const id of messageIds) {
      const msgUrl = `${GMAIL_API_BASE}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
      const msgRes = await fetchWithTimeout(msgUrl, { headers: { Authorization: `Bearer ${token}` } }, fetchImpl);
      if (!msgRes.ok) continue;
      const msg = (await msgRes.json()) as {
        id?: string;
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      };
      const labels = Array.isArray(msg.labelIds) ? msg.labelIds : [];
      emails.push({
        id: msg.id ?? id,
        from: readHeader(msg.payload?.headers, "From") || "ไม่ระบุผู้ส่ง",
        subject: readHeader(msg.payload?.headers, "Subject") || "(ไม่มีหัวข้อ)",
        date: readHeader(msg.payload?.headers, "Date"),
        snippet: (msg.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
        unread: labels.includes("UNREAD"),
        important: labels.includes("IMPORTANT")
      });
    }

    return { ok: true, accountEmail, emails };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      accountEmail,
      error: error instanceof Error ? `เชื่อมต่อ Gmail ไม่สำเร็จ (${error.message})` : "เชื่อมต่อ Gmail ไม่สำเร็จ"
    };
  }
}

/** ดูตารางนัดหมายที่จะมาถึงจาก Google Calendar */
export async function listCalendarEvents(
  options: { maxResults?: number; days?: number; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; accountEmail: string; events: CalendarEventSummary[] } | { ok: false; configured: boolean; accountEmail: string; error: string }> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cfg = resolveGoogleWorkspaceConfig(env);
  const accountEmail = cfg?.accountEmail ?? (env.GOOGLE_ACCOUNT_EMAIL?.trim() || DEFAULT_GOOGLE_ACCOUNT_EMAIL);

  if (!cfg) {
    return {
      ok: false,
      configured: false,
      accountEmail,
      error: `ยังไม่ได้เชื่อมต่อ Google Calendar สำหรับ ${accountEmail} กรุณาตั้งค่า Google OAuth ใน .env.local`
    };
  }

  try {
    const token = await getAccessToken(cfg, fetchImpl);
    const maxResults = Math.min(Math.max(options.maxResults ?? 8, 1), 20);
    const days = Math.min(Math.max(options.days ?? 7, 1), 30);
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(maxResults),
      timeMin: now.toISOString(),
      timeMax: until.toISOString(),
      timeZone: BANGKOK_TIMEZONE
    });

    const res = await fetchWithTimeout(`${CALENDAR_API_BASE}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    }, fetchImpl);
    if (!res.ok) {
      return { ok: false, configured: true, accountEmail, error: `ไม่สามารถอ่าน Google Calendar ได้ (HTTP ${res.status})` };
    }

    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        summary?: string;
        location?: string;
        description?: string;
        htmlLink?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };

    const events: CalendarEventSummary[] = (data.items ?? []).map((item) => ({
      id: item.id ?? "",
      title: item.summary?.trim() || "(ไม่มีชื่อนัดหมาย)",
      start: item.start?.dateTime ?? item.start?.date ?? "",
      end: item.end?.dateTime ?? item.end?.date ?? "",
      ...(item.location ? { location: item.location } : {}),
      ...(item.description ? { description: item.description.slice(0, 300) } : {}),
      ...(item.htmlLink ? { htmlLink: item.htmlLink } : {})
    }));

    return { ok: true, accountEmail, events };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      accountEmail,
      error: error instanceof Error ? `เชื่อมต่อ Google Calendar ไม่สำเร็จ (${error.message})` : "เชื่อมต่อ Google Calendar ไม่สำเร็จ"
    };
  }
}

/** บันทึกนัดหมายใหม่ลง Google Calendar ของบัญชีที่เชื่อมต่อ */
export async function createCalendarEvent(
  input: CreateCalendarEventInput,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; accountEmail: string; event: CalendarEventSummary } | { ok: false; configured: boolean; accountEmail: string; error: string }> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cfg = resolveGoogleWorkspaceConfig(env);
  const accountEmail = cfg?.accountEmail ?? (env.GOOGLE_ACCOUNT_EMAIL?.trim() || DEFAULT_GOOGLE_ACCOUNT_EMAIL);

  if (!cfg) {
    return {
      ok: false,
      configured: false,
      accountEmail,
      error: `ยังไม่ได้เชื่อมต่อ Google Calendar สำหรับ ${accountEmail} กรุณาตั้งค่า Google OAuth ใน .env.local`
    };
  }

  const startDate = new Date(input.startIso);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false, configured: true, accountEmail, error: "รูปแบบวันเวลาเริ่มต้นไม่ถูกต้อง" };
  }
  const endDate = input.endIso ? new Date(input.endIso) : new Date(startDate.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
    return { ok: false, configured: true, accountEmail, error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น" };
  }

  try {
    const token = await getAccessToken(cfg, fetchImpl);
    const payload = {
      summary: input.title.trim().slice(0, 180),
      ...(input.description ? { description: input.description.trim().slice(0, 1000) } : {}),
      ...(input.location ? { location: input.location.trim().slice(0, 200) } : {}),
      start: { dateTime: startDate.toISOString(), timeZone: BANGKOK_TIMEZONE },
      end: { dateTime: endDate.toISOString(), timeZone: BANGKOK_TIMEZONE }
    };

    const res = await fetchWithTimeout(
      `${CALENDAR_API_BASE}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      },
      fetchImpl
    );

    if (!res.ok) {
      return { ok: false, configured: true, accountEmail, error: `บันทึกนัดหมายไม่สำเร็จ (HTTP ${res.status})` };
    }

    const created = (await res.json()) as {
      id?: string;
      summary?: string;
      htmlLink?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    };
    return {
      ok: true,
      accountEmail,
      event: {
        id: created.id ?? "",
        title: created.summary ?? payload.summary,
        start: created.start?.dateTime ?? payload.start.dateTime,
        end: created.end?.dateTime ?? payload.end.dateTime,
        ...(created.htmlLink ? { htmlLink: created.htmlLink } : {})
      }
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      accountEmail,
      error: error instanceof Error ? `บันทึกนัดหมายลง Google Calendar ไม่สำเร็จ (${error.message})` : "บันทึกนัดหมายไม่สำเร็จ"
    };
  }
}

/** สร้างรายการ Note/Task บน Google Tasks ของบัญชีที่เชื่อมต่อ */
export async function createGoogleTask(
  input: { title: string; notes?: string },
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; accountEmail: string; task: GoogleTaskSummary } | { ok: false; configured: boolean; accountEmail: string; error: string }> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cfg = resolveGoogleWorkspaceConfig(env);
  const accountEmail = cfg?.accountEmail ?? (env.GOOGLE_ACCOUNT_EMAIL?.trim() || DEFAULT_GOOGLE_ACCOUNT_EMAIL);

  if (!cfg) {
    return {
      ok: false,
      configured: false,
      accountEmail,
      error: `ยังไม่ได้เชื่อมต่อ Google Tasks สำหรับ ${accountEmail}`
    };
  }

  try {
    const token = await getAccessToken(cfg, fetchImpl);
    const res = await fetchWithTimeout(
      `${TASKS_API_BASE}/tasks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: input.title.trim().slice(0, 180),
          ...(input.notes ? { notes: input.notes.trim().slice(0, 1500) } : {})
        })
      },
      fetchImpl
    );

    if (!res.ok) {
      return { ok: false, configured: true, accountEmail, error: `ซิงก์ Google Tasks ไม่สำเร็จ (HTTP ${res.status})` };
    }

    const created = (await res.json()) as { id?: string; title?: string; notes?: string; due?: string; status?: string };
    return {
      ok: true,
      accountEmail,
      task: {
        id: created.id ?? "",
        title: created.title ?? input.title,
        ...(created.notes ? { notes: created.notes } : {}),
        ...(created.due ? { due: created.due } : {}),
        status: created.status ?? "needsAction"
      }
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      accountEmail,
      error: error instanceof Error ? `เชื่อมต่อ Google Tasks ไม่สำเร็จ (${error.message})` : "เชื่อมต่อ Google Tasks ไม่สำเร็จ"
    };
  }
}

// ---------------------------------------------------------------------------
// การกระทำที่ต้องให้ผู้ใช้ยืนยันก่อน (ส่งอีเมล แก้ไขหรือลบนัด) ฟังก์ชันเหล่านี้ถูกเรียกเฉพาะจาก
// endpoint ที่ผู้ใช้กดยืนยันในการ์ดแล้วเท่านั้น (ดู server/workspaceRoutes.ts) AI เรียกตรงไม่ได้
// ---------------------------------------------------------------------------

export type WorkspaceFailure = { ok: false; configured: boolean; accountEmail: string; error: string; code?: "scope" | "not-found" };

function notConfigured(env: NodeJS.ProcessEnv, service: string): WorkspaceFailure {
  const accountEmail = env.GOOGLE_ACCOUNT_EMAIL?.trim() || DEFAULT_GOOGLE_ACCOUNT_EMAIL;
  return { ok: false, configured: false, accountEmail, error: `ยังไม่ได้เชื่อมต่อ ${service} สำหรับ ${accountEmail} กรุณาตั้งค่า Google OAuth ใน .env.local` };
}

/** อีเมลที่จะตอบกลับ: ข้อมูลหัวอีเมลที่ต้องใช้ตอบในเธรดเดิม */
export interface ReplyTarget {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  messageId: string;
  references: string;
}

/**
 * หาอีเมลที่ผู้ใช้ต้องการตอบด้วยคำค้นแบบ Gmail (เช่น from:somchai หรือคำในหัวเรื่อง) คืนฉบับล่าสุดที่ตรง
 * การ์ดยืนยันแสดงผู้ส่งและหัวเรื่องของฉบับนี้ ผู้ใช้จึงตรวจได้ว่าตอบถูกฉบับก่อนกดส่ง
 */
export async function findEmailToReply(
  query: string,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; accountEmail: string; target: ReplyTarget } | WorkspaceFailure> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cfg = resolveGoogleWorkspaceConfig(env);
  if (!cfg) return notConfigured(env, "Gmail");
  const { accountEmail } = cfg;

  try {
    const token = await getAccessToken(cfg, fetchImpl);
    const q = `${query.trim()} -in:sent -in:drafts`.trim();
    const listRes = await fetchWithTimeout(`${GMAIL_API_BASE}/messages?maxResults=1&q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` }
    }, fetchImpl);
    if (!listRes.ok) return { ok: false, configured: true, accountEmail, error: `ไม่สามารถค้นอีเมลได้ (HTTP ${listRes.status})` };
    const id = ((await listRes.json()) as { messages?: Array<{ id?: string }> }).messages?.[0]?.id;
    if (!id) {
      return { ok: false, configured: true, accountEmail, error: "ไม่พบอีเมลที่ตรงกับที่บอกค่ะ ลองบอกชื่อผู้ส่งหรือหัวเรื่องให้ชัดขึ้นนะคะ", code: "not-found" };
    }

    const headers = ["From", "Subject", "Message-ID", "References"].map((name) => `metadataHeaders=${name}`).join("&");
    const msgRes = await fetchWithTimeout(`${GMAIL_API_BASE}/messages/${encodeURIComponent(id)}?format=metadata&${headers}`, {
      headers: { Authorization: `Bearer ${token}` }
    }, fetchImpl);
    if (!msgRes.ok) return { ok: false, configured: true, accountEmail, error: `ไม่สามารถอ่านอีเมลได้ (HTTP ${msgRes.status})` };
    const msg = (await msgRes.json()) as { id?: string; threadId?: string; payload?: { headers?: Array<{ name?: string; value?: string }> } };
    return {
      ok: true,
      accountEmail,
      target: {
        id: msg.id ?? id,
        threadId: msg.threadId ?? "",
        from: readHeader(msg.payload?.headers, "From"),
        subject: readHeader(msg.payload?.headers, "Subject"),
        messageId: readHeader(msg.payload?.headers, "Message-ID"),
        references: readHeader(msg.payload?.headers, "References")
      }
    };
  } catch (error) {
    return { ok: false, configured: true, accountEmail, error: error instanceof Error ? `เชื่อมต่อ Gmail ไม่สำเร็จ (${error.message})` : "เชื่อมต่อ Gmail ไม่สำเร็จ" };
  }
}

/** ส่งอีเมลที่สร้างแล้ว (raw base64url) ผ่าน Gmail เรียกหลังผู้ใช้กดส่งในการ์ดเท่านั้น */
export async function sendGmailMessage(
  raw: string,
  threadId: string | undefined,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; accountEmail: string; id: string } | WorkspaceFailure> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cfg = resolveGoogleWorkspaceConfig(env);
  if (!cfg) return notConfigured(env, "Gmail");
  const { accountEmail } = cfg;

  try {
    const token = await getAccessToken(cfg, fetchImpl);
    const res = await fetchWithTimeout(`${GMAIL_API_BASE}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) })
    }, fetchImpl);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (isScopeError(res.status, text)) return { ok: false, configured: true, accountEmail, error: SEND_SCOPE_MISSING, code: "scope" };
      return { ok: false, configured: true, accountEmail, error: `ส่งอีเมลไม่สำเร็จ (HTTP ${res.status})` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, accountEmail, id: data.id ?? "" };
  } catch (error) {
    return { ok: false, configured: true, accountEmail, error: error instanceof Error ? `เชื่อมต่อ Gmail ไม่สำเร็จ (${error.message})` : "เชื่อมต่อ Gmail ไม่สำเร็จ" };
  }
}

/** แก้ไขนัด (ชื่อ เวลาเริ่ม เวลาจบ) เรียกหลังผู้ใช้กดยืนยันในการ์ดเท่านั้น */
export async function updateCalendarEvent(
  eventId: string,
  patch: { title?: string; startIso?: string; endIso?: string },
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; accountEmail: string; event: CalendarEventSummary } | WorkspaceFailure> {
  return changeCalendarEvent(eventId, "PATCH", patch, options);
}

/** ลบนัด เรียกหลังผู้ใช้กดยืนยันในการ์ดเท่านั้น */
export async function deleteCalendarEvent(
  eventId: string,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: true; accountEmail: string; event: CalendarEventSummary } | WorkspaceFailure> {
  return changeCalendarEvent(eventId, "DELETE", {}, options);
}

async function changeCalendarEvent(
  eventId: string,
  method: "PATCH" | "DELETE",
  patch: { title?: string; startIso?: string; endIso?: string },
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch }
): Promise<{ ok: true; accountEmail: string; event: CalendarEventSummary } | WorkspaceFailure> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cfg = resolveGoogleWorkspaceConfig(env);
  if (!cfg) return notConfigured(env, "Google Calendar");
  const { accountEmail } = cfg;

  try {
    const token = await getAccessToken(cfg, fetchImpl);
    const body =
      method === "PATCH"
        ? JSON.stringify({
            ...(patch.title ? { summary: patch.title } : {}),
            ...(patch.startIso ? { start: { dateTime: patch.startIso, timeZone: BANGKOK_TIMEZONE } } : {}),
            ...(patch.endIso ? { end: { dateTime: patch.endIso, timeZone: BANGKOK_TIMEZONE } } : {})
          })
        : undefined;
    const res = await fetchWithTimeout(`${CALENDAR_API_BASE}/events/${encodeURIComponent(eventId)}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body } : {})
    }, fetchImpl);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (isScopeError(res.status, text)) return { ok: false, configured: true, accountEmail, error: CALENDAR_SCOPE_MISSING, code: "scope" };
      if (res.status === 404 || res.status === 410) {
        return { ok: false, configured: true, accountEmail, error: "ไม่พบนัดนี้ในปฏิทินแล้วค่ะ อาจถูกลบหรือย้ายไปก่อนหน้านี้", code: "not-found" };
      }
      return { ok: false, configured: true, accountEmail, error: `แก้ไขปฏิทินไม่สำเร็จ (HTTP ${res.status})` };
    }
    if (method === "DELETE") return { ok: true, accountEmail, event: { id: eventId, title: "", start: "", end: "" } };
    const item = (await res.json()) as { id?: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
    return {
      ok: true,
      accountEmail,
      event: {
        id: item.id ?? eventId,
        title: item.summary?.trim() || "(ไม่มีชื่อนัดหมาย)",
        start: item.start?.dateTime ?? item.start?.date ?? "",
        end: item.end?.dateTime ?? item.end?.date ?? ""
      }
    };
  } catch (error) {
    return { ok: false, configured: true, accountEmail, error: error instanceof Error ? `เชื่อมต่อ Google Calendar ไม่สำเร็จ (${error.message})` : "เชื่อมต่อ Google Calendar ไม่สำเร็จ" };
  }
}
