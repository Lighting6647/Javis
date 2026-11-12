/**
 * ตัวแปลงระหว่างรูปแบบที่ Javis ใช้ภายใน (OpenAI Responses API) กับ Claude Messages API ของ Anthropic
 * ไฟล์นี้ไม่เรียกเครือข่าย จึงทดสอบได้ทั้งหมดด้วยข้อมูลตัวอย่าง ส่วนที่เรียก API จริงอยู่ใน claudeClient.ts
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ClaudeEffort } from "./aiProvider.js";
import { toAlternatingTurns } from "./chatCompletions.js";

type Json = Record<string, unknown>;
/** เนื้อหาของคำขอแบบสตรีม ตามที่ SDK กำหนด */
export type ClaudeRequest = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];
type ClaudeTool = Anthropic.Beta.Messages.BetaToolUnion;
type ClaudeMessage = Anthropic.Beta.Messages.BetaMessageParam;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** สิทธิ์ใช้การสลับไปโมเดลสำรองฝั่งเซิร์ฟเวอร์ เมื่อโมเดลหลักปฏิเสธคำขอด้วยเหตุผลด้านนโยบาย */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** คำตอบถูกอ่านออกเสียงทันที จึงจำกัดจำนวนครั้งที่ค้นเว็บต่อหนึ่งคำถาม ไม่ให้ผู้ใช้รอนาน */
const WEB_SEARCH_MAX_USES = 3;
/** จำนวนแหล่งที่มาที่หยิบจากผลค้นหาโดยตรง เมื่อคำตอบไม่ได้ระบุว่าอ้างอิงหน้าใด */
const MAX_UNCITED_SOURCES = 3;

/** ประโยคที่พูดแทน เมื่อ Claude ปฏิเสธคำขอตั้งแต่ยังไม่ได้ตอบ */
export const REFUSAL_REPLY = "ขออภัยครับ เรื่องนี้ผมช่วยตอบไม่ได้ ลองถามเรื่องอื่น หรือถามอีกแบบได้ไหมครับ";
/** ประโยคปิดท้าย เมื่อ Claude หยุดตอบกลางคันด้วยเหตุผลเดียวกัน ผู้ใช้จะได้รู้ว่าคำตอบไม่ครบ */
export const REFUSAL_TAIL = " ขออภัยครับ เรื่องนี้ผมตอบต่อไม่ได้";

/** โมเดลตระกูล Haiku ไม่มีการสลับไปโมเดลสำรองฝั่งเซิร์ฟเวอร์ และใช้เครื่องมือค้นเว็บรุ่นพื้นฐาน */
function isHaiku(model: string): boolean {
  return model.toLowerCase().includes("haiku");
}

/** โมเดลนี้รับการสลับไปโมเดลสำรองฝั่งเซิร์ฟเวอร์หรือไม่ */
export function supportsServerFallback(model: string): boolean {
  return !isHaiku(model);
}

/** เครื่องมือค้นเว็บที่ทำงานฝั่ง Anthropic รุ่นที่ตรงกับโมเดล */
export function claudeWebSearchTool(model: string): ClaudeTool {
  return {
    // รุ่นใหม่กรองผลค้นหาก่อนส่งให้โมเดล จึงแม่นและใช้โทเค็นน้อยกว่า แต่มีเฉพาะในโมเดลรุ่นใหญ่
    type: isHaiku(model) ? "web_search_20250305" : "web_search_20260209",
    name: "web_search",
    max_uses: WEB_SEARCH_MAX_USES
  };
}

/**
 * แปลงเครื่องมือจากรูปแบบ Responses เป็นรูปแบบของ Claude
 * @param eagerInputStreaming ให้ Claude ส่งอาร์กิวเมนต์ของเครื่องมือมาทันทีที่เขียน โดยไม่ตรวจโครงสร้างให้ก่อน
 *   ปลอดภัยเพราะเซิร์ฟเวอร์ตรวจอาร์กิวเมนต์ทุกตัวเองก่อนใช้งานอยู่แล้ว
 */
export function toClaudeTools(tools: readonly unknown[], model: string, eagerInputStreaming: boolean): ClaudeTool[] {
  return tools.flatMap((tool): ClaudeTool[] => {
    if (!isObject(tool)) return [];
    if (tool.type === "web_search") return [claudeWebSearchTool(model)];
    if (tool.type !== "function" || typeof tool.name !== "string") return [];

    const schema = isObject(tool.parameters) ? tool.parameters : {};
    return [
      {
        name: tool.name,
        ...(typeof tool.description === "string" ? { description: tool.description } : {}),
        input_schema: { ...schema, type: "object" },
        ...(eagerInputStreaming ? { eager_input_streaming: true } : {})
      }
    ];
  });
}

