import type { CalendarChangeProposal, EmailDraft } from "../conversation/types";
import { API_BASE } from "./http";
import { sessionStore } from "./sessionStore";

/** ผลของการส่งอีเมลหรือแก้ปฏิทิน พร้อมข้อความภาษาไทยที่ลูน่าพูด/แสดงให้ผู้ใช้ */
export interface WorkspaceActionResult {
  ok: boolean;
  message: string;
}

/** ข้อความข้อผิดพลาดจากเซิร์ฟเวอร์ (เช่นสิทธิ์ส่งอีเมลยังไม่พอ) ถ้าอ่านไม่ได้ใช้ข้อความสำรอง */
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
  } catch {
    return fallback;
  }
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
    body: JSON.stringify(body)
  });
}

/** ส่งอีเมลที่ผู้ใช้กดส่งในการ์ดแล้ว */
export async function sendEmailDraft(draft: EmailDraft): Promise<WorkspaceActionResult> {
  try {
    const response = await post("/api/workspace/email/send", {
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      ...(draft.threadId ? { threadId: draft.threadId } : {}),
      ...(draft.inReplyTo ? { inReplyTo: draft.inReplyTo } : {}),
      ...(draft.references ? { references: draft.references } : {})
    });
    if (!response.ok) return { ok: false, message: await errorMessage(response, "ส่งอีเมลไม่สำเร็จค่ะ") };
    return { ok: true, message: `ส่งอีเมลถึง ${draft.to.join(", ")} เรียบร้อยแล้วค่ะ` };
  } catch {
    return { ok: false, message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ค่ะ อีเมลยังไม่ได้ส่ง ลองกดส่งใหม่อีกครั้งนะคะ" };
  }
}

/** แก้หรือยกเลิกนัดที่ผู้ใช้กดยืนยันในการ์ดแล้ว */
export async function applyCalendarChange(change: CalendarChangeProposal): Promise<WorkspaceActionResult> {
  try {
    const response = await post("/api/workspace/calendar/change", {
      action: change.action,
      eventId: change.eventId,
      ...(change.after && change.after.title !== change.before.title ? { title: change.after.title } : {}),
      ...(change.after && change.after.start !== change.before.start ? { startIso: change.after.start } : {}),
      ...(change.after && change.after.end !== change.before.end && change.after.end ? { endIso: change.after.end } : {})
    });
    if (!response.ok) return { ok: false, message: await errorMessage(response, "แก้ไขปฏิทินไม่สำเร็จค่ะ") };
    return {
      ok: true,
      message:
        change.action === "delete"
          ? `ยกเลิกนัด ${change.before.title} ให้แล้วค่ะ`
          : `เปลี่ยนนัด ${change.after?.title ?? change.before.title} ให้แล้วค่ะ`
    };
  } catch {
    return { ok: false, message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ค่ะ ปฏิทินยังไม่ถูกแก้ ลองกดยืนยันใหม่อีกครั้งนะคะ" };
  }
}
