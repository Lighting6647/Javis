import { describe, expect, it } from "vitest";
import {
  createGeminiInteractionTranslator,
  GEMINI_API_REVISION,
  geminiInteractionsHeaders,
  geminiInteractionsUrl,
  geminiSearchMode,
  toGeminiInteractionRequest
} from "./geminiInteractions.js";
import { createResponseReducer } from "./responseStream.js";

/** เครื่องมือในรูปแบบ Responses แบบเดียวกับที่ตัวจัดการสนทนาส่งมา */
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
const WEB_SEARCH = { type: "web_search" };

const baseRequest = {
  model: "gemini-3.5-flash-lite",
  instructions: "คุณคือ Javis",
  messages: [{ role: "user", content: "ราคาทองวันนี้เท่าไหร่" }],
  tools: [WEB_SEARCH, OPEN_PAGE],
  maxTokens: 4000,
  thinkingLevel: "minimal"
};

describe("ที่อยู่และหัวคำขอของ Interactions API", () => {
  it("ใช้ที่อยู่ระดับเดียวกับทางที่เข้ากันได้กับ OpenAI และขอคำตอบแบบสตรีม", () => {
    expect(geminiInteractionsUrl("https://generativelanguage.googleapis.com/v1beta/openai")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse"
    );
    expect(geminiInteractionsUrl("https://generativelanguage.googleapis.com/v1beta/openai/")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse"
    );
    // ที่อยู่ที่ผู้ดูแลตั้งเอง (เช่น ตัวจำลองตอนทดสอบ) ใช้ตามนั้น
    expect(geminiInteractionsUrl("http://127.0.0.1:8797")).toBe("http://127.0.0.1:8797/interactions?alt=sse");
  });

  it("ส่งกุญแจทางหัวคำขอของ Google และระบุรุ่นของรูปแบบ API ที่ตัวแปลงเขียนตาม", () => {
    // ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริง
    const headers = geminiInteractionsHeaders("test-gemini-key");
    expect(headers).toEqual({ "x-goog-api-key": "test-gemini-key", "Api-Revision": GEMINI_API_REVISION, "Content-Type": "application/json" });
    expect(headers).not.toHaveProperty("Authorization");
  });
});

