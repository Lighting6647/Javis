import type { VoiceContact } from "./contactsStore";
import type { CustomDesktopApp } from "./customAppsStore";
import { API_BASE } from "./http";
import { sessionStore } from "./sessionStore";

export interface WorkspaceEmail {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  important: boolean;
}

export interface WorkspaceCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  htmlLink?: string;
}

export interface WorkspaceNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned?: boolean;
  googleTaskId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceGoogleStatus {
  configured: boolean;
  accountEmail: string;
  services: {
    gmail: boolean;
    calendar: boolean;
    tasks: boolean;
  };
}

export interface MorningBriefingResponse {
  ok: boolean;
  generatedAt: number;
  google: WorkspaceGoogleStatus;
  emails: WorkspaceEmail[];
  events: WorkspaceCalendarEvent[];
  notes: WorkspaceNote[];
  spokenSummary: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" && payload.error ? payload.error : `คำขอไม่สำเร็จ (HTTP ${response.status})`);
  }
  return payload;
}

export async function fetchMorningBriefing(): Promise<MorningBriefingResponse> {
  const res = await fetch(`${API_BASE}/api/workspace/briefing`, {
    headers: { ...sessionStore.authHeaders() }
  });
  return readJson<MorningBriefingResponse>(res);
}

export async function fetchUpcomingCalendarEvents(days = 1): Promise<{
  ok: boolean;
  configured?: boolean;
  events: WorkspaceCalendarEvent[];
}> {
  const res = await fetch(`${API_BASE}/api/workspace/calendar?days=${encodeURIComponent(String(days))}`, {
    headers: { ...sessionStore.authHeaders() }
  });
  if (res.status === 503) {
    return { ok: false, configured: false, events: [] };
  }
  const payload = (await res.json()) as { ok?: boolean; events?: WorkspaceCalendarEvent[] };
  return {
    ok: res.ok && payload.ok === true,
    configured: true,
    events: Array.isArray(payload.events) ? payload.events : []
  };
}

export async function createWorkspaceCalendarEvent(input: {
  title: string;
  startIso: string;
  endIso?: string;
  description?: string;
  location?: string;
}): Promise<{ ok: true; accountEmail: string; event: WorkspaceCalendarEvent }> {
  const res = await fetch(`${API_BASE}/api/workspace/calendar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
    body: JSON.stringify(input)
  });
  return readJson(res);
}

export async function createWorkspaceNote(input: {
  title?: string;
  content: string;
  tags?: string[];
  syncGoogleTasks?: boolean;
}): Promise<{ ok: true; note: WorkspaceNote; googleTaskSynced: boolean }> {
  const res = await fetch(`${API_BASE}/api/workspace/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
    body: JSON.stringify(input)
  });
  return readJson(res);
}

export async function updateWorkspaceNote(
  id: string,
  patch: { title?: string; content?: string; tags?: string[]; pinned?: boolean }
): Promise<{ ok: true; note: WorkspaceNote }> {
  const res = await fetch(`${API_BASE}/api/workspace/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
    body: JSON.stringify(patch)
  });
  return readJson(res);
}

export async function deleteWorkspaceNote(id: string): Promise<{ ok: true; id: string }> {
  const res = await fetch(`${API_BASE}/api/workspace/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...sessionStore.authHeaders() }
  });
  return readJson(res);
}

export interface WorkspacePreferencesResponse {
  ok: boolean;
  contacts: VoiceContact[];
  customApps: CustomDesktopApp[];
  updatedAt: number;
}

export async function fetchWorkspacePreferences(): Promise<WorkspacePreferencesResponse> {
  const res = await fetch(`${API_BASE}/api/workspace/preferences`, {
    headers: { ...sessionStore.authHeaders() }
  });
  return readJson<WorkspacePreferencesResponse>(res);
}

export async function saveWorkspacePreferences(input: {
  contacts: VoiceContact[];
  customApps: CustomDesktopApp[];
}): Promise<WorkspacePreferencesResponse> {
  const res = await fetch(`${API_BASE}/api/workspace/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
    body: JSON.stringify(input)
  });
  return readJson<WorkspacePreferencesResponse>(res);
}
