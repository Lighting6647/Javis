import type { RequestHandler } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { parseSseChunk } from "./sse.js";

export const MAX_CHAT_MESSAGES = 24;
export const MAX_MESSAGE_LENGTH = 2000;

const UPSTREAM_TIMEOUT_MS = 60_000;
const MAX_REPLY_TOKENS = 800;

const SYSTEM_INSTRUCTIONS = [
  "คุณคือ Javis ผู้ช่วย AI ภาษาไทยที่สุภาพ อบอุ่น และเป็นธรรมชาติ",
  "คำตอบของคุณจะถูกอ่านออกเสียงให้ผู้ใช้ฟังทันที จึงต้องตอบเป็นภาษาพูด สั้น กระชับ ไม่เกินสามถึงสี่ประโยค",
  "เว้นวรรคระหว่างประโยคเสมอ ห้ามใช้ Markdown รายการหัวข้อ ตาราง อีโมจิ หรือสัญลักษณ์พิเศษ",
  "ตอบเป็นภาษาไทยเป็นหลัก หากผู้ใช้ขอภาษาอื่นจึงค่อยเปลี่ยนภาษา",
  "ถ้าคำถามไม่ชัดเจนให้ถามกลับทีละคำถาม และห้ามอ้างว่าทำสิ่งที่ไม่ได้ทำจริง"
].join(" ");

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
    .refine((messages) => messages.at(-1)?.role === "user")
});

/** รับประวัติบทสนทนา แล้วสตรีมคำตอบของ AI กลับเป็นข้อความล้วนทีละส่วน */
export const chatHandler: RequestHandler = async (request, response) => {
  if (!config.apiKey) {
    response.status(500).json({ error: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY บนเซิร์ฟเวอร์" });
    return;
  }

  const parsed = chatRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "ข้อความที่ส่งมาไม่ถูกต้องหรือยาวเกินไป" });
    return;
  }

  // ผู้ใช้ปิดหน้าหรือพูดแทรก: หยุดขอคำตอบจากต้นทางทันทีเพื่อไม่ให้เสียค่าใช้จ่ายเปล่า
  const clientGone = new AbortController();
  response.on("close", () => clientGone.abort());

  let upstream: Response;
  try {
    upstream = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.any([clientGone.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.chatModel,
        stream: true,
        max_completion_tokens: MAX_REPLY_TOKENS,
        messages: [{ role: "system", content: SYSTEM_INSTRUCTIONS }, ...parsed.data.messages]
      })
    });
  } catch (error) {
    if (clientGone.signal.aborted) return;
    console.error("Chat upstream error", error instanceof Error ? error.message : "unknown");
    response.status(502).json({ error: "เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาลองใหม่" });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    console.error("Chat upstream failed", upstream.status);
    const busy = upstream.status === 429;
    response.status(busy ? 503 : 502).json({
      error: busy
        ? "บริการ AI มีผู้ใช้งานหนาแน่น กรุณาลองใหม่ในอีกสักครู่"
        : "บริการ AI ตอบกลับผิดพลาด กรุณาลองใหม่"
    });
    return;
  }

  response.status(200).set({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no"
  });
  response.flushHeaders();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const result = parseSseChunk(buffer + decoder.decode(value, { stream: true }));
      buffer = result.rest;
      for (const delta of result.deltas) response.write(delta);
      if (result.done) break;
    }
    response.end();
  } catch (error) {
    if (!clientGone.signal.aborted) {
      console.error("Chat stream interrupted", error instanceof Error ? error.message : "unknown");
    }
    // ตัดการเชื่อมต่อแทนการจบปกติ เพื่อให้ฝั่งผู้ใช้รู้ว่าคำตอบมาไม่ครบ
    response.destroy();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
};
