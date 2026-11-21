import { describe, expect, it, vi } from "vitest";
import { readCalendarChange, readEmailDraft } from "../services/chatEvents";
import type { SpeechRecognizer, SpeechSynthesizer } from "../speech/types";
import { ConversationController } from "./controller";
import type { CalendarChangeProposal, ChatStreamOptions, EmailDraft } from "./types";

const DRAFT: EmailDraft = {
  id: "d1",
  mode: "reply",
  to: ["a@example.com"],
  subject: "Re: งานด่วน",
  body: "ได้ค่ะ",
  original: { from: "พี่เอ <a@example.com>", subject: "งานด่วน" },
  threadId: "t1"
};

const CHANGE: CalendarChangeProposal = {
  id: "c1",
  action: "update",
  eventId: "e1",
  before: { title: "ประชุมทีม", start: "2026-11-22T14:00:00+07:00", end: "2026-11-22T15:00:00+07:00" },
  after: { title: "ประชุมทีม", start: "2026-11-22T16:00:00+07:00", end: "2026-11-22T17:00:00+07:00" }
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** ตัวควบคุมที่คำตอบของ AI ส่งเหตุการณ์ที่กำหนดมา แล้วจบ */
function setup(events: unknown[]) {
  const recognizer: SpeechRecognizer = {
    prepare: async () => undefined,
    isOnDevice: () => false,
    listen: () => new Promise<string>(() => undefined),
    stop: () => undefined,
    cancel: () => undefined
  };
  const synthesizer = {
    listVoices: async () => [],
    applySettings: () => undefined,
    prepare: async () => true,
    speak: vi.fn(async () => undefined),
    cancel: () => undefined
  } as unknown as SpeechSynthesizer & { speak: ReturnType<typeof vi.fn> };
  const sendEmail = vi.fn(async () => ({ ok: true, message: "ส่งอีเมลถึง a@example.com เรียบร้อยแล้วค่ะ" }));
  const changeCalendar = vi.fn(async () => ({ ok: true, message: "เปลี่ยนนัด ประชุมทีม ให้แล้วค่ะ" }));
  const controller = new ConversationController({
    recognizer,
    synthesizer,
    chat: async (_messages, options: ChatStreamOptions) => {
      events.forEach((event) => options.onEvent(event as never));
      return "";
    },
    openPage: () => true,
    sendEmail,
    changeCalendar
  });
  return { controller, sendEmail, changeCalendar, synthesizer };
}

describe("การ์ดร่างอีเมล", () => {
  it("AI ร่างอีเมล: แสดงการ์ดรอผู้ใช้ และไม่ส่งเอง", async () => {
    const { controller, sendEmail } = setup([{ type: "delta", text: "ร่างให้แล้วค่ะ" }, { type: "email_draft", draft: DRAFT }]);
    controller.sendText("ตอบเมลพี่เอว่าได้ค่ะ");
    await settle();
    expect(controller.getState().pendingEmailDraft).toEqual(DRAFT);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("คำพูดว่า ยืนยัน ไม่ส่งอีเมล ต้องกดปุ่มส่งในการ์ดเท่านั้น", async () => {
    const { controller, sendEmail } = setup([{ type: "email_draft", draft: DRAFT }]);
    controller.sendText("ตอบเมลพี่เอ");
    await settle();
    controller.sendText("ยืนยัน");
    await settle();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("กดส่ง: ส่งตามที่ผู้ใช้แก้ แล้วปิดการ์ดและบอกผล", async () => {
    const { controller, sendEmail, synthesizer } = setup([{ type: "email_draft", draft: DRAFT }]);
    controller.sendText("ตอบเมลพี่เอ");
    await settle();
    await controller.sendEmailDraft({ subject: "Re: งานด่วน", body: "ได้ค่ะ พรุ่งนี้ส่งให้นะคะ" });
    expect(sendEmail).toHaveBeenCalledWith({ ...DRAFT, body: "ได้ค่ะ พรุ่งนี้ส่งให้นะคะ" });
    expect(controller.getState().pendingEmailDraft).toBeNull();
    expect(synthesizer.speak).toHaveBeenCalledWith("ส่งอีเมลถึง a@example.com เรียบร้อยแล้วค่ะ");
  });

  it("ส่งไม่สำเร็จ (เช่นยังไม่มีสิทธิ์): คงการ์ดไว้ให้ลองใหม่ และบอกสาเหตุ", async () => {
    const { controller, sendEmail } = setup([{ type: "email_draft", draft: DRAFT }]);
    sendEmail.mockResolvedValueOnce({ ok: false, message: "ลูน่ายังไม่มีสิทธิ์ส่งอีเมลจาก Gmail ค่ะ" });
    controller.sendText("ตอบเมลพี่เอ");
    await settle();
    await controller.sendEmailDraft();
    expect(controller.getState().pendingEmailDraft).toEqual(DRAFT);
    expect(controller.getState().notice).toEqual({ tone: "error", text: "ลูน่ายังไม่มีสิทธิ์ส่งอีเมลจาก Gmail ค่ะ" });
  });

  it("กดยกเลิก: ไม่ส่งและปิดการ์ด", async () => {
    const { controller, sendEmail } = setup([{ type: "email_draft", draft: DRAFT }]);
    controller.sendText("ตอบเมลพี่เอ");
    await settle();
    controller.cancelEmailDraft();
    expect(controller.getState().pendingEmailDraft).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("การ์ดเปลี่ยนนัด", () => {
  it("แสดงการ์ด ไม่แก้ปฏิทินจนกว่าจะกดยืนยัน", async () => {
    const { controller, changeCalendar } = setup([{ type: "calendar_change", change: CHANGE }]);
    controller.sendText("เลื่อนประชุมทีมเป็นสี่โมง");
    await settle();
    expect(controller.getState().pendingCalendarChange).toEqual(CHANGE);
    expect(changeCalendar).not.toHaveBeenCalled();

    await controller.confirmCalendarChange();
    expect(changeCalendar).toHaveBeenCalledWith(CHANGE);
    expect(controller.getState().pendingCalendarChange).toBeNull();
  });

  it("กดไม่ต้องเปลี่ยน: ปฏิทินเหมือนเดิม", async () => {
    const { controller, changeCalendar } = setup([{ type: "calendar_change", change: { ...CHANGE, action: "delete", after: undefined } }]);
    controller.sendText("ยกเลิกประชุมทีม");
    await settle();
    controller.cancelCalendarChange();
    expect(controller.getState().pendingCalendarChange).toBeNull();
    expect(changeCalendar).not.toHaveBeenCalled();
  });
});

describe("ตรวจข้อมูลการ์ดจากเซิร์ฟเวอร์", () => {
  it("ร่างอีเมลที่ผู้รับผิดรูปแบบหรือว่าง: ไม่แสดงการ์ด", () => {
    expect(readEmailDraft(DRAFT)).toEqual(DRAFT);
    expect(readEmailDraft({ ...DRAFT, to: ["not-an-email"] })).toBeNull();
    expect(readEmailDraft({ ...DRAFT, to: ["a@example.com", 5] })).toBeNull();
    expect(readEmailDraft({ ...DRAFT, to: [] })).toBeNull();
    expect(readEmailDraft({ ...DRAFT, body: "" })).toBeNull();
  });

  it("ข้อเสนอเปลี่ยนนัด: update ต้องมีค่าใหม่", () => {
    expect(readCalendarChange(CHANGE)).toEqual(CHANGE);
    expect(readCalendarChange({ ...CHANGE, after: undefined })).toBeNull();
    expect(readCalendarChange({ ...CHANGE, action: "delete", after: undefined })).toMatchObject({ action: "delete" });
    expect(readCalendarChange({ ...CHANGE, action: "drop" })).toBeNull();
  });
});