export interface ClaudeRequestOptions {
  model: string;
  /** คำสั่งระบบส่วนที่เหมือนกันทุกคำขอ ถูกทำเครื่องหมายให้แคช ข้อความถัดไปในบทสนทนาจึงเสียค่าส่วนนี้ถูกลงมาก */
  fixedInstructions: string;
  /** คำสั่งระบบส่วนที่เปลี่ยนตามผู้ใช้และเวลา: ความจำ หน้าเว็บที่เปิดอยู่ และวันที่ */
  personalInstructions: string;
  /** ข้อความในบทสนทนา รูปแบบ { role, content } */
  messages: ReadonlyArray<{ role: string; content: string }>;
  /** เครื่องมือในรูปแบบของ Responses API รวมถึง { type: "web_search" } ถ้าให้ค้นเว็บ */
  tools: readonly unknown[];
  maxTokens: number;
  /** ระดับการคิดก่อนตอบ ยิ่งต่ำยิ่งตอบเร็ว ไม่กำหนด = ใช้ค่าเริ่มต้นของโมเดล */
  effort?: ClaudeEffort;
  /**
   * ส่งตัวเลือกเสริมไปด้วย: ระดับการคิด โมเดลสำรอง และการสตรีมอาร์กิวเมนต์ของเครื่องมือ
   * ปิดเมื่อพบว่าโมเดลที่ตั้งไว้ไม่รับ เพื่อให้ผู้ใช้ยังได้คำตอบ
   */
  extras: boolean;
}

/** จัดบทสนทนาให้เริ่มที่ผู้ใช้และสลับผู้พูดทุกข้อความ ตามที่ Claude กำหนด */
export function toClaudeMessages(messages: ReadonlyArray<{ role: string; content: string }>): ClaudeMessage[] {
  return toAlternatingTurns(messages).map(({ role, content }) => ({
    role: role === "assistant" ? "assistant" : "user",
    content
  }));
}

/** สร้างคำขอแบบ Claude Messages API (ตัว SDK เป็นผู้เปิดสตรีมให้เอง) */
export function toClaudeRequest(options: ClaudeRequestOptions): ClaudeRequest {
  const { model, extras } = options;
  const tools = toClaudeTools(options.tools, model, extras);
  const fallback = extras && supportsServerFallback(model);

  return {
    model,
    max_tokens: options.maxTokens,
    system: [
      // เครื่องมือถูกจัดไว้ก่อนคำสั่งระบบ เครื่องหมายแคชตรงนี้จึงครอบคลุมทั้งรายการเครื่องมือและคำสั่งส่วนที่ไม่เปลี่ยน
      { type: "text", text: options.fixedInstructions, cache_control: { type: "ephemeral" } },
      { type: "text", text: options.personalInstructions }
    ],
    messages: toClaudeMessages(options.messages),
    ...(tools.length > 0 ? { tools } : {}),
    ...(extras && options.effort ? { output_config: { effort: options.effort } } : {}),
    // Claude อาจปฏิเสธคำขอที่ไม่มีพิษภัยได้ (ตัวกรองความปลอดภัยทำงานพลาด) ให้ Anthropic ลองตอบด้วยโมเดลสำรองในคำขอเดียวกัน
    ...(fallback ? { fallbacks: "default" as const, betas: [FALLBACK_BETA] } : {})
  };
}

interface PendingToolCall {
  id: string;
  name: string;
  json: string;
}

/**
 * อาร์กิวเมนต์ของเครื่องมือที่ Claude เขียนมาเป็น JSON ที่สมบูรณ์หรือไม่ (เครื่องมือที่ไม่มีอาร์กิวเมนต์ส่งมาเป็นข้อความว่าง)
 * ต้องตรวจเอง เพราะเมื่อให้ส่งอาร์กิวเมนต์มาทันทีที่เขียน Anthropic จะไม่ตรวจให้
 * และตัวอ่านของ SDK ยอมรับ JSON ที่ถูกตัดกลางคันโดยไม่แจ้ง
 */
function hasReadableArguments(call: PendingToolCall): boolean {
  if (!call.json) return true;
  try {
    return isObject(JSON.parse(call.json));
  } catch {
    return false;
  }
}

