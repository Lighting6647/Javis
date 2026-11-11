import { describe, expect, it } from "vitest";
import {
  createChatCompletionsTranslator,
  memoryFollowUpNote,
  toAlternatingTurns,
  toChatCompletionsRequest,
  toChatTools
} from "./chatCompletions.js";
import { createResponseReducer } from "./responseStream.js";

const OPEN_PAGE = {
  type: "function",
  name: "open_web_page",
  description: "เปิดหน้าเว็บ",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["url", "title"],
    properties: { url: { type: "string" }, title: { type: "string" } }
  }
};

const FILL_FORM = {
  type: "function",
  name: "fill_form_fields",
  description: "กรอกฟอร์ม",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["fields"],
    properties: {
      fields: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["field_id", "value"], properties: { field_id: { type: "string" }, value: { type: "string" } } }
      }
    }
  }
};

/** ก้อนข้อมูลหนึ่งก้อนของสตรีม Chat Completions */
const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
  id: "chatcmpl-1",
  object: "chat.completion.chunk",
  choices: [{ index: 0, delta, finish_reason: finishReason }]
});

describe("toChatTools", () => {
  it("แปลงเครื่องมือแบบฟังก์ชันเป็นรูปแบบ Chat Completions", () => {
    expect(toChatTools([OPEN_PAGE])).toEqual([
      {
        type: "function",
        function: {
          name: "open_web_page",
          description: "เปิดหน้าเว็บ",
          parameters: { type: "object", required: ["url", "title"], properties: { url: { type: "string" }, title: { type: "string" } } }
        }
      }
    ]);
  });

  it("ข้ามเครื่องมือที่ผู้ให้บริการรายอื่นไม่มี เช่น การค้นเว็บในตัวของ OpenAI", () => {
    expect(toChatTools([{ type: "web_search" }, OPEN_PAGE, null, "x"])).toHaveLength(1);
  });

  it("ตัด additionalProperties ออกทุกระดับ รวมถึงในรายการซ้อน", () => {
    expect(JSON.stringify(toChatTools([FILL_FORM]))).not.toContain("additionalProperties");
    expect(JSON.stringify(toChatTools([FILL_FORM]))).toContain("field_id");
  });

  it("ไม่แก้ไขคำนิยามเครื่องมือต้นฉบับ", () => {
    toChatTools([FILL_FORM]);
    expect(FILL_FORM.parameters.additionalProperties).toBe(false);
  });
});

describe("toChatCompletionsRequest", () => {
  const base = { model: "test-model", instructions: "คำสั่งระบบ", messages: [{ role: "user", content: "สวัสดี" }], maxTokens: 500 };

  it("ใส่คำสั่งระบบเป็นข้อความแรก ตามด้วยบทสนทนา และขอคำตอบแบบสตรีม", () => {
    const request = toChatCompletionsRequest({ ...base, tools: [OPEN_PAGE] });
    expect(request).toMatchObject({ model: "test-model", stream: true, max_tokens: 500, tool_choice: "auto" });
    expect(request.messages).toEqual([
      { role: "system", content: "คำสั่งระบบ" },
      { role: "user", content: "สวัสดี" }
    ]);
  });

  it("ไม่ส่งช่องเครื่องมือเลยเมื่อไม่มีเครื่องมือให้ใช้", () => {
    const request = toChatCompletionsRequest({ ...base, tools: [{ type: "web_search" }] });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("tool_choice");
  });

  it("ส่งระดับการคิดเฉพาะเมื่อกำหนดไว้", () => {
    expect(toChatCompletionsRequest({ ...base, tools: [] })).not.toHaveProperty("reasoning_effort");
    expect(toChatCompletionsRequest({ ...base, tools: [], reasoningEffort: "minimal" })).toMatchObject({ reasoning_effort: "minimal" });
  });

  it("ไม่ส่งช่องอื่นของข้อความที่ผู้ให้บริการไม่รู้จัก", () => {
    const messages = [{ role: "user", content: "สวัสดี", extra: "x" }] as unknown as Array<{ role: string; content: string }>;
    expect(toChatCompletionsRequest({ ...base, messages, tools: [] }).messages).toEqual([
      { role: "system", content: "คำสั่งระบบ" },
      { role: "user", content: "สวัสดี" }
    ]);
  });
});

