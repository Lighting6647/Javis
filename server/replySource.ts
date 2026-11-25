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

/** ตัวแปลงสตรีมของผู้ให้บริการรายหนึ่ง เป็นเหตุการณ์แบบ Responses ที่ตัวประมวลผลคำตอบเข้าใจ */
export interface StreamTranslator {
  /** รับข้อมูลหนึ่งก้อนจากสตรีม คืนเหตุการณ์ที่แปลงแล้ว */
  push(chunk: unknown): unknown[];
  /** เรียกเมื่อสตรีมจบ คืนเหตุการณ์ปิดท้ายถ้าต้นทางจบโดยไม่บอกเหตุผล */
  finish(): unknown[];
}

/** พอสำหรับข้อผิดพลาดที่ต่อท้าย พร้อมบรรทัดข้อมูลก่อนหน้า */
const MAX_TAIL_LENGTH = 16_000;

/**
 * ต้นทางล้มเหลวกลางสตรีมแล้วต่อท้ายด้วย JSON ของข้อผิดพลาดดิบ ๆ ที่ไม่ใช่รูปแบบ SSE (Gemini ทำแบบนี้เมื่อคนใช้เยอะ)
 * ถ้าไม่อ่านส่วนนี้ คำตอบที่ขาดกลางประโยคจะถูกนับว่าจบปกติ
 */
function readTrailingError(rest: string): unknown {
  // ตัดบรรทัดข้อมูล SSE สุดท้ายออก เหลือเฉพาะส่วนที่ต่อท้าย
  const lines = rest.split(/\r?\n/);
  const lastData = lines.findLastIndex((line) => line.startsWith("data:"));
  const text = lines.slice(lastData + 1).join("\n").trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const payload: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
    return typeof payload === "object" && payload !== null && "error" in payload ? payload : null;
  } catch {
    return null;
  }
}

/** อ่านสตรีม SSE จากต้นทางทีละเหตุการณ์ หยุดเมื่อ onEvent คืน true */
async function readSseEvents(body: ReadableStream<Uint8Array>, onEvent: (event: unknown) => boolean): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  /** ท้ายสตรีมแบบดิบ ใช้หาข้อผิดพลาดที่ต่อท้ายมา */
  let tail = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        const failure = readTrailingError(tail + decoder.decode());
        if (failure) onEvent(failure);
        return;
      }

      const text = decoder.decode(value, { stream: true });
      tail = (tail + text).slice(-MAX_TAIL_LENGTH);
      const chunk = parseSseChunk(buffer + text);
      buffer = chunk.rest;
      for (const event of chunk.events) {
        if (onEvent(event)) return;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** อ่านสตรีมของผู้ให้บริการที่ใช้รูปแบบของตัวเอง แล้วแปลงเป็นเหตุการณ์แบบ Responses */
async function readTranslatedEvents(
  body: ReadableStream<Uint8Array>,
  translator: StreamTranslator,
  onEvent: (event: unknown) => boolean
): Promise<void> {
  let stopped = false;
  const forward = (events: unknown[]) => {
    stopped = events.some((event) => onEvent(event));
    return stopped;
  };

  await readSseEvents(body, (chunk) => forward(translator.push(chunk)));
  // ต้นทางบางรายปิดสตรีมโดยไม่บอกเหตุผลการจบ ต้องปิดท้ายให้เอง
  if (!stopped) forward(translator.finish());
}

/** หัวคำขอแบบที่ผู้ให้บริการส่วนใหญ่ใช้: กุญแจแบบ Bearer */
export function bearerHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

export interface HttpReplyRequest {
  /** ที่อยู่เต็มของปลายทาง */
  url: string;
  /** หัวคำขอ รวมการยืนยันตัวตนตามแบบของผู้ให้บริการ */
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
  /** ตัวแปลงสตรีม ไม่ต้องระบุถ้าต้นทางตอบเป็นเหตุการณ์แบบ Responses อยู่แล้ว */
  translator?: StreamTranslator;
  fetchImpl?: typeof fetch;
}

/**
 * ขอคำตอบจากผู้ให้บริการที่คุยด้วย HTTP โดยตรง
 * throw เมื่อเชื่อมต่อไม่ได้ ส่วนคำขอที่ต้นทางปฏิเสธจะคืนเป็นผลลัพธ์พร้อมรหัสข้อผิดพลาด
 */
export async function startHttpReply(request: HttpReplyRequest): Promise<ReplyStart> {
  const upstream = await (request.fetchImpl ?? fetch)(request.url, {
    method: "POST",
    signal: request.signal,
    headers: request.headers,
    body: JSON.stringify(request.body)
  });

  const { body } = upstream;
  if (!upstream.ok || !body) {
    return { ok: false, status: upstream.status, rejection: await readRejection(upstream) };
  }

  const { translator } = request;
  return {
    ok: true,
    events: {
      read: (onEvent) => (translator ? readTranslatedEvents(body, translator, onEvent) : readSseEvents(body, onEvent)),
      cancel: () => body.cancel().catch(() => undefined)
    }
  };
}
