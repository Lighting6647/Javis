import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGoogleTokenCacheForTests,
  createCalendarEvent,
  createGoogleTask,
  DEFAULT_GOOGLE_ACCOUNT_EMAIL,
  extractEmailBody,
  getGoogleWorkspaceStatus,
  listCalendarEvents,
  listImportantEmails
} from "./googleWorkspace.js";

describe("extractEmailBody", () => {
  const encode = (text: string) => ({ data: Buffer.from(text, "utf8").toString("base64url") });

  it("ใช้ข้อความล้วนก่อน HTML และไม่อ่านไฟล์แนบ", () => {
    expect(
      extractEmailBody({
        mimeType: "multipart/mixed",
        parts: [
          { mimeType: "text/plain", filename: "notes.txt", body: encode("ไฟล์แนบ") },
          { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: encode("<p>html</p>") }, { mimeType: "text/plain", body: encode("สวัสดี\u034f\n\n  ครับ") }] }
        ]
      })
    ).toBe("สวัสดี\nครับ");
  });

  it("แปลงจาก HTML เมื่อไม่มีข้อความล้วน และรับเมลที่ไม่มีเนื้อหา", () => {
    expect(extractEmailBody({ mimeType: "text/html", body: encode("<style>x</style><p>ใบเสร็จ</p><script>y</script>") })).toBe("ใบเสร็จ");
    expect(extractEmailBody(undefined)).toBe("");
  });
});

describe("googleWorkspace", () => {
  beforeEach(() => {
    clearGoogleTokenCacheForTests();
  });

  it("reports unconfigured status with default Lighting6647@gmail.com account", () => {
    const status = getGoogleWorkspaceStatus({});
    expect(status.configured).toBe(false);
    expect(status.accountEmail).toBe(DEFAULT_GOOGLE_ACCOUNT_EMAIL);
    expect(status.services).toEqual({ gmail: false, calendar: false, tasks: false });
  });

  it("fetches important emails, calendar events, creates event and task via OAuth", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "cid-123",
      GOOGLE_CLIENT_SECRET: "csec-456",
      GOOGLE_REFRESH_TOKEN: "rtok-78901234",
      GOOGLE_ACCOUNT_EMAIL: "Lighting6647@gmail.com"
    };

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
      }
      if (url.includes("/gmail/v1/users/me/messages?")) {
        return new Response(JSON.stringify({ messages: [{ id: "m1" }] }), { status: 200 });
      }
      if (url.includes("/gmail/v1/users/me/messages/m1")) {
        return new Response(
          JSON.stringify({
            id: "m1",
            snippet: "ยืนยันกำหนดส่งมอบงานพรุ่งนี้ 10 โมง",
            labelIds: ["UNREAD", "IMPORTANT"],
            payload: {
              headers: [
                { name: "From", value: "boss@example.com" },
                { name: "Subject", value: "ด่วน: ประชุมสรุปงาน" },
                { name: "Date", value: "Sat, 21 Nov 2026 09:00:00 +0700" }
              ]
            }
          }),
          { status: 200 }
        );
      }
      if (url.includes("/calendar/v3/calendars/primary/events") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "ev-new",
            summary: "นัดคุยระบบเดลลูน่า",
            start: { dateTime: "2026-11-22T14:00:00+07:00" },
            end: { dateTime: "2026-11-22T15:00:00+07:00" }
          }),
          { status: 200 }
        );
      }
      if (url.includes("/calendar/v3/calendars/primary/events")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "ev-1",
                summary: "ประชุมประจำสัปดาห์",
                start: { dateTime: "2026-11-21T15:00:00+07:00" },
                end: { dateTime: "2026-11-21T16:00:00+07:00" }
              }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.includes("/tasks/v1/lists/@default/tasks") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "task-1", title: "ซื้อไมโครโฟนใหม่", status: "needsAction" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const emailsRes = await listImportantEmails({ env, fetchImpl: fetchMock as typeof fetch });
    expect(emailsRes.ok).toBe(true);
    if (emailsRes.ok) {
      expect(emailsRes.accountEmail).toBe("Lighting6647@gmail.com");
      expect(emailsRes.emails[0]?.subject).toBe("ด่วน: ประชุมสรุปงาน");
      expect(emailsRes.emails[0]?.important).toBe(true);
    }

    const calList = await listCalendarEvents({ env, fetchImpl: fetchMock as typeof fetch });
    expect(calList.ok).toBe(true);
    if (calList.ok) {
      expect(calList.events[0]?.title).toBe("ประชุมประจำสัปดาห์");
    }

    const calCreate = await createCalendarEvent(
      { title: "นัดคุยระบบเดลลูน่า", startIso: "2026-11-22T14:00:00+07:00" },
      { env, fetchImpl: fetchMock as typeof fetch }
    );
    expect(calCreate.ok).toBe(true);
    if (calCreate.ok) {
      expect(calCreate.event.id).toBe("ev-new");
    }

    const taskCreate = await createGoogleTask({ title: "ซื้อไมโครโฟนใหม่" }, { env, fetchImpl: fetchMock as typeof fetch });
    expect(taskCreate.ok).toBe(true);
    if (taskCreate.ok) {
      expect(taskCreate.task.id).toBe("task-1");
    }
  });
});
