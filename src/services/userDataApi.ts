import { fetchWithTimeout } from "./http";
import { sessionStore } from "./sessionStore";

/** ที่เก็บของเซิร์ฟเวอร์ตามที่ /api/status รายงาน */
export type ServerStorage = "postgres" | "memory";

/** เรียก API ข้อมูลผู้ใช้แบบ JSON แนบโทเค็นของผู้ใช้ปัจจุบัน และโยนข้อผิดพลาดเมื่อไม่สำเร็จ */
async function requestJson<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const response = await fetchWithTimeout(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...sessionStore.authHeaders(), ...(init.headers ?? {}) }
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

export interface ServerMemory {
  id: string;
  text: string;
  createdAt: number;
}

export const fetchServerMemories = () => requestJson<{ memories: ServerMemory[] }>("/api/memories").then((body) => body.memories);

export const saveServerMemories = (memories: ServerMemory[]) =>
  requestJson<{ memories: ServerMemory[]; rejected: number }>("/api/memories", {
    method: "PUT",
    body: JSON.stringify({ memories })
  });

export type FeedbackRating = "up" | "down";

export const sendFeedback = (input: { rating: FeedbackRating; note?: string; reply?: string }) =>
  requestJson<{ ok: boolean }>("/api/feedback", { method: "POST", body: JSON.stringify(input) });

/** ประวัติประชุมหนึ่งครั้งตามที่เซิร์ฟเวอร์เก็บ (บันทึกคำพูดอาจถูกตัดให้สั้นกว่าในเครื่อง) */
export interface ServerMeeting {
  id: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  summary: string;
  transcript: string;
}

export const fetchServerMeetings = () => requestJson<{ meetings: ServerMeeting[] }>("/api/meetings").then((body) => body.meetings);

export const saveServerMeetings = (meetings: ServerMeeting[]) =>
  requestJson<{ meetings: ServerMeeting[] }>("/api/meetings", {
    method: "PUT",
    body: JSON.stringify({ meetings }),
    // ประวัติ 15 ครั้งพร้อมบันทึกคำพูดอาจใหญ่ ให้เวลาอัปโหลดนานกว่าคำขอทั่วไป
    timeoutMs: 30_000
  });
