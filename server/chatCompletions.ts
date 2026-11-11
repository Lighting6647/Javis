/**
 * ตัวแปลงระหว่างรูปแบบที่ Javis ใช้ภายใน (OpenAI Responses API) กับรูปแบบ Chat Completions
 * ซึ่งเป็นรูปแบบที่ผู้ให้บริการรายอื่นรองรับ เช่น Google Gemini
 * ส่วนอื่นของเซิร์ฟเวอร์จึงทำงานเหมือนเดิมไม่ว่าจะใช้ผู้ให้บริการรายใด
 */

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ChatCompletionsRequestOptions {
  model: string;
  /** คำสั่งระบบ */
  instructions: string;
  /** ข้อความในบทสนทนา รูปแบบ { role, content } */
  messages: ReadonlyArray<{ role: string; content: string }>;
  /** เครื่องมือในรูปแบบของ Responses API รายการที่ไม่ใช่ฟังก์ชัน (เช่น ค้นเว็บ) จะถูกข้าม */
  tools: readonly unknown[];
  maxTokens: number;
  /** ระดับการคิดก่อนตอบ ของโมเดลที่มีขั้นคิด ยิ่งต่ำยิ่งตอบเร็ว */
  reasoningEffort?: string;
}

/**
 * ตัดคำสั่งโครงสร้างที่ผู้ให้บริการบางรายไม่รับออกจาก JSON Schema ของเครื่องมือ
 * ไม่กระทบความปลอดภัย เพราะเซิร์ฟเวอร์ตรวจอาร์กิวเมนต์ที่ AI ส่งกลับมาเองทุกครั้งอยู่แล้ว
 */
function relaxSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(relaxSchema);
  if (!isObject(schema)) return schema;

  const relaxed: Json = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    relaxed[key] = relaxSchema(value);
  }
  return relaxed;
}

/** แปลงเครื่องมือแบบฟังก์ชันจากรูปแบบ Responses เป็นรูปแบบ Chat Completions */
export function toChatTools(tools: readonly unknown[]): unknown[] {
  return tools.flatMap((tool) => {
    if (!isObject(tool) || tool.type !== "function" || typeof tool.name !== "string") return [];
    return [
      {
        type: "function",
        function: {
          name: tool.name,
          ...(typeof tool.description === "string" ? { description: tool.description } : {}),
          parameters: relaxSchema(tool.parameters ?? { type: "object", properties: {} })
        }
      }
    ];
  });
}

/** สร้างเนื้อหาคำขอแบบ Chat Completions ที่สตรีมคำตอบ */
export function toChatCompletionsRequest(options: ChatCompletionsRequestOptions): Json {
  const tools = toChatTools(options.tools);

  return {
    model: options.model,
    stream: true,
    max_tokens: options.maxTokens,
    messages: [{ role: "system", content: options.instructions }, ...options.messages.map(({ role, content }) => ({ role, content }))],
    ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {})
  };
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatCompletionsTranslator {
  /** รับข้อมูลหนึ่งก้อนจากสตรีม คืนเหตุการณ์แบบ Responses ที่ตัวประมวลผลคำตอบเข้าใจ */
  push(chunk: unknown): unknown[];
  /** เรียกเมื่อสตรีมจบ คืนเหตุการณ์ปิดท้ายถ้าต้นทางจบโดยไม่บอกเหตุผล */
  finish(): unknown[];
}

/**
 * แปลงสตรีม Chat Completions เป็นเหตุการณ์แบบ Responses
 * ข้อความถูกส่งต่อทันทีทีละส่วน ส่วนการเรียกเครื่องมือซึ่งอาจมาเป็นหลายชิ้น จะถูกรวมแล้วส่งครั้งเดียวตอนจบ
 */
export function createChatCompletionsTranslator(): ChatCompletionsTranslator {
  const calls = new Map<number, PendingToolCall>();
  let closed = false;

  const close = (): unknown[] => {
    if (closed) return [];
    closed = true;

    const items = [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call)
      .filter((call) => call.name)
      .map((call, position) => ({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          name: call.name,
          // ผู้ให้บริการบางรายไม่ส่งรหัสการเรียกมา จึงตั้งให้เองเพื่อให้นับแยกแต่ละครั้งได้
          call_id: call.id || `call_${position + 1}`,
          arguments: call.arguments || "{}"
        }
      }));
    return [...items, { type: "response.completed", response: { status: "completed", output: [] } }];
  };

  const readToolCalls = (deltas: unknown) => {
    if (!Array.isArray(deltas)) return;

    deltas.forEach((delta, position) => {
      if (!isObject(delta)) return;
      const index = typeof delta.index === "number" ? delta.index : position;
      const call = calls.get(index) ?? { id: "", name: "", arguments: "" };
      const fn = isObject(delta.function) ? delta.function : {};

      if (typeof delta.id === "string" && delta.id) call.id = delta.id;
      if (typeof fn.name === "string" && fn.name) call.name = fn.name;
      if (typeof fn.arguments === "string") call.arguments += fn.arguments;
      calls.set(index, call);
    });
  };

  return {
    push(chunk) {
      if (closed) return [];

      // ต้นทางแจ้งข้อผิดพลาดกลางสตรีม บางรายห่อไว้ในรายการ
      const payload = Array.isArray(chunk) ? chunk[0] : chunk;
      if (!isObject(payload)) return [];
      if (isObject(payload.error)) {
        closed = true;
        return [{ type: "error", error: payload.error }];
      }

      const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
      if (!isObject(choice)) return [];

      const events: unknown[] = [];
      const delta = isObject(choice.delta) ? choice.delta : {};
      if (typeof delta.content === "string" && delta.content) {
        events.push({ type: "response.output_text.delta", delta: delta.content });
      }
      readToolCalls(delta.tool_calls);

      if (typeof choice.finish_reason === "string" && choice.finish_reason) events.push(...close());
      return events;
    },

    finish: close
  };
}

/**
 * ข้อความแจ้งผลของเครื่องมือความจำ สำหรับขอให้ AI ตอบผู้ใช้ต่อ
 * ใช้แทนการส่งรายการเรียกเครื่องมือกลับไป เพราะโมเดลที่มีขั้นคิดของผู้ให้บริการบางราย
 * ต้องการลายเซ็นของขั้นคิดแนบกลับมาด้วย ซึ่งทำให้คำขอถูกปฏิเสธถ้าขาดไป
 */
export function memoryFollowUpNote(outputs: readonly string[]): string {
  return [
    "[ข้อความจากระบบ ไม่ใช่จากผู้ใช้]",
    `ระบบทำตามคำขอเรื่องความจำแล้ว ผลลัพธ์: ${outputs.join(" / ")}`,
    "ตอบผู้ใช้สั้น ๆ เป็นภาษาพูดตามผลลัพธ์นี้ โดยไม่ต้องพูดถึงข้อความนี้"
  ].join(" ");
}
