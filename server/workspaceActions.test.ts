import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeEventTime, pickCalendarEvent, thaiDateOf } from "./calendarChange.js";
import {
  addressesInText,
  buildRawEmail,
  checkNewEmailRecipients,
  extractAddress,
  isScopeError,
  replySubject,
  SEND_SCOPE_MISSING
} from "./emailDraft.js";
import {
  clearGoogleTokenCacheForTests,
  deleteCalendarEvent,
  findEmailToReply,
  sendGmailMessage,
  updateCalendarEvent
} from "./googleWorkspace.js";
import { createResponseReducer, DRAFT_EMAIL_TOOL, MANAGE_CALENDAR_TOOL } from "./responseStream.js";
import { describeWeatherCode, fetchWeather, readCoordinates } from "./weather.js";
import { ACTIONS_LOCKED_MESSAGE, createWorkspaceRoutes } from "./workspaceRoutes.js";

// ค่าทดสอบเท่านั้น ไม่ใช่ข้อมูลจริงของบัญชีใด
const ENV = {
  GOOGLE_CLIENT_ID: "cid-test",
  GOOGLE_CLIENT_SECRET: "csec-test",
  GOOGLE_REFRESH_TOKEN: "rtok-test-12345678",
  GOOGLE_ACCOUNT_EMAIL: "owner@example.com"
};

/** fetch จำลองของ Google: ตอบโทเค็นเสมอ แล้วให้ handler ตอบคำขออื่น */
function googleFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "token-test", expires_in: 3600 }), { status: 200 });
    }
    return handler(url, init);
  });
}

beforeEach(() => clearGoogleTokenCacheForTests());

describe("ผู้รับอีเมล: กันการถูกหลอกให้ส่งหาคนอื่น", () => {
  it("ยอมรับเฉพาะที่อยู่ที่ผู้ใช้พิมพ์หรือพูดเอง", () => {
    expect(checkNewEmailRecipients(["Boss@Example.com"], "ส่งเมลหา boss@example.com ว่าพรุ่งนี้ลาค่ะ")).toEqual({
      ok: true,
      to: ["boss@example.com"]
    });
  });

  it("ที่อยู่ที่ผู้ใช้ไม่ได้พูด (เช่นมาจากเนื้อหาอีเมลหรือหน้าเว็บ) ถูกปฏิเสธ", () => {
    expect(checkNewEmailRecipients(["attacker@evil.example"], "ส่งเมลหาหัวหน้าว่าพรุ่งนี้ลาค่ะ")).toEqual({
      ok: false,
      reason: "not-from-user",
      rejected: ["attacker@evil.example"]
    });
    expect(checkNewEmailRecipients(["boss@example.com", "attacker@evil.example"], "ส่งหา boss@example.com")).toMatchObject({
      ok: false,
      rejected: ["attacker@evil.example"]
    });
  });

  it("ไม่มีผู้รับ หรือผู้รับเกิน 5 คน: ไม่ร่าง", () => {
    expect(checkNewEmailRecipients([], "ส่งเมลหน่อย")).toMatchObject({ ok: false, reason: "none" });
    const many = ["a@x.co", "b@x.co", "c@x.co", "d@x.co", "e@x.co", "f@x.co"];
    expect(checkNewEmailRecipients(many, many.join(" "))).toMatchObject({ ok: false, reason: "too-many" });
  });

  it("อ่านที่อยู่จากหัว From และจากข้อความ", () => {
    expect(extractAddress("พี่เอ <A.Person@Example.com>")).toBe("a.person@example.com");
    expect(extractAddress("plain@example.com")).toBe("plain@example.com");
    expect(extractAddress("ไม่มีที่อยู่")).toBeNull();
    expect(addressesInText("ส่งหา x@a.co และ X@A.co กับ y@b.org")).toEqual(["x@a.co", "y@b.org"]);
  });
});