describe("toAlternatingTurns", () => {
  const user = (content: string) => ({ role: "user", content });
  const assistant = (content: string) => ({ role: "assistant", content });

  it("บทสนทนาที่สลับผู้พูดอยู่แล้วไม่ถูกแก้", () => {
    const turns = [user("หนึ่ง"), assistant("สอง"), user("สาม")];
    expect(toAlternatingTurns(turns)).toEqual(turns);
  });

  it("คำตอบก่อนหน้าล้มเหลว ข้อความของผู้ใช้จึงมาติดกัน: รวมเป็นข้อความเดียว เนื้อหาอยู่ครบ", () => {
    expect(toAlternatingTurns([user("เปิดเว็บข่าว"), user("ได้ยินไหม"), assistant("ได้ยินครับ"), user("ขอบคุณ")])).toEqual([
      user("เปิดเว็บข่าว\n\nได้ยินไหม"),
      assistant("ได้ยินครับ"),
      user("ขอบคุณ")
    ]);
  });

  it("ประวัติที่ถูกตัดจนขึ้นต้นด้วยคำตอบของผู้ช่วย: เริ่มที่ข้อความแรกของผู้ใช้", () => {
    expect(toAlternatingTurns([assistant("คำตอบเก่า"), assistant("อีกคำตอบ"), user("คำถามใหม่")])).toEqual([user("คำถามใหม่")]);
  });

  it("ข้อความแจ้งผลจากระบบถูกรวมกับคำถามล่าสุดของผู้ใช้ ไม่กลายเป็นผู้ใช้พูดสองครั้งติดกัน", () => {
    const turns = toAlternatingTurns([user("จำไว้ว่าผมชื่อไลท์"), user(memoryFollowUpNote(["บันทึกแล้ว"]))]);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.content).toContain("จำไว้ว่าผมชื่อไลท์");
    expect(turns[0]?.content).toContain("บันทึกแล้ว");
  });

  it("ไม่แก้ไขรายการต้นฉบับ", () => {
    const original = [user("หนึ่ง"), user("สอง")];
    toAlternatingTurns(original);
    expect(original).toEqual([user("หนึ่ง"), user("สอง")]);
  });

  it("คำขอที่ส่งจริงใช้บทสนทนาที่จัดแล้วเสมอ", () => {
    const request = toChatCompletionsRequest({
      model: "m",
      instructions: "ระบบ",
      messages: [assistant("เก่า"), user("หนึ่ง"), user("สอง")],
      tools: [],
      maxTokens: 100
    });
    expect(request.messages).toEqual([{ role: "system", content: "ระบบ" }, user("หนึ่ง\n\nสอง")]);
  });
});