describe("toGeminiInteractionRequest", () => {
  it("สร้างคำขอครบ: โมเดล คำสั่งระบบ บทสนทนา เครื่องมือค้นของ Google และเครื่องมือของ Javis", () => {
    expect(toGeminiInteractionRequest(baseRequest)).toEqual({
      model: "gemini-3.5-flash-lite",
      input: [{ type: "user_input", content: [{ type: "text", text: "ราคาทองวันนี้เท่าไหร่" }] }],
      system_instruction: "คุณคือ Javis",
      tools: [
        { type: "google_search" },
        {
          type: "function",
          name: "open_web_page",
          description: "เปิดหน้าเว็บ",
          parameters: { type: "object", required: ["url", "title"], properties: { url: { type: "string" }, title: { type: "string" } } }
        }
      ],
      generation_config: { max_output_tokens: 4000, thinking_level: "minimal", tool_choice: "validated" },
      stream: true,
      store: false
    });
  });

  it("ไม่ให้ Google เก็บบทสนทนาของผู้ใช้ และส่งประวัติไปทั้งหมดแทนการอ้างถึงบทสนทนาที่เก็บไว้", () => {
    const request = toGeminiInteractionRequest(baseRequest);
    expect(request.store).toBe(false);
    expect(request).not.toHaveProperty("previous_interaction_id");
  });

  it("ตัดส่วนของ JSON Schema ที่ Gemini ไม่รับออกจากเครื่องมือ", () => {
    const text = JSON.stringify(toGeminiInteractionRequest(baseRequest));
    expect(text).not.toContain("additionalProperties");
    expect(text).not.toContain("strict");
  });

  it("จัดบทสนทนาให้เริ่มที่ผู้ใช้และสลับผู้พูด โดยคำตอบเดิมของผู้ช่วยเป็นขั้นแบบ model_output", () => {
    const request = toGeminiInteractionRequest({
      ...baseRequest,
      messages: [
        { role: "assistant", content: "คำตอบที่ค้างจากประวัติที่ถูกตัด" },
        { role: "user", content: "คำถามแรก" },
        { role: "user", content: "ถามซ้ำ" },
        { role: "assistant", content: "คำตอบ" },
        { role: "user", content: "คำถามล่าสุด" }
      ]
    });
    expect(request.input).toEqual([
      { type: "user_input", content: [{ type: "text", text: "คำถามแรก\n\nถามซ้ำ" }] },
      { type: "model_output", content: [{ type: "text", text: "คำตอบ" }] },
      { type: "user_input", content: [{ type: "text", text: "คำถามล่าสุด" }] }
    ]);
  });

  it("ใช้โหมด validated เฉพาะตอนที่มีทั้งการค้นของ Google และเครื่องมือของ Javis", () => {
    const searchOnly = toGeminiInteractionRequest({ ...baseRequest, tools: [WEB_SEARCH] });
    expect(searchOnly.tools).toEqual([{ type: "google_search" }]);
    expect(searchOnly.generation_config).not.toHaveProperty("tool_choice");

    const functionsOnly = toGeminiInteractionRequest({ ...baseRequest, tools: [OPEN_PAGE] });
    expect(functionsOnly.generation_config).not.toHaveProperty("tool_choice");

    expect(toGeminiInteractionRequest({ ...baseRequest, tools: [] })).not.toHaveProperty("tools");
  });

  it("ระดับการคิด: ส่งเฉพาะค่าที่ API นี้รับ ค่าอื่นปล่อยให้โมเดลใช้ค่าเริ่มต้น", () => {
    for (const level of ["minimal", "low", "medium", "high"]) {
      expect(toGeminiInteractionRequest({ ...baseRequest, thinkingLevel: level }).generation_config).toMatchObject({ thinking_level: level });
    }
    for (const level of [undefined, "none", "xhigh", ""]) {
      expect(toGeminiInteractionRequest({ ...baseRequest, thinkingLevel: level }).generation_config).not.toHaveProperty("thinking_level");
    }
  });

  it("โมเดลรุ่น 2.x ตั้งค่าขั้นคิดคนละแบบกับรุ่น 3 จึงไม่ส่งระดับการคิดไปให้ถูกปฏิเสธ", () => {
    for (const model of ["gemini-2.5-flash-lite", "models/gemini-2.5-flash"]) {
      const request = toGeminiInteractionRequest({ ...baseRequest, model, tools: [WEB_SEARCH], thinkingLevel: "minimal" });
      expect(request.generation_config).not.toHaveProperty("thinking_level");
      expect(request.model).toBe(model);
    }
  });
});

describe("geminiSearchMode", () => {
  it.each([
    // โมเดลรุ่น 2.x ใช้การค้นของ Google ร่วมกับเครื่องมือของ Javis ในคำขอเดียวไม่ได้ จึงต้องค้นเป็นขั้นแยกเสมอ
    ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "separate"],
    ["gemini-2.5-flash-lite", "gemini-2.5-flash-lite", "separate"],
    ["gemini-3.8-flash", "models/gemini-2.5-flash-lite", "separate"],
    // โมเดลเดียวกันตั้งแต่รุ่น 3 ขึ้นไป: ค้นในคำขอเดียวกับคำตอบ
    ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "inline"],
    ["gemini-4-argon", "gemini-4-argon", "inline"],
    ["models/gemini-3.8-flash", "gemini-3.8-flash", "inline"],
    // คนละโมเดล: โมเดลสนทนาตอบเอง แล้วส่งต่อให้โมเดลค้นเมื่อต้องค้น
    ["gemini-3.8-flash", "gemini-3.5-flash-lite", "separate"]
  ] as const)("โมเดลสนทนา %s กับโมเดลค้น %s: ค้นแบบ %s", (chatModel, searchModel, expected) => {
    expect(geminiSearchMode(chatModel, searchModel)).toBe(expected);
  });
});

