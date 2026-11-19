import type { RequestHandler, Response } from "express";
import { z } from "zod";
import {
  clampDays,
  describeDbError,
  MAX_FEEDBACK_NOTE,
  MAX_FEEDBACK_REPLY,
  MAX_MEETING_SUMMARY,
  MAX_MEETING_TRANSCRIPT,
  MAX_STORED_MEETINGS,
  MAX_STORED_MEMORIES,
  ownerOf,
  summarizeFeedback,
  type UserStore
} from "./userStore.js";

const STORE_UNAVAILABLE = "ระบบเก็บข้อมูลบนเซิร์ฟเวอร์ขัดข้องชั่วคราว ข้อมูลยังอยู่ในเครื่องนี้ กรุณาลองใหม่ภายหลัง";

const memoriesBodySchema = z.object({
  memories: z
    .array(
      z.object({
        id: z.string().max(20),
        // รับยาวกว่าเพดานได้เล็กน้อย แล้วตัดเหลือ 200 ตัวอักษรตอนทำความสะอาด
        text: z.string().max(1000),
        createdAt: z.number().finite().optional()
      })
    )
    .max(MAX_STORED_MEMORIES)
});

const meetingsBodySchema = z.object({
  meetings: z
    .array(
      z.object({
        id: z.string().max(64),
        startedAt: z.number().finite(),
        endedAt: z.number().finite().optional(),
        minutes: z.number().finite(),
        // หน้าเว็บอาจมีบันทึกยาวกว่าที่เซิร์ฟเวอร์เก็บ จึงรับไว้แล้วตัดตอนทำความสะอาด
        summary: z.string().max(MAX_MEETING_SUMMARY * 4),
        transcript: z.string().max(MAX_MEETING_TRANSCRIPT * 5)
      })
    )
    .max(MAX_STORED_MEETINGS)
});

const feedbackBodySchema = z.object({
  rating: z.enum(["up", "down"]),
  note: z.string().max(MAX_FEEDBACK_NOTE * 2).optional(),
  reply: z.string().max(4000).optional()
});

function failed(response: Response, error: unknown, action: string): void {
  console.warn(`${action} ไม่สำเร็จ`, describeDbError(error));
  response.status(503).json({ error: STORE_UNAVAILABLE });
}

/** เส้นทางความจำและคำติชม ทุกเส้นทางอยู่หลัง requireAuth และแยกข้อมูลตามชื่อผู้ใช้ที่เข้าสู่ระบบ */
export function createUserRoutes(getStore: () => UserStore) {
  const getMemories: RequestHandler = async (_request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      const memories = await getStore().getMemories(ownerOf(response.locals.userName));
      response.json({ memories, storage: getStore().kind });
    } catch (error) {
      failed(response, error, "อ่านความจำ");
    }
  };

  const putMemories: RequestHandler = async (request, response) => {
    response.set("Cache-Control", "no-store");
    const parsed = memoriesBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: `รายการความจำไม่ถูกต้อง (สูงสุด ${MAX_STORED_MEMORIES} เรื่อง)` });
      return;
    }
    try {
      const result = await getStore().putMemories(ownerOf(response.locals.userName), parsed.data.memories);
      response.json({ ...result, storage: getStore().kind });
    } catch (error) {
      failed(response, error, "บันทึกความจำ");
    }
  };

  const postFeedback: RequestHandler = async (request, response) => {
    response.set("Cache-Control", "no-store");
    const parsed = feedbackBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "คำติชมต้องเป็น up หรือ down และหมายเหตุไม่ยาวเกินไป" });
      return;
    }
    try {
      const record = await getStore().addFeedback(ownerOf(response.locals.userName), {
        rating: parsed.data.rating,
        note: parsed.data.note,
        reply: parsed.data.reply?.slice(0, MAX_FEEDBACK_REPLY * 2)
      });
      response.status(201).json({ ok: true, rating: record.rating, createdAt: record.createdAt });
    } catch (error) {
      failed(response, error, "บันทึกคำติชม");
    }
  };

  const feedbackSummary: RequestHandler = async (request, response) => {
    response.set("Cache-Control", "no-store");
    const days = clampDays(request.query.days);
    try {
      const records = await getStore().listFeedback({ user: ownerOf(response.locals.userName), days });
      response.json({ summary: summarizeFeedback(records, days), storage: getStore().kind });
    } catch (error) {
      failed(response, error, "อ่านสรุปคำติชม");
    }
  };

  const getMeetings: RequestHandler = async (_request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      const meetings = await getStore().getMeetings(ownerOf(response.locals.userName));
      response.json({ meetings, storage: getStore().kind });
    } catch (error) {
      failed(response, error, "อ่านประวัติประชุม");
    }
  };

  const putMeetings: RequestHandler = async (request, response) => {
    response.set("Cache-Control", "no-store");
    const parsed = meetingsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: `ประวัติประชุมไม่ถูกต้อง (สูงสุด ${MAX_STORED_MEETINGS} ครั้ง)` });
      return;
    }
    try {
      const meetings = await getStore().putMeetings(ownerOf(response.locals.userName), parsed.data.meetings);
      response.json({ meetings, storage: getStore().kind });
    } catch (error) {
      failed(response, error, "บันทึกประวัติประชุม");
    }
  };

  return { getMemories, putMemories, getMeetings, putMeetings, postFeedback, feedbackSummary };
}