describe("createChatCompletionsTranslator", () => {
  it("ส่งข้อความต่อทันทีทีละส่วน แล้วปิดท้ายเมื่อต้นทางบอกว่าจบ", () => {
    const translator = createChatCompletionsTranslator();
    expect(translator.push(chunk({ role: "assistant", content: "สวัสดี" }))).toEqual([{ type: "response.output_text.delta", delta: "สวัสดี" }]);
    expect(translator.push(chunk({ content: "ครับ" }))).toEqual([{ type: "response.output_text.delta", delta: "ครับ" }]);
    expect(translator.push(chunk({}, "stop"))).toEqual([{ type: "response.completed", response: { status: "completed", output: [] } }]);
    expect(translator.finish()).toEqual([]);
  });

  it("รวมการเรียกเครื่องมือที่มาเป็นหลายชิ้น", () => {
    const translator = createChatCompletionsTranslator();
    translator.push(chunk({ tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "open_web_page", arguments: '{"url":"https://exa' } }] }));
    translator.push(chunk({ tool_calls: [{ index: 0, function: { arguments: 'mple.com","title":"ตัวอย่าง"}' } }] }));
    const events = translator.push(chunk({}, "tool_calls"));

    expect(events[0]).toEqual({
      type: "response.output_item.done",
      item: { type: "function_call", name: "open_web_page", call_id: "call_a", arguments: '{"url":"https://example.com","title":"ตัวอย่าง"}' }
    });
    expect(events[1]).toMatchObject({ type: "response.completed" });
  });

  it("รับการเรียกเครื่องมือที่มาครบในชิ้นเดียวพร้อมเหตุผลการจบ และตั้งรหัสให้เองถ้าต้นทางไม่ส่งมา", () => {
    const translator = createChatCompletionsTranslator();
    const events = translator.push(
      chunk(
        {
          tool_calls: [
            { function: { name: "remember", arguments: '{"text":"ผู้ใช้ชื่อไลท์"}' } },
            { function: { name: "remember", arguments: '{"text":"ชอบคำตอบสั้น"}' } }
          ]
        },
        "tool_calls"
      )
    );
    const items = events.filter((event) => (event as { type: string }).type === "response.output_item.done") as Array<{ item: { call_id: string } }>;
    expect(items.map((event) => event.item.call_id)).toEqual(["call_1", "call_2"]);
  });

  it("สตรีมจบโดยไม่บอกเหตุผล: ยังปิดท้ายให้ เพื่อไม่ให้เครื่องมือที่เรียกไว้หายไป", () => {
    const translator = createChatCompletionsTranslator();
    translator.push(chunk({ tool_calls: [{ index: 0, id: "c1", function: { name: "forget_memory", arguments: '{"memory_id":"m1"}' } }] }));
    const events = translator.finish();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ item: { name: "forget_memory" } });
    expect(translator.finish()).toEqual([]);
  });

  it("ข้อผิดพลาดกลางสตรีมถูกส่งต่อพร้อมรายละเอียด ทั้งแบบปกติและแบบที่ห่อในรายการ", () => {
    const quota = { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" };
    expect(createChatCompletionsTranslator().push({ error: quota })).toEqual([{ type: "error", error: quota }]);
    expect(createChatCompletionsTranslator().push([{ error: quota }])).toEqual([{ type: "error", error: quota }]);
  });

  it("ทนต่อข้อมูลที่ไม่ใช่รูปแบบที่คาดไว้", () => {
    const translator = createChatCompletionsTranslator();
    for (const input of [null, "x", 1, [], {}, { choices: [] }, { choices: [null] }, { choices: [{ delta: null }] }, chunk({ content: "" }), chunk({ tool_calls: "x" })]) {
      expect(translator.push(input)).toEqual([]);
    }
  });

  it("ไม่ส่งอะไรเพิ่มหลังจบแล้ว", () => {
    const translator = createChatCompletionsTranslator();
    translator.push(chunk({}, "stop"));
    expect(translator.push(chunk({ content: "เกิน" }))).toEqual([]);
  });

  it("ทำงานร่วมกับตัวประมวลผลคำตอบเดิม: ข้อความ เปิดหน้าเว็บ และความจำ", () => {
    const reducer = createResponseReducer({ memories: [] });
    const translator = createChatCompletionsTranslator();
    const out: unknown[] = [];
    const feed = (input: unknown) => translator.push(input).forEach((event) => out.push(...reducer.push(event)));

    feed(chunk({ content: "ได้เลยครับ" }));
    feed(
      chunk(
        {
          tool_calls: [
            { index: 0, id: "c1", function: { name: "open_web_page", arguments: '{"url":"https://www.tmd.go.th/","title":"กรมอุตุนิยมวิทยา"}' } },
            { index: 1, id: "c2", function: { name: "remember", arguments: '{"text":"ผู้ใช้สนใจพยากรณ์อากาศ"}' } }
          ]
        },
        "tool_calls"
      )
    );
    out.push(...reducer.finish());

    expect(reducer.done).toBe(true);
    expect(reducer.failed).toBe(false);
    expect(out).toContainEqual({ type: "delta", text: "ได้เลยครับ" });
    expect(out).toContainEqual({ type: "open", url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา", auto: true });
    expect(out).toContainEqual({ type: "memory", added: ["ผู้ใช้สนใจพยากรณ์อากาศ"], removed: [] });
  });

  it("ข้อผิดพลาดจากต้นทางทำให้ตัวประมวลผลคำตอบรู้ว่าล้มเหลว", () => {
    const reducer = createResponseReducer();
    createChatCompletionsTranslator()
      .push({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } })
      .forEach((event) => reducer.push(event));
    expect(reducer.failed).toBe(true);
  });
});

describe("memoryFollowUpNote", () => {
  it("บอกผลของเครื่องมือและกำกับว่าเป็นข้อความจากระบบ", () => {
    const note = memoryFollowUpNote(["บันทึกแล้ว", "มีความจำนี้อยู่แล้ว"]);
    expect(note).toContain("บันทึกแล้ว / มีความจำนี้อยู่แล้ว");
    expect(note).toContain("ไม่ใช่จากผู้ใช้");
  });
});
