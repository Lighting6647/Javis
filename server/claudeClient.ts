/**
 * ส่วนที่คุยกับ Claude ของ Anthropic ผ่าน SDK ทางการ
 * รับคำขอที่ claudeMessages.ts เตรียมไว้ เปิดสตรีม แล้วส่งคำตอบออกมาเป็นเหตุการณ์แบบ Responses
 * เหมือนผู้ให้บริการรายอื่น ส่วนที่ประมวลผลคำตอบจึงไม่ต้องรู้ว่ากำลังใช้รายใด
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AccountProbe, AiServiceState } from "./aiAccount.js";
import {
  claudeErrorCodes,
  type ClaudeRequest,
  type ClaudeRequestOptions,
  createClaudeTranslator,
  toClaudeRequest
} from "./claudeMessages.js";
import type { ReplyStart } from "./replySource.js";
import { describeUpstreamFailure, sanitizeUpstreamMessage, type UpstreamRejection, type UpstreamService } from "./upstreamError.js";

type ClaudeStreamEvent = Anthropic.Beta.Messages.BetaRawMessageStreamEvent;
type ClaudeMessageContent = Anthropic.Beta.Messages.BetaMessageContentParam;
type ClaudeApiError = InstanceType<typeof Anthropic.APIError>;

export interface ClaudeConnection {
  apiKey: string;
  baseUrl: string;
  /** ตัวส่งคำขอสำหรับการทดสอบ ปกติใช้ fetch ของระบบ */
  fetchImpl?: typeof fetch;
}

/** ผู้ใช้กำลังรอฟังคำตอบ จึงลองใหม่เองเพียงครั้งเดียวเมื่อ Anthropic ไม่ว่างชั่วคราว */
const REPLY_RETRIES = 1;
/**
 * การค้นเว็บทำงานฝั่ง Anthropic ได้คราวละจำนวนรอบจำกัด ถ้าเกินจะหยุดพัก (pause_turn) และต้องส่งคำตอบที่ได้กลับไปให้ทำต่อ
 * จำกัดจำนวนครั้งที่ทำต่อ ไม่ให้คำถามเดียววนไม่จบ
 */
const MAX_CONTINUATIONS = 2;
/** สตรีมขาดกลางทาง หรืออาร์กิวเมนต์ของเครื่องมือที่ Claude ส่งมาอ่านไม่ได้: ขอคำตอบรอบนั้นใหม่ได้กี่ครั้ง */
const MAX_STREAM_RETRIES = 1;
const ACCOUNT_CHECK_TIMEOUT_MS = 10_000;
/** จำนวนโทเค็นคำตอบของคำขอตรวจเครดิต ตั้งให้น้อยที่สุดเพื่อให้การตรวจแทบไม่มีค่าใช้จ่าย */
const CREDIT_PROBE_TOKENS = 16;

function createClient(connection: ClaudeConnection, maxRetries: number, timeoutMs: number): Anthropic {
  return new Anthropic({
    apiKey: connection.apiKey,
    baseURL: connection.baseUrl,
    maxRetries,
    timeout: timeoutMs,
    ...(connection.fetchImpl ? { fetch: connection.fetchImpl } : {})
  });
}

/** ต้นทางตอบกลับมาเป็นข้อผิดพลาด (ต่างจากเชื่อมต่อไม่ได้หรือถูกยกเลิก ซึ่งไม่มีคำตอบจากต้นทาง) */
function isUpstreamError(error: unknown): error is ClaudeApiError {
  return (
    error instanceof Anthropic.APIError &&
    !(error instanceof Anthropic.APIConnectionError) &&
    !(error instanceof Anthropic.APIUserAbortError)
  );
}

function rejectionOf(error: ClaudeApiError): UpstreamRejection {
  // ข้อความของต้นทางใช้เฉพาะใน log ของผู้ดูแล หลังปิดบังสิ่งที่ดูเหมือนกุญแจแล้ว
  return { codes: claudeErrorCodes(error), logDetail: sanitizeUpstreamMessage(error.apiMessage) };
}