export interface ClaudeTranslatorOptions {
  /** พูดประโยคขออภัยเมื่อ Claude ปฏิเสธคำขอ (ค่าเริ่มต้น true) ปิดในรอบตอบต่อที่มีประโยคสำรองของตัวเองอยู่แล้ว */
  speakRefusal?: boolean;
}

export interface ClaudeTranslator {
  /** รับเหตุการณ์หนึ่งรายการจากสตรีมของ Claude คืนเหตุการณ์แบบ Responses ที่ตัวประมวลผลคำตอบเข้าใจ */
  push(event: unknown): unknown[];
  /** เรียกเมื่อได้คำตอบครบ คืนการเรียกเครื่องมือ แหล่งที่มา และเหตุการณ์ปิดท้าย */
  finish(): unknown[];
  /** ทิ้งการเรียกเครื่องมือของรอบที่อ่านไม่จบ ก่อนขอคำตอบรอบนั้นใหม่ */
  discardToolCalls(): void;
  /**
   * คำตอบจบปกติ แต่มีการเรียกเครื่องมือที่อาร์กิวเมนต์อ่านไม่ได้ ควรขอคำตอบรอบนั้นใหม่ถ้ายังทำได้
   * ถ้าไม่ขอใหม่ การเรียกนั้นจะถูกข้ามตอนปิดท้าย ไม่ถูกส่งต่อ
   */
  readonly hasUnreadableToolCall: boolean;
  /** ข้อความรอบล่าสุดหยุดพักเพราะเครื่องมือฝั่งเซิร์ฟเวอร์ทำงานยาว ต้องส่งกลับไปให้ทำต่อ */
  readonly paused: boolean;
  /** ส่งข้อความหรือสถานะให้ผู้ใช้ไปแล้ว ถ้าใช่ จะขอคำตอบรอบนี้ใหม่ไม่ได้เพราะข้อความจะซ้ำ */
  readonly started: boolean;
}

const SEARCH_STARTED = { type: "response.web_search_call.in_progress" } as const;

const textDelta = (text: string) => ({ type: "response.output_text.delta", delta: text });
const sourceAdded = (url: string, title: unknown) => ({
  type: "response.output_text.annotation.added",
  annotation: { type: "url_citation", url, title }
});

/**
 * แปลงสตรีมของ Claude เป็นเหตุการณ์แบบ Responses
 * ข้อความถูกส่งต่อทันทีทีละส่วน ส่วนการเรียกเครื่องมือจะถูกรวมแล้วส่งตอนจบ
 * หลังตรวจแล้วว่าคำตอบจบแบบปกติ เพราะคำตอบที่ถูกตัดหรือถูกปฏิเสธกลางคันอาจมีอาร์กิวเมนต์ไม่ครบ
 */