/** เหตุการณ์ของสตรีม Interactions แบบย่อ สำหรับประกอบสถานการณ์ทดสอบ */
const created = () => ({ event_type: "interaction.created", interaction: { id: "int_test", status: "in_progress" } });
const stepStart = (index: number, step: Record<string, unknown>) => ({ event_type: "step.start", index, step });
const delta = (index: number, value: Record<string, unknown>) => ({ event_type: "step.delta", index, delta: value });
const stepStop = (index: number) => ({ event_type: "step.stop", index });
const completed = (status = "completed", steps?: unknown[]) => ({
  event_type: "interaction.completed",
  interaction: { id: "int_test", status, ...(steps ? { steps } : {}) }
});
const text = (index: number, value: string) => delta(index, { type: "text", text: value });
const citation = (url: string, title: string) => ({ type: "url_citation", url, title, start_index: 0, end_index: 10 });

/** ป้อนเหตุการณ์ทั้งหมดแล้วปิดท้าย คืนเหตุการณ์แบบ Responses ที่ได้ */
function translate(events: unknown[]) {
  const translator = createGeminiInteractionTranslator();
  const output = events.flatMap((event) => translator.push(event));
  return [...output, ...translator.finish()];
}

const COMPLETED = { type: "response.completed", response: { status: "completed", output: [] } };
const SUGGESTIONS = '<style>.chip{border-radius:16px}</style><div class="container"><a class="chip" href="https://www.google.com/search?q=gold">ราคาทอง</a></div>';