export interface ClaudeReplyRequest extends ClaudeRequestOptions {
  connection: ClaudeConnection;
  signal: AbortSignal;
  timeoutMs: number;
  /** พูดประโยคขออภัยเมื่อ Claude ปฏิเสธคำขอ ปิดในรอบตอบต่อที่มีประโยคสำรองของตัวเองอยู่แล้ว */
  speakRefusal?: boolean;
}

/**
 * ขอคำตอบจาก Claude แบบสตรีม
 * throw เมื่อเชื่อมต่อไม่ได้หรือถูกยกเลิก ส่วนคำขอที่ Anthropic ปฏิเสธจะคืนเป็นผลลัพธ์พร้อมรหัสข้อผิดพลาด
 */
export async function startClaudeReply(request: ClaudeReplyRequest): Promise<ReplyStart> {
  const { connection, signal, timeoutMs, speakRefusal, ...options } = request;
  const client = createClient(connection, REPLY_RETRIES, timeoutMs);
  const body = toClaudeRequest(options);

  const openStream = (messages: ClaudeRequest["messages"]) => {
    const stream = client.beta.messages.stream({ ...body, messages }, { signal });
    // ข้อผิดพลาดถูกส่งต่อผ่านการอ่านเหตุการณ์และ finalMessage() ด้านล่าง ตัวรับนี้กันไม่ให้ Node มองว่าไม่มีใครจัดการ
    stream.on("error", () => undefined);
    stream.on("abort", () => undefined);
    return { stream, iterator: stream[Symbol.asyncIterator]() };
  };

  let current = openStream(body.messages);
  let first: IteratorResult<ClaudeStreamEvent>;
  try {
    // คำขอที่ถูกปฏิเสธจะรู้ผลตรงนี้ ก่อนที่จะเปิดสตรีมให้แอป จึงยังตอบเป็นข้อผิดพลาดที่มีข้อความชัดเจนได้
    first = await current.iterator.next();
    // สตรีมปิดโดยไม่มีเหตุการณ์: ให้ SDK บอกสาเหตุ
    if (first.done) await current.stream.finalMessage();
  } catch (error) {
    // สถานะ 0 = Anthropic รับคำขอแล้วแจ้งล้มเหลวเป็นเหตุการณ์แรกของสตรีม สาเหตุอยู่ในรหัสข้อผิดพลาด
    if (isUpstreamError(error)) return { ok: false, status: error.status ?? 0, rejection: rejectionOf(error) };
    throw error;
  }

  const translator = createClaudeTranslator({ speakRefusal });
  let messages = body.messages;
  let continuations = 0;
  let streamRetries = 0;

  const read = async (onEvent: (event: unknown) => boolean): Promise<void> => {
    const forward = (events: unknown[]) => events.some((event) => onEvent(event));
    let next: IteratorResult<ClaudeStreamEvent> | null = first;

    /**
     * ขอคำตอบรอบนี้ใหม่ ถ้ายังไม่ได้ส่งอะไรให้ผู้ใช้ (ข้อความจึงไม่ซ้ำ) และยังไม่เกินจำนวนครั้งที่กำหนด
     * คืน false ถ้าขอใหม่ไม่ได้
     */
    const retryTurn = (): boolean => {
      if (translator.started || streamRetries >= MAX_STREAM_RETRIES) return false;
      streamRetries += 1;
      translator.discardToolCalls();
      current = openStream(messages);
      next = null;
      return true;
    };

    for (;;) {
      let content: ClaudeMessageContent;
      try {
        for (next ??= await current.iterator.next(); !next.done; next = await current.iterator.next()) {
          if (forward(translator.push(next.value))) {
            current.stream.abort();
            return;
          }
        }
        // ข้อผิดพลาดที่เกิดระหว่างที่ยังมีเหตุการณ์ค้างอ่าน จะมาแสดงที่นี่
        content = (await current.stream.finalMessage()).content as ClaudeMessageContent;
      } catch (error) {
        if (isUpstreamError(error)) {
          // Anthropic แจ้งล้มเหลวกลางสตรีม (เช่น ผู้ใช้หนาแน่น): ส่งต่อเป็นเหตุการณ์ล้มเหลวพร้อมรหัส ให้เลือกข้อความถึงผู้ใช้ได้ถูก
          forward([{ type: "error", error: { type: error.type ?? undefined, code: error.errorCode ?? undefined } }]);
          return;
        }
        // ข้อผิดพลาดของ SDK ที่ไม่ได้มาจาก API: สตรีมขาดกลางทาง หรืออาร์กิวเมนต์ของเครื่องมือที่ Claude เขียนมาผิดรูปจนอ่านไม่ได้เลย
        const retriable = error instanceof Anthropic.AnthropicError && !(error instanceof Anthropic.APIError);
        if (retriable && retryTurn()) continue;
        // ส่งข้อความไปบางส่วนแล้ว ถูกยกเลิก หรือลองใหม่ครบแล้ว: ให้ผู้เรียกจัดการเป็นคำตอบที่มาไม่ครบ
        current.stream.abort();
        throw error;
      }

      // อาร์กิวเมนต์ที่ถูกตัดกลางคัน SDK ไม่แจ้งเป็นข้อผิดพลาด จึงตรวจเองแล้วขอใหม่แบบเดียวกัน
      // ถ้าขอใหม่ไม่ได้ การเรียกนั้นจะถูกข้ามตอนปิดท้าย ผู้ใช้ยังได้ข้อความส่วนที่ตอบมาแล้ว
      if (translator.hasUnreadableToolCall && retryTurn()) continue;

      if (translator.paused && continuations < MAX_CONTINUATIONS) {
        // ส่งคำตอบที่ได้กลับไปตามเดิม Anthropic จะทำงานต่อจากจุดที่หยุดเอง โดยไม่ต้องเพิ่มข้อความใหม่
        continuations += 1;
        messages = [...messages, { role: "assistant", content }];
        current = openStream(messages);
        next = null;
        continue;
      }

      forward(translator.finish());
      return;
    }
  };

  return {
    ok: true,
    events: {
      read,
      cancel: async () => current.stream.abort()
    }
  };
}

