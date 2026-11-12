/**
 * ตัวแปลงระหว่างรูปแบบที่ Javis ใช้ภายใน (OpenAI Responses API) กับ Interactions API ของ Gemini
 * ใช้เมื่อเปิดการค้นเว็บของ Gemini (Grounding with Google Search) ซึ่งทางที่เข้ากันได้กับ OpenAI ไม่มีให้
 *
 * รูปแบบคำขอและเหตุการณ์ของสตรีมอ้างอิงจากเอกสารของ Google และนิยามชนิดข้อมูลใน SDK ทางการ (@google/genai 3.2.0)
 * ไฟล์นี้ไม่เรียกเครือข่าย จึงทดสอบได้ทั้งหมดด้วยข้อมูลตัวอย่าง
 */
import { toAlternatingTurns, toChatTools } from "./chatCompletions.js";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** รุ่นของรูปแบบ API ที่ตัวแปลงนี้เขียนตาม ส่งไปกับทุกคำขอเพื่อให้ได้รูปแบบคำตอบเดิมแม้ Google ออกรุ่นใหม่ */
export const GEMINI_API_REVISION = "2026-05-20";

/** ระดับการคิดก่อนตอบที่ Interactions API รับ */
const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;

/** โมเดลตระกูล Gemini 2 (เช่น gemini-2.5-flash-lite) ทั้งชื่อเปล่าและชื่อที่ขึ้นต้นด้วย models/ */
const GEMINI_2_MODEL = /^(?:models\/)?gemini-2[.-]/;
const bareModelName = (model: string) => model.replace(/^models\//, "");

/**
 * วิธีค้นเว็บของ Gemini
 * - inline: เครื่องมือค้นของ Google ไปกับคำขอปกติ พร้อมเครื่องมือของ Javis (ทำได้ตั้งแต่ Gemini 3)
 * - separate: โมเดลสนทนาขอค้นผ่านเครื่องมือของ Javis ก่อน แล้วเซิร์ฟเวอร์ส่งคำขอค้นแยกไปยังโมเดลค้น
 */
export type GeminiSearchMode = "inline" | "separate";

/**
 * เลือกวิธีค้นเว็บจากโมเดลสนทนากับโมเดลค้น
 * Gemini 2 ใช้การค้นของ Google ร่วมกับเครื่องมืออื่นในคำขอเดียวไม่ได้ จึงค้นเป็นขั้นแยกเสมอ
 * และถ้าสองโมเดลไม่ใช่ตัวเดียวกัน ก็ต้องเป็นสองคำขออยู่แล้ว
 */
export function geminiSearchMode(chatModel: string, searchModel: string): GeminiSearchMode {
  if (GEMINI_2_MODEL.test(searchModel)) return "separate";
  return bareModelName(chatModel) === bareModelName(searchModel) ? "inline" : "separate";
}

/**
 * ระดับการคิดที่จะส่งให้โมเดลนี้จริง หรือ undefined ถ้าไม่ส่ง (โมเดลใช้ค่าเริ่มต้นของตัวเอง)
 * Gemini 2 ตั้งค่าขั้นคิดคนละแบบกับรุ่น 3 จึงไม่ส่งระดับการคิดไปให้ถูกปฏิเสธ และค่าที่ API นี้ไม่รู้จักก็ไม่ส่ง
 */
export function geminiThinkingLevel(model: string, level: string | undefined): string | undefined {
  if (GEMINI_2_MODEL.test(model)) return undefined;
  return THINKING_LEVELS.find((known) => known === level);
}

/**
 * ที่อยู่ของ Interactions API จากที่อยู่ที่ตั้งไว้ให้ Gemini
 * ค่าที่ตั้งไว้เป็นของทางที่เข้ากันได้กับ OpenAI (ลงท้ายด้วย /openai) ส่วน Interactions API อยู่ระดับเดียวกัน
 */
export function geminiInteractionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/openai\/?$/, "")}/interactions?alt=sse`;
}

/** หัวคำขอของ Interactions API: Google รับกุญแจทางหัวคำขอของตัวเอง ไม่ใช่แบบ Bearer */
export function geminiInteractionsHeaders(apiKey: string): Record<string, string> {
  return {
    "x-goog-api-key": apiKey,
    "Api-Revision": GEMINI_API_REVISION,
    "Content-Type": "application/json"
  };
}

export interface GeminiInteractionRequestOptions {
  model: string;
  /** คำสั่งระบบ */
  instructions: string;
  /** ข้อความในบทสนทนา รูปแบบ { role, content } */
  messages: ReadonlyArray<{ role: string; content: string }>;
  /** เครื่องมือในรูปแบบของ Responses API รวมถึง { type: "web_search" } ถ้าให้ค้นเว็บ */
  tools: readonly unknown[];
  maxTokens: number;
  /** ระดับการคิดก่อนตอบ ค่าที่ API นี้ไม่รู้จักจะไม่ถูกส่ง โมเดลจึงใช้ค่าเริ่มต้นของตัวเอง */
  thinkingLevel?: string;
}

/** สร้างเนื้อหาคำขอของ Interactions API แบบสตรีม โดยส่งบทสนทนาไปทั้งหมดทุกครั้ง (ไม่ให้ Google เก็บบทสนทนาไว้) */
export function toGeminiInteractionRequest(options: GeminiInteractionRequestOptions): Json {
  const functions = toChatTools(options.tools).flatMap((tool) =>
    isObject(tool) && isObject(tool.function) ? [{ type: "function", ...tool.function }] : []
  );
  const search = options.tools.some((tool) => isObject(tool) && tool.type === "web_search");
  const tools = [...(search ? [{ type: "google_search" }] : []), ...functions];
  const thinkingLevel = geminiThinkingLevel(options.model, options.thinkingLevel);

  return {
    model: options.model,
    input: toAlternatingTurns(options.messages).map(({ role, content }) => ({
      type: role === "assistant" ? "model_output" : "user_input",
      content: [{ type: "text", text: content }]
    })),
    system_instruction: options.instructions,
    ...(tools.length > 0 ? { tools } : {}),
    generation_config: {
      max_output_tokens: options.maxTokens,
      ...(thinkingLevel ? { thinking_level: thinkingLevel } : {}),
      // เมื่อใช้เครื่องมือของ Google คู่กับเครื่องมือของเราเอง Google กำหนดให้ใช้โหมดนี้ (โหมด auto ใช้ร่วมกันไม่ได้)
      ...(search && functions.length > 0 ? { tool_choice: "validated" } : {})
    },
    stream: true,
    // ไม่ให้ต้นทางเก็บบทสนทนาของผู้ใช้ไว้
    store: false
  };
}

interface PendingFunctionCall {
  id: string;
  name: string;
  /** อาร์กิวเมนต์ที่ทยอยมาเป็นข้อความ JSON */
  json: string;
  /** อาร์กิวเมนต์ที่มาเป็นวัตถุครบในครั้งเดียว */
  args: unknown;
}

export interface GeminiInteractionTranslator {
  /** รับเหตุการณ์หนึ่งรายการจากสตรีม คืนเหตุการณ์แบบ Responses ที่ตัวประมวลผลคำตอบเข้าใจ */
  push(event: unknown): unknown[];
  /** เรียกเมื่อสตรีมจบ คืนเหตุการณ์ปิดท้ายถ้าต้นทางจบโดยไม่บอกสถานะ */
  finish(): unknown[];
}

const SEARCH_STARTED = { type: "response.web_search_call.in_progress" } as const;
/** สถานะที่แปลว่าต้นทางตอบไม่สำเร็จ */
const FAILED_STATUSES = new Set(["failed", "cancelled", "budget_exceeded"]);
/** สถานะที่แปลว่าตอบจบครบแล้ว: จบเอง หรือหยุดรอผลของเครื่องมือที่เรียก */
const FINISHED_STATUSES = new Set(["completed", "requires_action"]);

/**
 * แปลงสตรีมของ Interactions API เป็นเหตุการณ์แบบ Responses
 * ข้อความและแหล่งที่มาถูกส่งต่อทันที ส่วนการเรียกเครื่องมือจะถูกรวมแล้วส่งตอนจบ เฉพาะเมื่อต้นทางยืนยันว่าตอบจบครบแล้ว
 */
export function createGeminiInteractionTranslator(): GeminiInteractionTranslator {
  const calls = new Map<number, PendingFunctionCall>();
  const suggestions = new Set<string>();
  let status: string | null = null;
  let searching = false;
  let spoke = false;
  let closed = false;

  const startSearch = (): unknown[] => {
    if (searching) return [];
    searching = true;
    return [SEARCH_STARTED];
  };

  /** แถบคำค้นที่เกี่ยวข้องของ Google ซึ่งเงื่อนไขการใช้กำหนดให้แสดงคู่กับคำตอบที่ได้จากการค้น */
  const readSuggestions = (results: unknown): unknown[] => {
    if (!Array.isArray(results)) return [];
    const events: unknown[] = [];
    for (const result of results) {
      const html = isObject(result) && typeof result.search_suggestions === "string" ? result.search_suggestions.trim() : "";
      if (!html || suggestions.has(html)) continue;
      suggestions.add(html);
      events.push({ type: "response.search_suggestions", html });
    }
    return events;
  };

  const readAnnotations = (annotations: unknown): unknown[] => {
    if (!Array.isArray(annotations)) return [];
    return annotations.flatMap((annotation) =>
      isObject(annotation) && annotation.type === "url_citation" && typeof annotation.url === "string"
        ? [{ type: "response.output_text.annotation.added", annotation: { type: "url_citation", url: annotation.url, title: annotation.title } }]
        : []
    );
  };

  const readFunctionCall = (index: number, step: Json) => {
    if (typeof step.name !== "string" || !step.name) return;
    const id = typeof step.id === "string" ? step.id : "";
    // การเรียกเดียวกันอาจมาซ้ำในสรุปตอนจบ: จับคู่ด้วยรหัสก่อน เพื่อไม่ให้นับเป็นสองครั้ง
    const sameCall = id ? [...calls.entries()].find(([, call]) => call.id === id) : undefined;
    const key = sameCall?.[0] ?? index;
    const known = sameCall?.[1] ?? calls.get(index);

    calls.set(key, {
      id: id || (known?.id ?? ""),
      name: step.name,
      json: known?.json ?? "",
      args: isObject(step.arguments) && Object.keys(step.arguments).length > 0 ? step.arguments : known?.args
    });
  };

  const textDelta = (text: unknown): unknown[] => {
    if (typeof text !== "string" || !text) return [];
    spoke = true;
    return [{ type: "response.output_text.delta", delta: text }];
  };

  /** ขั้นหนึ่งของคำตอบ ทั้งตอนเริ่มขั้นในสตรีม และในสรุปตอนจบ */
  const readStep = (index: number, step: unknown, includeText: boolean): unknown[] => {
    if (!isObject(step)) return [];

    switch (step.type) {
      case "google_search_call":
        return startSearch();
      case "google_search_result":
        return [...startSearch(), ...readSuggestions(step.result)];
      case "function_call":
        readFunctionCall(index, step);
        return [];
      case "model_output": {
        const events: unknown[] = [];
        for (const part of Array.isArray(step.content) ? step.content : []) {
          if (!isObject(part) || part.type !== "text") continue;
          if (includeText) events.push(...textDelta(part.text));
          events.push(...readAnnotations(part.annotations));
        }
        return events;
      }
      default:
        return [];
    }
  };

  const readDelta = (index: number, delta: unknown): unknown[] => {
    if (!isObject(delta)) return [];

    switch (delta.type) {
      case "text":
        return textDelta(delta.text);
      case "text_annotation_delta":
        return readAnnotations(delta.annotations);
      case "arguments_delta": {
        const call = calls.get(index);
        if (call && typeof delta.arguments === "string") call.json += delta.arguments;
        return [];
      }
      case "google_search_call":
        return startSearch();
      case "google_search_result":
        return [...startSearch(), ...readSuggestions(delta.result)];
      default:
        return [];
    }
  };

  /** อาร์กิวเมนต์เป็นข้อความ JSON: ใช้ส่วนที่ทยอยมาถ้าอ่านได้ครบ ไม่เช่นนั้นใช้วัตถุที่มาพร้อมขั้น */
  const argumentsOf = (call: PendingFunctionCall): string => {
    if (call.json) {
      try {
        if (isObject(JSON.parse(call.json))) return call.json;
      } catch {
        // ข้อความ JSON มาไม่ครบ: ใช้วัตถุที่มาพร้อมขั้นแทน
      }
    }
    return JSON.stringify(isObject(call.args) ? call.args : {});
  };

  const close = (): unknown[] => {
    if (closed) return [];
    closed = true;

    if (status && FAILED_STATUSES.has(status)) return [{ type: "response.failed", response: { error: { code: status } } }];
    // คำตอบมาไม่ครบ: ถูกตัดเพราะเกินเพดานโทเค็น (incomplete) ต้นทางหยุดกลางทางให้ขอต่อ (requires_continuation
    // ซึ่งเกิดกับคำตอบยาวมากเท่านั้น Javis จำกัดความยาวไว้ต่ำกว่านั้นมากจึงไม่ขอต่อ) หรือสตรีมจบโดยไม่บอกสถานะ
    // อาร์กิวเมนต์ของเครื่องมืออาจไม่ครบ จึงเก็บข้อความที่ได้ไว้ แต่ไม่ทำตามเครื่องมือ
    if (!status || !FINISHED_STATUSES.has(status)) return [{ type: "response.incomplete" }];

    const items = [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call], position) => ({
        type: "response.output_item.done",
        item: { type: "function_call", name: call.name, call_id: call.id || `call_${position + 1}`, arguments: argumentsOf(call) }
      }));
    return [...items, { type: "response.completed", response: { status: "completed", output: [] } }];
  };

  return {
    push(event) {
      // บางครั้งต้นทางห่อข้อผิดพลาดไว้ในรายการ
      const payload = Array.isArray(event) ? event[0] : event;
      if (closed || !isObject(payload)) return [];
      const index = typeof payload.index === "number" ? payload.index : -1;

      // ข้อผิดพลาดกลางสตรีม ทั้งแบบเหตุการณ์ของ Interactions และแบบวัตถุ error ของ Google
      if (payload.event_type === "error" || (payload.event_type === undefined && isObject(payload.error))) {
        closed = true;
        return [{ type: "error", error: isObject(payload.error) ? payload.error : {} }];
      }

      switch (payload.event_type) {
        case "step.start":
          return readStep(index, payload.step, true);
        case "step.delta":
          return readDelta(index, payload.delta);
        case "interaction.status_update":
          if (typeof payload.status === "string") status = payload.status;
          return [];
        case "interaction.completed": {
          const interaction = isObject(payload.interaction) ? payload.interaction : {};
          if (typeof interaction.status === "string") status = interaction.status;
          // สรุปตอนจบอาจมีขั้นทั้งหมดซ้ำอีกครั้ง: ใช้เติมสิ่งที่สตรีมไม่ได้ส่ง และส่งข้อความเฉพาะเมื่อสตรีมไม่ได้ส่งมาเลย
          const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
          const includeText = !spoke;
          const events = steps.flatMap((step, position) => readStep(position, step, includeText));
          return [...events, ...close()];
        }
        default:
          return [];
      }
    },

    finish: close
  };
}