export function createClaudeTranslator(options: ClaudeTranslatorOptions = {}): ClaudeTranslator {
  const speakRefusal = options.speakRefusal ?? true;
  /** การเรียกเครื่องมือของข้อความที่กำลังอ่าน จับคู่กับตำแหน่งของบล็อกในข้อความนั้น */
  const open = new Map<number, PendingToolCall>();
  let calls: PendingToolCall[] = [];
  const uncited = new Map<string, unknown>();
  let stopReason: string | null = null;
  let spoke = false;
  let searching = false;
  let cited = false;
  let closed = false;

  /** คำตอบที่ถูกปฏิเสธหรือถูกตัดอาจมีอาร์กิวเมนต์ไม่ครบ จึงไม่ทำตามเครื่องมือของรอบนั้น */
  const toolCallsAllowed = () => stopReason !== "refusal" && stopReason !== "max_tokens" && stopReason !== "model_context_window_exceeded";

  const readSearchResults = (content: unknown) => {
    // ค้นไม่สำเร็จ ต้นทางส่งวัตถุข้อผิดพลาดมาแทนรายการ: ไม่มีแหล่งที่มาให้เก็บ Claude จะบอกผู้ใช้เอง
    if (!Array.isArray(content)) return;
    for (const result of content) {
      if (!isObject(result) || typeof result.url !== "string" || uncited.has(result.url)) continue;
      if (uncited.size >= MAX_UNCITED_SOURCES) return;
      uncited.set(result.url, result.title);
    }
  };

  const startBlock = (index: number, block: unknown): unknown[] => {
    if (!isObject(block)) return [];

    if (block.type === "tool_use" && typeof block.name === "string") {
      const call = { id: typeof block.id === "string" ? block.id : "", name: block.name, json: "" };
      open.set(index, call);
      calls.push(call);
    } else if (block.type === "server_tool_use") {
      // เครื่องมือฝั่งเซิร์ฟเวอร์ที่เปิดไว้มีแต่การค้นเว็บ (รุ่นใหม่รันโค้ดกรองผลค้นหาร่วมด้วย)
      searching = true;
      return [SEARCH_STARTED];
    } else if (block.type === "web_search_tool_result") {
      searching = true;
      readSearchResults(block.content);
    }
    return [];
  };

  const readDelta = (index: number, delta: unknown): unknown[] => {
    if (!isObject(delta)) return [];

    if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text) {
      spoke = true;
      return [textDelta(delta.text)];
    }
    if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
      const call = open.get(index);
      if (call) call.json += delta.partial_json;
    } else if (delta.type === "citations_delta" && isObject(delta.citation)) {
      const { citation } = delta;
      if (citation.type === "web_search_result_location" && typeof citation.url === "string") {
        cited = true;
        return [sourceAdded(citation.url, citation.title)];
      }
    }
    return [];
  };

  return {
    push(event) {
      if (closed || !isObject(event)) return [];
      const index = typeof event.index === "number" ? event.index : -1;

      switch (event.type) {
        case "message_start":
          // ตำแหน่งของบล็อกเริ่มนับใหม่ทุกข้อความ (คำตอบที่ทำต่อหลังหยุดพักมาเป็นข้อความใหม่)
          open.clear();
          stopReason = null;
          return [];
        case "content_block_start":
          return startBlock(index, event.content_block);
        case "content_block_delta":
          return readDelta(index, event.delta);
        case "message_delta":
          if (isObject(event.delta) && typeof event.delta.stop_reason === "string") stopReason = event.delta.stop_reason;
          return [];
        default:
          return [];
      }
    },

    finish() {
      if (closed) return [];
      closed = true;

      const events: unknown[] = [];
      const refused = stopReason === "refusal";
      const cutOff = stopReason === "max_tokens" || stopReason === "model_context_window_exceeded";

      // คำตอบไม่ได้ระบุว่าอ้างอิงหน้าใด: ให้ผู้ใช้เห็นผลค้นหาอันดับต้นเป็นแหล่งที่มาแทน
      if (!cited) for (const [url, title] of uncited) events.push(sourceAdded(url, title));

      if (refused && speakRefusal) events.push(textDelta(spoke ? REFUSAL_TAIL : REFUSAL_REPLY));

      if (toolCallsAllowed()) {
        calls
          // การเรียกที่อาร์กิวเมนต์อ่านไม่ได้ถูกข้าม: ไม่ทำอะไรดีกว่าทำตามค่าที่ไม่ครบ
          .filter((call) => call.name && hasReadableArguments(call))
          .forEach((call, position) => {
            events.push({
              type: "response.output_item.done",
              item: {
                type: "function_call",
                name: call.name,
                call_id: call.id || `call_${position + 1}`,
                arguments: call.json || "{}"
              }
            });
          });
      }

      events.push(cutOff ? { type: "response.incomplete" } : { type: "response.completed", response: { status: "completed", output: [] } });
      return events;
    },

    discardToolCalls() {
      open.clear();
      calls = [];
    },

    get hasUnreadableToolCall() {
      return toolCallsAllowed() && calls.some((call) => call.name && !hasReadableArguments(call));
    },

    get paused() {
      return stopReason === "pause_turn";
    },
    get started() {
      return spoke || searching;
    }
  };
}

export interface ClaudeErrorLike {
  /** รหัสสถานะ HTTP หรือ undefined ถ้าข้อผิดพลาดมากลางสตรีมหลังตอบ 200 แล้ว */
  status?: number | undefined;
  /** กลุ่มของข้อผิดพลาด เช่น authentication_error */
  type?: string | null | undefined;
  /** รหัสที่ระบุสาเหตุ ถ้าต้นทางให้มา */
  errorCode?: string | null | undefined;
}

/**
 * รหัสข้อผิดพลาดของ Claude สำหรับจัดกลุ่มสาเหตุ อ่านจากชนิดและรหัสที่ SDK แยกไว้ให้
 * ไม่อ่านจากข้อความ เพราะถ้อยคำของข้อความเปลี่ยนได้
 */
export function claudeErrorCodes(error: ClaudeErrorLike): string[] {
  return [...new Set([error.type, error.errorCode].filter((code): code is string => typeof code === "string" && code.length > 0))];
}