function stateOf(service: UpstreamService, error: ClaudeApiError): AiServiceState {
  const { reason } = describeUpstreamFailure(service, error.status ?? null, claudeErrorCodes(error));
  return reason === "quota" || reason === "auth" || reason === "model" ? reason : "unreachable";
}

/**
 * ตัวตรวจบัญชีของ Claude: ถามว่าโมเดลที่ตั้งไว้ใช้ได้ไหม (ไม่มีค่าใช้จ่าย) และส่งคำขอสั้นที่สุดเพื่อดูว่าเครดิตยังเหลือ
 * ไม่ throw ไม่ว่าเกิดอะไรขึ้น เพราะเป็นการตรวจเพื่อเตือน
 */
export function createClaudeAccountProbe(connection: ClaudeConnection, timeoutMs = ACCOUNT_CHECK_TIMEOUT_MS): AccountProbe {
  // การตรวจต้องจบเร็วและไม่ส่งคำขอซ้ำ ถ้าติดต่อไม่ได้จะรายงานว่ายังไม่รู้สถานะ แล้วรู้เองเมื่อมีคำขอจริง
  const client = createClient(connection, 0, timeoutMs);

  return {
    async lookUpModel(service, model) {
      try {
        const info = await client.models.retrieve(model);
        // โมเดลที่ปลดระวางแล้วยังอยู่ในรายการ แต่เรียกใช้ไม่ได้
        if (info.lifecycle === "retired") return { state: "model" };
        return { state: "ok", retiresOn: info.retires_at?.slice(0, 10) };
      } catch (error) {
        return { state: isUpstreamError(error) ? stateOf(service, error) : "unreachable" };
      }
    },

    async probeCredits(model) {
      try {
        await client.messages.create({
          model,
          max_tokens: CREDIT_PROBE_TOKENS,
          messages: [{ role: "user", content: "ping" }]
        });
        return "ok";
      } catch (error) {
        return isUpstreamError(error) ? stateOf("chat", error) : "unreachable";
      }
    }
  };
}