describe("createGeminiInteractionTranslator", () => {
  it("ส่งข้อความต่อทันทีทีละส่วน และข้ามขั้นคิดของโมเดล", () => {
    const output = translate([
      created(),
      stepStart(0, { type: "thought", signature: "sig" }),
      delta(0, { type: "thought_summary", content: { type: "text", text: "ผู้ใช้ทักทาย" } }),
      delta(0, { type: "thought_signature", signature: "sig" }),
      stepStop(0),
      stepStart(1, { type: "model_output", content: [] }),
      text(1, "สวัสดี"),
      text(1, "ครับ"),
      stepStop(1),
      completed()
    ]);
    expect(output).toEqual([
      { type: "response.output_text.delta", delta: "สวัสดี" },
      { type: "response.output_text.delta", delta: "ครับ" },
      COMPLETED
    ]);
  });

  it("การค้นด้วย Google: แจ้งว่ากำลังค้นครั้งเดียว ส่งแถบคำค้นของ Google และแหล่งที่มาที่คำตอบอ้างอิง", () => {
    const output = translate([
      created(),
      stepStart(0, { type: "google_search_call", id: "gs_1", arguments: { queries: ["ราคาทองวันนี้"] } }),
      stepStop(0),
      stepStart(1, { type: "google_search_result", call_id: "gs_1", result: [{ search_suggestions: SUGGESTIONS }] }),
      stepStop(1),
      stepStart(2, { type: "model_output", content: [] }),
      text(2, "ทองคำแท่งขายออกบาทละ 52,000 บาทครับ"),
      delta(2, { type: "text_annotation_delta", annotations: [citation("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "goldtraders.or.th")] }),
      stepStop(2),
      completed()
    ]);

    expect(output).toEqual([
      { type: "response.web_search_call.in_progress" },
      { type: "response.search_suggestions", html: SUGGESTIONS },
      { type: "response.output_text.delta", delta: "ทองคำแท่งขายออกบาทละ 52,000 บาทครับ" },
      {
        type: "response.output_text.annotation.added",
        annotation: { type: "url_citation", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "goldtraders.or.th" }
      },
      COMPLETED
    ]);
  });

  it("ผลค้นที่ทยอยมาเป็นส่วนย่อยก็อ่านได้ และแถบคำค้นเดิมไม่ถูกส่งซ้ำ", () => {
    const output = translate([
      stepStart(0, { type: "google_search_call", id: "gs_1", arguments: {} }),
      delta(0, { type: "google_search_call", arguments: { queries: ["ข่าววันนี้"] } }),
      stepStart(1, { type: "google_search_result", call_id: "gs_1", result: [] }),
      delta(1, { type: "google_search_result", result: [{ search_suggestions: SUGGESTIONS }] }),
      delta(1, { type: "google_search_result", result: [{ search_suggestions: SUGGESTIONS }, { search_suggestions: "  " }, {}] }),
      completed()
    ]);
    expect(output).toEqual([{ type: "response.web_search_call.in_progress" }, { type: "response.search_suggestions", html: SUGGESTIONS }, COMPLETED]);
  });

  it("การเรียกเครื่องมือที่อาร์กิวเมนต์มาครบในขั้นเดียว: ส่งตอนจบ และสถานะรอผลของเครื่องมือนับว่าตอบจบแล้ว", () => {
    const output = translate([
      stepStart(0, { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา" } }),
      stepStop(0),
      completed("requires_action")
    ]);
    expect(output).toEqual([
      {
        type: "response.output_item.done",
        item: { type: "function_call", name: "open_web_page", call_id: "fc_1", arguments: '{"url":"https://www.tmd.go.th/","title":"กรมอุตุนิยมวิทยา"}' }
      },
      COMPLETED
    ]);
  });

  it("การเรียกเครื่องมือที่อาร์กิวเมนต์ทยอยมาเป็นข้อความ: รวมให้ครบก่อนส่ง", () => {
    const output = translate([
      stepStart(0, { type: "function_call", id: "fc_1", name: "remember", arguments: {} }),
      delta(0, { type: "arguments_delta", arguments: '{"text":"ผู้ใช้' }),
      delta(0, { type: "arguments_delta", arguments: 'ชื่อไลท์"}' }),
      stepStop(0),
      completed("requires_action")
    ]);
    expect(output[0]).toEqual({
      type: "response.output_item.done",
      item: { type: "function_call", name: "remember", call_id: "fc_1", arguments: '{"text":"ผู้ใช้ชื่อไลท์"}' }
    });
  });

  it("อาร์กิวเมนต์ที่ทยอยมาไม่ครบ: ใช้ค่าที่มาพร้อมขั้นแทน และไม่ส่งข้อความ JSON ที่เสียต่อ", () => {
    const output = translate([
      stepStart(0, { type: "function_call", id: "fc_1", name: "remember", arguments: { text: "ชอบกาแฟ" } }),
      delta(0, { type: "arguments_delta", arguments: '{"text":"ชอบ' }),
      completed("requires_action")
    ]);
    expect(output[0]).toMatchObject({ item: { arguments: '{"text":"ชอบกาแฟ"}' } });
  });

  it("สรุปตอนจบมีขั้นทั้งหมดซ้ำ: ไม่ส่งข้อความซ้ำ ไม่นับการเรียกเครื่องมือเดิมเป็นสองครั้ง แต่เติมอาร์กิวเมนต์ที่สตรีมไม่ได้ส่ง", () => {
    const finalSteps = [
      { type: "thought", signature: "sig" },
      { type: "model_output", content: [{ type: "text", text: "ได้ครับ", annotations: [citation("https://example.com/a", "example.com")] }] },
      { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://example.com/", title: "ตัวอย่าง" } }
    ];
    const output = translate([
      stepStart(1, { type: "model_output", content: [] }),
      text(1, "ได้ครับ"),
      stepStart(5, { type: "function_call", id: "fc_1", name: "open_web_page", arguments: {} }),
      completed("requires_action", finalSteps)
    ]);

    expect(output.filter((event) => (event as { type: string }).type === "response.output_text.delta")).toEqual([
      { type: "response.output_text.delta", delta: "ได้ครับ" }
    ]);
    const calls = output.filter((event) => (event as { type: string }).type === "response.output_item.done");
    expect(calls).toEqual([
      {
        type: "response.output_item.done",
        item: { type: "function_call", name: "open_web_page", call_id: "fc_1", arguments: '{"url":"https://example.com/","title":"ตัวอย่าง"}' }
      }
    ]);
    expect(output).toContainEqual({
      type: "response.output_text.annotation.added",
      annotation: { type: "url_citation", url: "https://example.com/a", title: "example.com" }
    });
  });

  it("สตรีมไม่ได้ส่งข้อความเลย แต่สรุปตอนจบมีคำตอบ: ใช้ข้อความจากสรุป ผู้ใช้จึงไม่ได้คำตอบว่าง", () => {
    const output = translate([completed("completed", [{ type: "model_output", content: [{ type: "text", text: "สวัสดีครับ" }] }])]);
    expect(output).toEqual([{ type: "response.output_text.delta", delta: "สวัสดีครับ" }, COMPLETED]);
  });

  it("คำตอบถูกตัดเพราะเกินเพดานโทเค็น: ไม่ทำตามเครื่องมือที่อาร์กิวเมนต์อาจไม่ครบ และแจ้งว่าคำตอบไม่สมบูรณ์", () => {
    const output = translate([
      stepStart(0, { type: "model_output", content: [] }),
      text(0, "กำลังเปิด"),
      stepStart(1, { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://exa" } }),
      completed("incomplete")
    ]);
    expect(output).toEqual([{ type: "response.output_text.delta", delta: "กำลังเปิด" }, { type: "response.incomplete" }]);
  });

  it.each(["requires_continuation", "in_progress", "queued", "สถานะที่ยังไม่รู้จัก"])(
    "สถานะ %s: คำตอบยังไม่จบ จึงเก็บข้อความไว้ แต่ไม่ทำตามเครื่องมือ",
    (status) => {
      const output = translate([
        stepStart(0, { type: "model_output", content: [] }),
        text(0, "คำตอบครึ่งแรก"),
        stepStart(1, { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://example.com/", title: "ตัวอย่าง" } }),
        completed(status)
      ]);
      expect(output).toEqual([{ type: "response.output_text.delta", delta: "คำตอบครึ่งแรก" }, { type: "response.incomplete" }]);
    }
  );

  it.each(["failed", "cancelled", "budget_exceeded"])("สถานะ %s: แจ้งว่าการตอบล้มเหลว ไม่ใช่ตอบจบ", (status) => {
    expect(translate([created(), completed(status)])).toEqual([{ type: "response.failed", response: { error: { code: status } } }]);
  });

  it("สถานะที่มาทางเหตุการณ์อัปเดตก็ใช้ตัดสินได้ เมื่อสตรีมจบโดยไม่มีสรุป", () => {
    const output = translate([
      stepStart(0, { type: "model_output", content: [] }),
      text(0, "ยาวเกิน"),
      { event_type: "interaction.status_update", interaction_id: "int_test", status: "incomplete" }
    ]);
    expect(output.at(-1)).toEqual({ type: "response.incomplete" });
  });

  it("ข้อผิดพลาดกลางสตรีม ทั้งแบบเหตุการณ์ของ Interactions และแบบวัตถุ error ของ Google", () => {
    expect(translate([created(), { event_type: "error", error: { code: "RESOURCE_EXHAUSTED", message: "quota" } }])).toEqual([
      { type: "error", error: { code: "RESOURCE_EXHAUSTED", message: "quota" } }
    ]);
    expect(translate([[{ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }]])).toEqual([
      { type: "error", error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }
    ]);
  });

  it("สถานะตอบจบที่มาทางเหตุการณ์อัปเดต: ทำตามเครื่องมือได้ แม้สตรีมจบโดยไม่มีสรุป", () => {
    const translator = createGeminiInteractionTranslator();
    const events = [
      stepStart(0, { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://example.com/", title: "ตัวอย่าง" } }),
      { event_type: "interaction.status_update", interaction_id: "int_test", status: "requires_action" }
    ];
    expect(events.flatMap((event) => translator.push(event))).toEqual([]);
    expect(translator.finish()).toEqual([
      {
        type: "response.output_item.done",
        item: { type: "function_call", name: "open_web_page", call_id: "fc_1", arguments: '{"url":"https://example.com/","title":"ตัวอย่าง"}' }
      },
      COMPLETED
    ]);
  });

  it("สตรีมขาดก่อนบอกสถานะ: เก็บข้อความที่ได้ไว้ ไม่ทำตามเครื่องมือที่อาจมาไม่ครบ ปิดท้ายครั้งเดียว และไม่สนใจเหตุการณ์ที่ไม่รู้จัก", () => {
    const translator = createGeminiInteractionTranslator();
    const noise = [null, "text", 42, {}, { event_type: "step.start" }, { event_type: "step.delta", index: 0 }, { event_type: "unknown.event" }];
    expect(noise.flatMap((event) => translator.push(event))).toEqual([]);
    expect(translator.push(stepStart(0, { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://exa" } }))).toEqual([]);
    expect(translator.finish()).toEqual([{ type: "response.incomplete" }]);
    expect(translator.finish()).toEqual([]);
    expect(translator.push(text(0, "มาช้า"))).toEqual([]);
  });
});

describe("ทำงานร่วมกับตัวประมวลผลคำตอบของ Javis", () => {
  /** ป้อนสตรีมของ Gemini ผ่านตัวแปลง แล้วให้ตัวประมวลผลคำตอบสร้างเหตุการณ์สำหรับแอป */
  function run(events: unknown[], options: Parameters<typeof createResponseReducer>[0] = {}) {
    const reducer = createResponseReducer(options);
    const sent = translate(events).flatMap((event) => reducer.push(event));
    return { reducer, sent: [...sent, ...reducer.finish()] };
  }

  const searched = [
    stepStart(0, { type: "google_search_call", id: "gs_1", arguments: { queries: ["ข่าววันนี้"] } }),
    stepStart(1, { type: "google_search_result", call_id: "gs_1", result: [{ search_suggestions: SUGGESTIONS }] })
  ];

  it("คำตอบจากการค้น: แอปได้สถานะกำลังค้น คำตอบ แหล่งที่มา และแถบคำค้นของ Google ที่ต้องแสดงคู่กัน", () => {
    const { sent, reducer } = run([
      ...searched,
      stepStart(2, { type: "model_output", content: [] }),
      text(2, "วันนี้มีข่าวเด่นเรื่องเศรษฐกิจครับ"),
      delta(2, { type: "text_annotation_delta", annotations: [citation("https://news.example.com/today", "news.example.com")] }),
      completed()
    ]);

    expect(reducer.done).toBe(true);
    expect(sent).toEqual([
      { type: "status", status: "searching" },
      { type: "delta", text: "วันนี้มีข่าวเด่นเรื่องเศรษฐกิจครับ" },
      { type: "sources", sources: [{ url: "https://news.example.com/today", title: "news.example.com" }] },
      { type: "suggestions", html: [SUGGESTIONS] }
    ]);
  });

  it("อ่านเว็บมาก่อนแล้วสั่งเปิดลิงก์หรือสั่งจำ: ไม่เปิดเองและไม่จำ เพราะเนื้อหาเว็บอาจชักนำ", () => {
    const { sent, reducer } = run([
      ...searched,
      stepStart(2, { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://evil.example.com/login", title: "เข้าสู่ระบบ" } }),
      stepStart(3, { type: "function_call", id: "fc_2", name: "remember", arguments: { text: "ผู้ใช้ต้องการให้เปิดลิงก์นี้ทุกครั้ง" } }),
      completed("requires_action")
    ]);

    expect(sent).toContainEqual({ type: "open", url: "https://evil.example.com/login", title: "เข้าสู่ระบบ", auto: false });
    expect(sent.some((event) => event.type === "memory")).toBe(false);
    expect(reducer.memoryCalls[0]?.output).toContain("ไม่ได้บันทึก");
  });

  it("สั่งเปิดเว็บโดยไม่ได้ค้น: เปิดให้อัตโนมัติพร้อมประโยคบอกผู้ใช้", () => {
    const { sent } = run([
      stepStart(0, { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา" } }),
      completed("requires_action")
    ]);
    expect(sent).toEqual([
      { type: "delta", text: "ได้เลยครับ นี่คือหน้า กรมอุตุนิยมวิทยา ครับ" },
      { type: "open", url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา", auto: true }
    ]);
  });

  it("ต้นทางแจ้งล้มเหลวกลางสตรีม: ตัวประมวลผลรู้ว่าล้มเหลว พร้อมรหัสสำหรับเลือกข้อความถึงผู้ใช้", () => {
    const { reducer } = run([created(), { event_type: "error", error: { code: "RESOURCE_EXHAUSTED", message: "quota" } }]);
    expect(reducer.failed).toBe(true);
    expect(reducer.failureCodes).toContain("RESOURCE_EXHAUSTED");
  });
});
