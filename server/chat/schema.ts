/**
 * รูปแบบคำขอของ /api/chat (แยกจาก server/chat.ts โดยพฤติกรรมไม่เปลี่ยน)
 */
import { z } from "zod";
import { meetingSchema } from "../meeting.js";
import { MAX_MEMORY_LENGTH } from "../responseStream.js";
import { MAX_READ_TEXT_LENGTH } from "../webReader.js";

export const MAX_CHAT_MESSAGES = 24;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_MEMORIES = 50;

export const pageFieldSchema = z.object({
  id: z.string().regex(/^f\d{1,3}$/),
  label: z.string().trim().min(1).max(120),
  type: z.string().max(20),
  options: z.array(z.string().max(80)).max(30).optional()
});

export const memorySchema = z.object({
  id: z.string().regex(/^m[a-z0-9]{1,12}$/),
  text: z.string().trim().min(1).max(MAX_MEMORY_LENGTH)
});

export const meetingHistoryItemSchema = z.object({
  id: z.string().max(64),
  startedAt: z.number().finite(),
  minutes: z.number().min(0).max(1440),
  summary: z.string().max(2000),
  transcript: z.string().max(4000)
});

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH)
      })
    )
    .min(1)
    .max(MAX_CHAT_MESSAGES)
    .refine((messages) => messages.at(-1)?.role === "user"),
  /** หน้าเว็บที่ผู้ใช้เปิดอยู่ในแอป (แอปเดสก์ท็อปส่งช่องกรอกและข้อความ เว็บในเบราว์เซอร์ส่งที่อยู่และชื่อหน้า) */
  page: z
    .object({
      url: z.string().max(2000),
      title: z.string().max(200),
      fields: z.array(pageFieldSchema).max(40),
      content: z.string().max(MAX_READ_TEXT_LENGTH + 500).optional()
    })
    .optional(),
  /** สรุปข้อมูลที่แสดงอยู่บนหน้าจอแอป Javis ตอนนี้ สำหรับคำสั่งอ่านหน้าจอ */
  screen: z.string().max(3000).optional(),
  /** ภาพหน้าจอ/โปรแกรมที่ผู้ใช้จับมาให้ AI อ่านและอธิบาย */
  image: z
    .object({
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z
        .string()
        .regex(/^[A-Za-z0-9+/=]+$/)
        .max(1_200_000)
    })
    .optional(),
  /** ความจำของผู้ใช้ที่เก็บอยู่ในอุปกรณ์ */
  memories: z.array(memorySchema).max(MAX_MEMORIES).optional(),
  /**
   * หน้าเว็บของผู้ใช้แสดงหน้าเว็บอื่นในกรอบของตัวเองได้ (เว็บในเบราว์เซอร์)
   * เซิร์ฟเวอร์จึงตรวจให้ว่าหน้าที่จะเปิดยอมให้แสดงในกรอบไหม แอปเดสก์ท็อปและแอปมือถือไม่ส่งค่านี้ เพราะมีวิธีเปิดหน้าของตัวเอง
   */
  frames: z.boolean().optional(),
  /**
   * โหมดสรุปการประชุม: บันทึกคำพูดที่หน้าเว็บจดไว้ ขอให้ AI สรุปครั้งเดียว (server/meeting.ts)
   * คำขอแบบนี้ไม่ใช้ประวัติบทสนทนา ไม่ค้นเว็บ และไม่ให้ AI เรียกเครื่องมือใด
   */
  meeting: meetingSchema.optional(),
  /** คลังประวัติสรุปการประชุมย้อนหลังจากอุปกรณ์ของผู้ใช้ สำหรับเครื่องมือ search_meeting_history */
  meetingHistory: z.array(meetingHistoryItemSchema).max(15).optional(),
  /** รหัสของช่องวินิจฉัยของผู้ดูแล แอปไม่ส่งค่านี้ */
  diagnose: z.string().max(200).optional(),
  /** โมเดลค้นเว็บที่ผู้ถือรหัสวินิจฉัยขอลองในคำขอนี้ คำขอที่ไม่มีรหัสจะถูกเมิน */
  searchModel: z
    .string()
    .regex(/^[A-Za-z0-9._/-]{1,100}$/)
    .optional()
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