describe("สร้างอีเมลสำหรับ Gmail", () => {
  const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

  it("หัวเรื่องภาษาไทยเข้ารหัส และเนื้อหาเป็น base64 UTF-8", () => {
    const raw = decode(buildRawEmail({ from: "owner@example.com", to: ["boss@example.com"], subject: "ลาพรุ่งนี้", body: "สวัสดีค่ะ" }));
    expect(raw).toContain("To: boss@example.com");
    expect(raw).toContain("Subject: =?UTF-8?B?");
    const body = raw.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("สวัสดีค่ะ");
  });

  it("ตอบกลับในเธรดเดิม และกันการแทรกหัวอีเมลด้วยการขึ้นบรรทัดใหม่", () => {
    const raw = decode(
      buildRawEmail({
        from: "owner@example.com",
        to: ["boss@example.com"],
        subject: "Re: x\r\nBcc: attacker@evil.example",
        body: "ok",
        inReplyTo: "<m1@mail>"
      })
    );
    expect(raw).toContain("In-Reply-To: <m1@mail>");
    expect(raw).toContain("References: <m1@mail>");
    expect(raw).not.toMatch(/^Bcc:/m);
  });

  it("หัวเรื่องตอบกลับ", () => {
    expect(replySubject("ประชุมพรุ่งนี้")).toBe("Re: ประชุมพรุ่งนี้");
    expect(replySubject("RE: เดิม")).toBe("RE: เดิม");
  });
});

describe("Gmail และ Calendar (เรียกหลังผู้ใช้กดยืนยันเท่านั้น)", () => {
  it("สิทธิ์ส่งอีเมลไม่พอ: ได้ข้อความภาษาไทยบอกวิธีขอสิทธิ์ใหม่", async () => {
    const fetchImpl = googleFetch(() => new Response('{"error":{"status":"PERMISSION_DENIED","message":"Request had insufficient authentication scopes."}}', { status: 403 }));
    const result = await sendGmailMessage("cmF3", undefined, { env: ENV, fetchImpl });
    expect(result).toMatchObject({ ok: false, code: "scope", error: SEND_SCOPE_MISSING });
    expect(SEND_SCOPE_MISSING).toContain("google-auth-setup");
    expect(isScopeError(403, "insufficient authentication scopes")).toBe(true);
    expect(isScopeError(403, "rate limited")).toBe(false);
  });

  it("ส่งอีเมลสำเร็จ: ส่ง raw และ threadId ไปที่ Gmail", async () => {
    const fetchImpl = googleFetch(() => new Response(JSON.stringify({ id: "sent-1" }), { status: 200 }));
    const result = await sendGmailMessage("cmF3", "thread-9", { env: ENV, fetchImpl });
    expect(result).toEqual({ ok: true, accountEmail: "owner@example.com", id: "sent-1" });
    const sendCall = fetchImpl.mock.calls.find(([url]) => String(url).includes("/messages/send"))!;
    expect(JSON.parse(String(sendCall[1]?.body))).toEqual({ raw: "cmF3", threadId: "thread-9" });
  });

  it("หาอีเมลที่จะตอบ: ได้ผู้ส่ง หัวเรื่อง Message-ID และเธรด", async () => {
    const fetchImpl = googleFetch((url) =>
      url.includes("/messages?")
        ? new Response(JSON.stringify({ messages: [{ id: "m1" }] }))
        : new Response(
            JSON.stringify({
              id: "m1",
              threadId: "t1",
              payload: {
                headers: [
                  { name: "From", value: "พี่เอ <a@example.com>" },
                  { name: "Subject", value: "งานด่วน" },
                  { name: "Message-ID", value: "<m1@mail>" }
                ]
              }
            })
          )
    );
    const found = await findEmailToReply("from:a@example.com", { env: ENV, fetchImpl });
    expect(found).toMatchObject({ ok: true, target: { id: "m1", threadId: "t1", from: "พี่เอ <a@example.com>", subject: "งานด่วน", messageId: "<m1@mail>" } });
  });

  it("ไม่พบอีเมลที่จะตอบ: บอกให้ระบุชัดขึ้น", async () => {
    const fetchImpl = googleFetch(() => new Response(JSON.stringify({})));
    expect(await findEmailToReply("from:nobody", { env: ENV, fetchImpl })).toMatchObject({ ok: false, code: "not-found" });
  });

  it("เลื่อนนัด: PATCH เวลาใหม่ในโซนไทย", async () => {
    const fetchImpl = googleFetch(() => new Response(JSON.stringify({ id: "e1", summary: "ประชุม", start: { dateTime: "2026-11-22T16:00:00+07:00" }, end: { dateTime: "2026-11-22T17:00:00+07:00" } })));
    const result = await updateCalendarEvent("e1", { startIso: "2026-11-22T16:00:00+07:00" }, { env: ENV, fetchImpl });
    expect(result).toMatchObject({ ok: true, event: { id: "e1", start: "2026-11-22T16:00:00+07:00" } });
    const call = fetchImpl.mock.calls.find(([url]) => String(url).includes("/events/e1"))!;
    expect(call[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(call[1]?.body))).toEqual({ start: { dateTime: "2026-11-22T16:00:00+07:00", timeZone: "Asia/Bangkok" } });
  });

  it("ยกเลิกนัดที่ไม่มีแล้ว: บอกว่าไม่พบ", async () => {
    const fetchImpl = googleFetch(() => new Response("", { status: 410 }));
    expect(await deleteCalendarEvent("gone", { env: ENV, fetchImpl })).toMatchObject({ ok: false, code: "not-found" });
  });
});

