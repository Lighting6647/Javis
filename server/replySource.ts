import { createChatCompletionsTranslator } from "./chatCompletions.js";
import { parseSseChunk } from "./sse.js";
import { readRejection, type UpstreamRejection } from "./upstreamError.js";

/** สตรีมคำตอบของ AI หนึ่งรอบ ในรูปเหตุการณ์แบบ Responses ไม่ว่าผู้ให้บริการจะใช้รูปแบบใด */
export interface ReplyEvents {
  /** อ่านเหตุการณ์ทีละรายการจนจบ หยุดก่อนได้เมื่อ onEvent คืน true */
  read(onEvent: (event: unknown) => boolean): Promise<void>;
  /** เลิกอ่านโดยไม่ใช้คำตอบ */
  cancel(): Promise<void>;
}

/**
 * ผลของการขอคำตอบหนึ่งรอบ: ต้นทางรับคำขอแล้วเริ่มตอบ หรือปฏิเสธตั้งแต่ต้น
 * ส่วนที่ประมวลผลคำตอบจึงเขียนไว้ชุดเดียว ใช้ได้กับผู้ให้บริการทุกราย
 */
export type ReplyStart =
  | { ok: true; events: ReplyEvents }
  | {
      ok: false;
      /** รหัสสถานะ HTTP ของต้นทาง */
      status: number;
      rejection: UpstreamRejection;
    };

/** อ่านสตรีม SSE จากต้นทางทีละเหตุการณ์ หยุดเมื่อ onEvent คืน true */
async function readSseEvents(body: ReadableStream<Uint8Array>, onEvent: (event: unknown) => boolean): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;

      const chunk = parseSseChunk(buffer + decoder.decode(value, { stream: true }));
      buffer = chunk.rest;
      for (const event of chunk.events) {
        if (onEvent(event)) return;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** อ่านสตรีมแบบ Chat Completions แล้วแปลงเป็นเหตุการณ์แบบ Responses */
async function readChatCompletionEvents(body: ReadableStream<Uint8Array>, onEvent: (event: unknown) => boolean): Promise<void> {
  const translator = createChatCompletionsTranslator();
  let stopped = false;
  const forward = (events: unknown[]) => {
    stopped = events.some((event) => onEvent(event));
    return stopped;
  };

  await readSseEvents(body, (chunk) => forward(translator.push(chunk)));
  // ต้นทางบางรายปิดสตรีมโดยไม่บอกเหตุผลการจบ ต้องปิดท้ายให้เอง
  if (!stopped) forward(translator.finish());
}

export interface HttpReplyRequest {
  /** ที่อยู่เต็มของปลายทาง */
  url: string;
  apiKey: string;
  body: unknown;
  signal: AbortSignal;
  /** รูปแบบของสตรีมที่ต้นทางตอบกลับ */
  style: "responses" | "chat";
  fetchImpl?: typeof fetch;
}

/**
 * ขอคำตอบจากผู้ให้บริการที่คุยด้วย HTTP โดยตรง (OpenAI และรายที่เข้ากันได้)
 * throw เมื่อเชื่อมต่อไม่ได้ ส่วนคำขอที่ต้นทางปฏิเสธจะคืนเป็นผลลัพธ์พร้อมรหัสข้อผิดพลาด
 */
export async function startHttpReply(request: HttpReplyRequest): Promise<ReplyStart> {
  const upstream = await (request.fetchImpl ?? fetch)(request.url, {
    method: "POST",
    signal: request.signal,
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request.body)
  });

  const { body } = upstream;
  if (!upstream.ok || !body) {
    return { ok: false, status: upstream.status, rejection: await readRejection(upstream) };
  }

  const read = request.style === "chat" ? readChatCompletionEvents : readSseEvents;
  return {
    ok: true,
    events: {
      read: (onEvent) => read(body, onEvent),
      cancel: () => body.cancel().catch(() => undefined)
    }
  };
}