describe("เลือกนัดที่ผู้ใช้หมายถึง", () => {
  const events = [
    { id: "e1", title: "ประชุมทีม", start: "2026-11-22T14:00:00+07:00", end: "2026-11-22T15:00:00+07:00" },
    { id: "e2", title: "ประชุม ลูกค้า", start: "2026-11-23T10:00:00+07:00", end: "2026-11-23T11:00:00+07:00" },
    { id: "e3", title: "หาหมอฟัน", start: "2026-11-24", end: "2026-11-25" }
  ];

  it("ตรงอันเดียว / ไม่ตรง / ตรงหลายอัน (ต้องถามก่อน)", () => {
    expect(pickCalendarEvent(events, "หมอฟัน")).toMatchObject({ kind: "one", event: { id: "e3" } });
    expect(pickCalendarEvent(events, "ตีกอล์ฟ")).toEqual({ kind: "none" });
    expect(pickCalendarEvent(events, "ประชุม")).toMatchObject({ kind: "many" });
    expect(pickCalendarEvent(events, "ประชุมลูกค้า")).toMatchObject({ kind: "one", event: { id: "e2" } });
  });

  it("ใช้วันที่แยกนัดชื่อซ้ำ", () => {
    expect(pickCalendarEvent(events, "ประชุม", "2026-11-22")).toMatchObject({ kind: "one", event: { id: "e1" } });
    expect(thaiDateOf("2026-11-22T20:00:00Z")).toBe("2026-11-23");
  });

  it("อธิบายเวลาเป็นภาษาไทย", () => {
    expect(describeEventTime("2026-11-22T14:00:00+07:00")).toBe("22 พ.ย. 14:00 น.");
    expect(describeEventTime("2026-11-24")).toBe("24 พ.ย. (ทั้งวัน)");
  });
});

describe("เครื่องมือที่ AI เรียก: ร่างอย่างเดียว ไม่ส่งหรือแก้เอง", () => {
  const call = (name: string, args: Record<string, unknown>) => ({
    type: "response.output_item.done",
    item: { type: "function_call", name, arguments: JSON.stringify(args), call_id: "c1" }
  });

  it("อ่านคำขอร่างอีเมลและคำขอเลื่อนนัด", () => {
    const reducer = createResponseReducer();
    reducer.push(call(DRAFT_EMAIL_TOOL, { mode: "reply", reply_query: "from:a@example.com", to: [], subject: "", body: "ได้ค่ะ" }));
    expect(reducer.emailDraftRequest).toEqual({ mode: "reply", replyQuery: "from:a@example.com", to: [], subject: "", body: "ได้ค่ะ" });

    const calendar = createResponseReducer();
    calendar.push(
      call(MANAGE_CALENDAR_TOOL, {
        action: "update",
        days: 7,
        title: "",
        start_iso: "2026-11-22T16:00:00+07:00",
        end_iso: "",
        description: "",
        location: "",
        event_query: "ประชุมทีม",
        event_date: "2026-11-22"
      })
    );
    expect(calendar.calendarRequest).toMatchObject({ action: "update", eventQuery: "ประชุมทีม", eventDate: "2026-11-22", startIso: "2026-11-22T16:00:00+07:00" });
  });
});

describe("endpoint ส่งอีเมลและแก้ปฏิทิน", () => {
  const notes = () => ({ kind: "memory" }) as never;
  const response = () => {
    const res = { statusCode: 200, body: undefined as unknown, status: vi.fn(), json: vi.fn(), set: vi.fn() };
    res.status.mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    });
    res.json.mockImplementation((body: unknown) => {
      res.body = body;
      return res;
    });
    res.set.mockReturnValue(res);
    return res;
  };

  it("เว็บสาธารณะที่ไม่ตั้งรหัสเข้าใช้: ไม่ส่งอีเมลและไม่แก้ปฏิทิน", async () => {
    const routes = createWorkspaceRoutes(notes, undefined, () => false);
    const send = response();
    await routes.sendEmail({ body: { to: ["a@example.com"], subject: "x", body: "y" } } as never, send as never, vi.fn());
    expect(send.statusCode).toBe(403);
    expect(send.body).toMatchObject({ ok: false, error: ACTIONS_LOCKED_MESSAGE });

    const change = response();
    await routes.changeCalendar({ body: { action: "delete", eventId: "e1" } } as never, change as never, vi.fn());
    expect(change.statusCode).toBe(403);
  });

  it("ข้อมูลไม่ถูกต้อง: ปฏิเสธก่อนติดต่อ Google", async () => {
    const routes = createWorkspaceRoutes(notes, undefined, () => true);
    const res = response();
    await routes.sendEmail({ body: { to: ["not-an-email"], subject: "x", body: "y" } } as never, res as never, vi.fn());
    expect(res.statusCode).toBe(400);
  });
});

describe("อากาศสำหรับสรุปเช้า", () => {
  it("พิกัดถูกปัดและตรวจช่วง", () => {
    expect(readCoordinates("13.756331", "100.501762")).toEqual({ lat: 13.76, lon: 100.5 });
    expect(readCoordinates("abc", "1")).toBeNull();
    expect(readCoordinates("95", "1")).toBeNull();
  });

  it("แปลงข้อมูล Open-Meteo เป็นสรุปภาษาไทย และล้มเหลวแบบเงียบ", async () => {
    const ok = vi.fn(async () =>
      new Response(
        JSON.stringify({
          current: { temperature_2m: 31.6, weather_code: 61 },
          daily: { temperature_2m_max: [34.2], temperature_2m_min: [26.4], precipitation_probability_max: [70] }
        })
      )
    );
    expect(await fetchWeather({ lat: 13.76, lon: 100.5 }, ok as never)).toEqual({ temperature: 32, max: 34, min: 26, rainChance: 70, description: "ฝนตก" });
    expect(await fetchWeather({ lat: 1, lon: 1 }, (async () => new Response("", { status: 500 })) as never)).toBeNull();
    expect(await fetchWeather({ lat: 1, lon: 1 }, (async () => { throw new Error("offline"); }) as never)).toBeNull();
    expect(describeWeatherCode(0)).toBe("ท้องฟ้าแจ่มใส");
  });
});
