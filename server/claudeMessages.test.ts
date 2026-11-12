import { describe, expect, it } from "vitest";
import {
  claudeErrorCodes,
  claudeWebSearchTool,
  createClaudeTranslator,
  FALLBACK_BETA,
  REFUSAL_REPLY,
  REFUSAL_TAIL,
  supportsServerFallback,
  toClaudeMessages,
  toClaudeRequest,
  toClaudeTools
} from "./claudeMessages.js";
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
const REMEMBER = {
  type: "function",
  name: "remember",
  description: "จำข้อมูล",
  strict: true,
  parameters: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } }
};
const WEB_SEARCH = { type: "web_search" };

const baseRequest = {
  model: "claude-opus-5-5",
  fixedInstructions: "คำสั่งส่วนที่ไม่เปลี่ยน",
  personalInstructions: "ความจำของผู้ใช้",
  messages: [{ role: "user", content: "สวัสดี" }],
  tools: [WEB_SEARCH, OPEN_PAGE, REMEMBER],
  maxTokens: 8000,
  effort: "low" as const,
  extras: true
};

describe("toClaudeTools", () => {
  it("แปลงเครื่องมือแบบฟังก์ชันเป็นรูปแบบของ Claude โดยคงโครงสร้างอาร์กิวเมนต์ไว้ครบ", () => {
    expect(toClaudeTools([OPEN_PAGE], "claude-opus-5-5", true)).toEqual([
      {
        name: "open_web_page",
        description: "เปิดหน้าเว็บ",
        input_schema: OPEN_PAGE.parameters,
        eager_input_streaming: true
      }
    ]);
  });

  it("ไม่ส่งการสตรีมอาร์กิวเมนต์เมื่อปิดตัวเลือกเสริม", () => {
    const [tool] = toClaudeTools([OPEN_PAGE], "claude-opus-5-5", false);
    expect(tool).not.toHaveProperty("eager_input_streaming");
    // ช่องของรูปแบบ Responses ที่ Claude ไม่รู้จักต้องไม่หลุดไป
    expect(tool).not.toHaveProperty("strict");
    expect(tool).not.toHaveProperty("parameters");
    expect(tool).not.toHaveProperty("type");
  });

  it("แทนเครื่องมือค้นเว็บด้วยรุ่นที่ตรงกับโมเดล และคงลำดับเดิมไว้", () => {
    const tools = toClaudeTools([WEB_SEARCH, OPEN_PAGE], "claude-opus-5-5", true);
    expect(tools[0]).toEqual({ type: "web_search_20260209", name: "web_search", max_uses: 3 });
    expect(tools[1]).toMatchObject({ name: "open_web_page" });
  });

  it("ข้ามรายการที่ไม่ใช่เครื่องมือ", () => {
    expect(toClaudeTools([null, "x", { type: "function" }, { type: "image_generation" }], "claude-opus-5-5", true)).toEqual([]);
  });
});

describe("ความสามารถตามตระกูลของโมเดล", () => {
  it("ตระกูล Haiku ใช้เครื่องมือค้นเว็บรุ่นพื้นฐาน และไม่มีโมเดลสำรองฝั่งเซิร์ฟเวอร์", () => {
    for (const model of ["claude-haiku-5-5", "claude-haiku-4-5-20251001"]) {
      expect(claudeWebSearchTool(model)).toMatchObject({ type: "web_search_20250305", name: "web_search" });
      expect(supportsServerFallback(model)).toBe(false);
    }
  });

  it("โมเดลรุ่นใหญ่ใช้เครื่องมือค้นเว็บรุ่นใหม่ และมีโมเดลสำรอง", () => {
    for (const model of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2"]) {
      expect(claudeWebSearchTool(model)).toMatchObject({ type: "web_search_20260209" });
      expect(supportsServerFallback(model)).toBe(true);
    }
  });
});

describe("toClaudeMessages", () => {
  it("จัดบทสนทนาให้เริ่มที่ผู้ใช้และสลับผู้พูด ตามที่ Claude กำหนด", () => {
    const messages = [
      { role: "assistant", content: "คำตอบที่ค้างจากประวัติที่ถูกตัด" },
      { role: "user", content: "คำถามแรก" },
      { role: "user", content: "ถามซ้ำเพราะรอบก่อนล้มเหลว" },
      { role: "assistant", content: "คำตอบ" },
      { role: "user", content: "คำถามล่าสุด" }
    ];
    expect(toClaudeMessages(messages)).toEqual([
      { role: "user", content: "คำถามแรก\n\nถามซ้ำเพราะรอบก่อนล้มเหลว" },
      { role: "assistant", content: "คำตอบ" },
      { role: "user", content: "คำถามล่าสุด" }
    ]);
  });
});

describe("toClaudeRequest", () => {
  it("สร้างคำขอครบ: โมเดล เพดานโทเค็น คำสั่งระบบสองส่วน เครื่องมือ ระดับการคิด และโมเดลสำรอง", () => {
    const request = toClaudeRequest(baseRequest);

    expect(request).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: "สวัสดี" }],
      output_config: { effort: "low" },
      fallbacks: "default",
      betas: [FALLBACK_BETA]
    });
    // แคชเฉพาะส่วนที่เหมือนกันทุกคำขอ ส่วนของผู้ใช้อยู่หลังเครื่องหมายแคช
    expect(request.system).toEqual([
      { type: "text", text: "คำสั่งส่วนที่ไม่เปลี่ยน", cache_control: { type: "ephemeral" } },
      { type: "text", text: "ความจำของผู้ใช้" }
    ]);
    expect(request.tools).toMatchObject([{ name: "web_search" }, { name: "open_web_page" }, { name: "remember" }]);
  });

  it("ไม่ส่งค่าที่ Claude รุ่นปัจจุบันปฏิเสธ: การตั้งขั้นคิดเอง ค่าสุ่ม และการบังคับเรียกเครื่องมือ", () => {
    const request = toClaudeRequest(baseRequest);
    for (const forbidden of ["thinking", "temperature", "top_p", "top_k", "tool_choice", "stream"]) {
      expect(request).not.toHaveProperty(forbidden);
    }
  });

  it("ปิดตัวเลือกเสริม: เหลือคำขอแบบพื้นฐานที่โมเดลทุกรุ่นรับ", () => {
    const request = toClaudeRequest({ ...baseRequest, extras: false });
    for (const optional of ["output_config", "fallbacks", "betas"]) expect(request).not.toHaveProperty(optional);
    expect(JSON.stringify(request.tools)).not.toContain("eager_input_streaming");
    // ส่วนสำคัญยังอยู่ครบ
    expect(request.tools).toHaveLength(3);
    expect(request.system).toHaveLength(2);
  });

  it("ตระกูล Haiku: ไม่ขอโมเดลสำรองซึ่งรุ่นนี้ไม่มี แต่ยังกำหนดระดับการคิดได้", () => {
    const request = toClaudeRequest({ ...baseRequest, model: "claude-haiku-5-5" });
    expect(request).not.toHaveProperty("fallbacks");
    expect(request).not.toHaveProperty("betas");
    expect(request.output_config).toEqual({ effort: "low" });
  });

  it("ไม่กำหนดระดับการคิด: ปล่อยให้โมเดลใช้ค่าเริ่มต้น", () => {
    expect(toClaudeRequest({ ...baseRequest, effort: undefined })).not.toHaveProperty("output_config");
  });

  it("รอบตอบต่อที่ไม่มีเครื่องมือ: ไม่ส่งรายการเครื่องมือเลย", () => {
    expect(toClaudeRequest({ ...baseRequest, tools: [] })).not.toHaveProperty("tools");
  });
});

/** เหตุการณ์ของสตรีม Claude แบบย่อ สำหรับประกอบสถานการณ์ทดสอบ */
const start = () => ({ type: "message_start", message: { id: "msg_test", role: "assistant", content: [] } });
const blockStart = (index: number, block: Record<string, unknown>) => ({ type: "content_block_start", index, content_block: block });
const textBlock = (index: number) => blockStart(index, { type: "text", text: "" });
const text = (index: number, value: string) => ({ type: "content_block_delta", index, delta: { type: "text_delta", text: value } });
const json = (index: number, value: string) => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: value } });
const blockStop = (index: number) => ({ type: "content_block_stop", index });
const stop = (reason: string) => ({ type: "message_delta", delta: { stop_reason: reason }, usage: { output_tokens: 10 } });
const end = () => ({ type: "message_stop" });
const toolUse = (index: number, id: string, name: string) => blockStart(index, { type: "tool_use", id, name, input: {} });
const citation = (index: number, url: string, title: string | null) => ({
  type: "content_block_delta",
  index,
  delta: { type: "citations_delta", citation: { type: "web_search_result_location", url, title, cited_text: "…", encrypted_index: "x" } }
});
const searchResult = (url: string, title: string) => ({ type: "web_search_result", url, title, encrypted_content: "x", page_age: null });

/** ป้อนเหตุการณ์ทั้งหมดแล้วปิดท้าย คืนเหตุการณ์แบบ Responses ที่ได้ */
function translate(events: unknown[], options?: Parameters<typeof createClaudeTranslator>[0]) {
  const translator = createClaudeTranslator(options);
  const output = events.flatMap((event) => translator.push(event));
  return { translator, output: [...output, ...translator.finish()] };
}

const COMPLETED = { type: "response.completed", response: { status: "completed", output: [] } };

describe("createClaudeTranslator", () => {
  it("ส่งข้อความต่อทันทีทีละส่วน แล้วปิดท้ายว่าตอบจบ", () => {
    const { output } = translate([start(), textBlock(0), text(0, "สวัสดี"), text(0, "ครับ"), blockStop(0), stop("end_turn"), end()]);
    expect(output).toEqual([
      { type: "response.output_text.delta", delta: "สวัสดี" },
      { type: "response.output_text.delta", delta: "ครับ" },
      COMPLETED
    ]);
  });

  it("ข้ามขั้นคิดของโมเดล ไม่ส่งให้ผู้ใช้", () => {
    const { output } = translate([
      start(),
      blockStart(0, { type: "thinking", thinking: "", signature: "" }),
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "ผู้ใช้ทักทาย" } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
      blockStop(0),
      textBlock(1),
      text(1, "สวัสดีครับ"),
      blockStop(1),
      stop("end_turn"),
      end()
    ]);
    expect(output).toEqual([{ type: "response.output_text.delta", delta: "สวัสดีครับ" }, COMPLETED]);
  });

  it("รวมอาร์กิวเมนต์ของเครื่องมือที่มาเป็นหลายชิ้น แล้วส่งการเรียกเครื่องมือตอนจบ", () => {
    const { output } = translate([
      start(),
      toolUse(0, "toolu_1", "open_web_page"),
      json(0, '{"url":"https://exa'),
      json(0, 'mple.com/","title":"ตัวอย่าง"}'),
      blockStop(0),
      stop("tool_use"),
      end()
    ]);
    expect(output).toEqual([
      {
        type: "response.output_item.done",
        item: { type: "function_call", name: "open_web_page", call_id: "toolu_1", arguments: '{"url":"https://example.com/","title":"ตัวอย่าง"}' }
      },
      COMPLETED
    ]);
  });

  it("เรียกเครื่องมือหลายครั้งในคำตอบเดียว: ส่งครบตามลำดับ และเครื่องมือที่ไม่มีอาร์กิวเมนต์ได้วัตถุว่าง", () => {
    const { output } = translate([
      start(),
      toolUse(0, "toolu_1", "remember"),
      json(0, '{"text":"ชอบกาแฟ"}'),
      blockStop(0),
      toolUse(1, "", "remember"),
      blockStop(1),
      stop("tool_use"),
      end()
    ]);
    const calls = output.filter((event) => (event as { type: string }).type === "response.output_item.done");
    expect(calls).toEqual([
      { type: "response.output_item.done", item: { type: "function_call", name: "remember", call_id: "toolu_1", arguments: '{"text":"ชอบกาแฟ"}' } },
      { type: "response.output_item.done", item: { type: "function_call", name: "remember", call_id: "call_2", arguments: "{}" } }
    ]);
  });

  it("คำตอบถูกตัดเพราะเกินเพดานโทเค็น: ไม่ทำตามเครื่องมือที่อาร์กิวเมนต์อาจไม่ครบ และแจ้งว่าคำตอบไม่สมบูรณ์", () => {
    for (const reason of ["max_tokens", "model_context_window_exceeded"]) {
      const { output } = translate([start(), textBlock(0), text(0, "กำลังเปิด"), blockStop(0), toolUse(1, "toolu_1", "open_web_page"), json(1, '{"url":"https://exa'), stop(reason), end()]);
      expect(output).toEqual([{ type: "response.output_text.delta", delta: "กำลังเปิด" }, { type: "response.incomplete" }]);
    }
  });

  describe("Claude ปฏิเสธคำขอ", () => {
    it("ปฏิเสธตั้งแต่ยังไม่ได้ตอบ: พูดประโยคขออภัยแทนการเงียบ", () => {
      const { output } = translate([start(), stop("refusal"), end()]);
      expect(output).toEqual([{ type: "response.output_text.delta", delta: REFUSAL_REPLY }, COMPLETED]);
    });

    it("หยุดตอบกลางคัน: บอกว่าตอบต่อไม่ได้ และไม่ทำตามเครื่องมือของรอบนั้น", () => {
      const { output } = translate([
        start(),
        textBlock(0),
        text(0, "เรื่องนี้"),
        blockStop(0),
        toolUse(1, "toolu_1", "open_web_page"),
        json(1, '{"url":"https://example.com/","title":"x"}'),
        blockStop(1),
        stop("refusal"),
        end()
      ]);
      expect(output).toEqual([
        { type: "response.output_text.delta", delta: "เรื่องนี้" },
        { type: "response.output_text.delta", delta: REFUSAL_TAIL },
        COMPLETED
      ]);
    });

    it("รอบตอบต่อที่มีประโยคสำรองของตัวเอง: ไม่พูดประโยคขออภัยซ้อน", () => {
      expect(translate([start(), stop("refusal"), end()], { speakRefusal: false }).output).toEqual([COMPLETED]);
    });
  });

  describe("การค้นเว็บ", () => {
    const search = [
      start(),
      blockStart(0, { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} }),
      json(0, '{"query":"ราคาทองวันนี้"}'),
      blockStop(0),
      blockStart(1, {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [
          searchResult("https://gold.example.com/today", "ราคาทองวันนี้"),
          searchResult("https://news.example.com/gold", "ข่าวทอง"),
          searchResult("https://gold.example.com/today", "ราคาทองวันนี้ (ซ้ำ)"),
          searchResult("https://bank.example.com/gold", "ธนาคาร"),
          searchResult("https://other.example.com/", "อันดับที่สี่")
        ]
      }),
      blockStop(1),
      textBlock(2)
    ];

    it("แจ้งว่ากำลังค้น และส่งหน้าที่คำตอบอ้างอิงเป็นแหล่งที่มา", () => {
      const { output, translator } = translate([
        ...search,
        text(2, "ทองคำแท่งขายออกบาทละ 52,000 บาทครับ"),
        citation(2, "https://gold.example.com/today", "ราคาทองวันนี้"),
        blockStop(2),
        stop("end_turn"),
        end()
      ]);

      expect(output[0]).toEqual({ type: "response.web_search_call.in_progress" });
      expect(output).toContainEqual({
        type: "response.output_text.annotation.added",
        annotation: { type: "url_citation", url: "https://gold.example.com/today", title: "ราคาทองวันนี้" }
      });
      // มีการอ้างอิงแล้ว จึงไม่เติมผลค้นหาที่คำตอบไม่ได้ใช้
      expect(JSON.stringify(output)).not.toContain("news.example.com");
      expect(translator.started).toBe(true);
    });

    it("คำตอบไม่ได้ระบุหน้าอ้างอิง: ใช้ผลค้นหาสามอันดับแรกที่ไม่ซ้ำกันเป็นแหล่งที่มา", () => {
      const { output } = translate([...search, text(2, "ราคาประมาณห้าหมื่นสองครับ"), blockStop(2), stop("end_turn"), end()]);
      const sources = output
        .filter((event) => (event as { type: string }).type === "response.output_text.annotation.added")
        .map((event) => (event as { annotation: { url: string } }).annotation.url);
      expect(sources).toEqual(["https://gold.example.com/today", "https://news.example.com/gold", "https://bank.example.com/gold"]);
    });

    it("ค้นไม่สำเร็จ: ไม่มีแหล่งที่มา และคำตอบยังจบปกติ", () => {
      const { output } = translate([
        start(),
        blockStart(0, { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} }),
        blockStop(0),
        blockStart(1, { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }),
        blockStop(1),
        textBlock(2),
        text(2, "ตอนนี้ผมค้นข้อมูลไม่ได้ครับ"),
        blockStop(2),
        stop("end_turn"),
        end()
      ]);
      expect(output).toEqual([
        { type: "response.web_search_call.in_progress" },
        { type: "response.output_text.delta", delta: "ตอนนี้ผมค้นข้อมูลไม่ได้ครับ" },
        COMPLETED
      ]);
    });

    it("หยุดพักระหว่างค้น: บอกว่าต้องทำต่อ แล้วอ่านข้อความถัดไปต่อได้โดยนับตำแหน่งบล็อกใหม่", () => {
      const translator = createClaudeTranslator();
      const first = [...search.slice(0, 3), stop("pause_turn"), end()].flatMap((event) => translator.push(event));
      expect(first).toEqual([{ type: "response.web_search_call.in_progress" }]);
      expect(translator.paused).toBe(true);

      // ข้อความที่ทำต่อเริ่มนับตำแหน่งบล็อกจากศูนย์อีกครั้ง
      const second = [start(), toolUse(0, "toolu_9", "open_web_page"), json(0, '{"url":"https://example.com/","title":"x"}'), blockStop(0), stop("tool_use"), end()].flatMap(
        (event) => translator.push(event)
      );
      expect(second).toEqual([]);
      expect(translator.paused).toBe(false);
      expect(translator.finish()).toEqual([
        {
          type: "response.output_item.done",
          item: { type: "function_call", name: "open_web_page", call_id: "toolu_9", arguments: '{"url":"https://example.com/","title":"x"}' }
        },
        COMPLETED
      ]);
    });
  });

  it("ทิ้งการเรียกเครื่องมือของรอบที่อ่านไม่จบ ก่อนขอคำตอบรอบนั้นใหม่", () => {
    const translator = createClaudeTranslator();
    [start(), toolUse(0, "toolu_1", "remember"), json(0, '{"text":"ครึ่ง')].forEach((event) => translator.push(event));
    expect(translator.started).toBe(false);

    translator.discardToolCalls();
    [start(), toolUse(0, "toolu_2", "remember"), json(0, '{"text":"ชอบกาแฟ"}'), blockStop(0), stop("tool_use"), end()].forEach((event) => translator.push(event));

    const calls = translator.finish().filter((event) => (event as { type: string }).type === "response.output_item.done");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ item: { call_id: "toolu_2", arguments: '{"text":"ชอบกาแฟ"}' } });
  });

  describe("อาร์กิวเมนต์ของเครื่องมือที่อ่านไม่ได้", () => {
    const callWith = (partial: string, reason = "tool_use") => [start(), toolUse(0, "toolu_1", "open_web_page"), json(0, partial), blockStop(0), stop(reason), end()];

    it.each([
      ["ถูกตัดกลางคัน", '{"url":"https://exa'],
      ["ผิดรูป", "}{"],
      ["ไม่ใช่วัตถุ", '["https://example.com/"]']
    ])("%s: บอกว่าควรขอคำตอบใหม่ และถ้าไม่ขอ ก็ไม่ส่งการเรียกนั้นต่อ", (_name, partial) => {
      const { translator, output } = translate(callWith(partial));
      expect(translator.hasUnreadableToolCall).toBe(true);
      expect(output).toEqual([COMPLETED]);
    });

    it("อ่านได้ครบ หรือเครื่องมือที่ไม่มีอาร์กิวเมนต์: ไม่ต้องขอใหม่", () => {
      expect(translate(callWith('{"url":"https://example.com/","title":"x"}')).translator.hasUnreadableToolCall).toBe(false);
      expect(translate(callWith("")).translator.hasUnreadableToolCall).toBe(false);
    });

    it("คำตอบถูกตัดเพราะเกินเพดานโทเค็น: ขอใหม่ไปก็ถูกตัดอีก จึงไม่นับ", () => {
      expect(translate(callWith('{"url":"https://exa', "max_tokens")).translator.hasUnreadableToolCall).toBe(false);
    });

    it("ข้ามเฉพาะการเรียกที่อ่านไม่ได้ การเรียกอื่นในคำตอบเดียวกันยังใช้ได้", () => {
      const { output } = translate([
        start(),
        toolUse(0, "toolu_1", "remember"),
        json(0, '{"text":"ชอบกาแฟ"}'),
        blockStop(0),
        toolUse(1, "toolu_2", "open_web_page"),
        json(1, '{"url":'),
        blockStop(1),
        stop("tool_use"),
        end()
      ]);
      expect(output).toEqual([
        { type: "response.output_item.done", item: { type: "function_call", name: "remember", call_id: "toolu_1", arguments: '{"text":"ชอบกาแฟ"}' } },
        COMPLETED
      ]);
    });
  });

  it("ไม่สนใจเหตุการณ์ที่ไม่รู้จักหรือผิดรูป และปิดท้ายได้ครั้งเดียว", () => {
    const translator = createClaudeTranslator();
    const noise = [null, "text", 42, {}, { type: "ping" }, { type: "content_block_start" }, { type: "content_block_delta", index: 0 }, { type: "message_delta" }];
    expect(noise.flatMap((event) => translator.push(event))).toEqual([]);
    expect(translator.finish()).toEqual([COMPLETED]);
    expect(translator.finish()).toEqual([]);
    expect(translator.push(text(0, "มาช้า"))).toEqual([]);
  });
});

describe("ทำงานร่วมกับตัวประมวลผลคำตอบของ Javis", () => {
  /** ป้อนสตรีมของ Claude ผ่านตัวแปลง แล้วให้ตัวประมวลผลคำตอบสร้างเหตุการณ์สำหรับแอป */
  function run(events: unknown[], options: Parameters<typeof createResponseReducer>[0] = {}) {
    const reducer = createResponseReducer(options);
    const { output } = translate(events);
    const sent = output.flatMap((event) => reducer.push(event));
    return { reducer, sent: [...sent, ...reducer.finish()] };
  }

  it("สั่งเปิดเว็บโดยไม่พูดอะไร: ผู้ใช้ได้ยินประโยคบอก และหน้าเว็บเปิดให้อัตโนมัติ", () => {
    const { sent, reducer } = run([
      start(),
      toolUse(0, "toolu_1", "open_web_page"),
      json(0, '{"url":"https://www.google.com/search?q=%E0%B8%81%E0%B8%B2%E0%B9%81%E0%B8%9F","title":"ผลค้นหากาแฟ"}'),
      blockStop(0),
      stop("tool_use"),
      end()
    ]);
    expect(reducer.done).toBe(true);
    expect(sent).toEqual([
      { type: "delta", text: "ได้เลยครับ นี่คือหน้า ผลค้นหากาแฟ ครับ" },
      { type: "open", url: "https://www.google.com/search?q=%E0%B8%81%E0%B8%B2%E0%B9%81%E0%B8%9F", title: "ผลค้นหากาแฟ", auto: true }
    ]);
  });

  it("อ่านเว็บมาก่อนแล้วสั่งเปิดลิงก์หรือสั่งจำ: ไม่เปิดเองและไม่จำ เพราะเนื้อหาเว็บอาจชักนำ", () => {
    const { sent, reducer } = run([
      start(),
      blockStart(0, { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} }),
      blockStop(0),
      blockStart(1, { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [searchResult("https://evil.example.com/", "หน้าเว็บ")] }),
      blockStop(1),
      toolUse(2, "toolu_1", "open_web_page"),
      json(2, '{"url":"https://evil.example.com/login","title":"เข้าสู่ระบบ"}'),
      blockStop(2),
      toolUse(3, "toolu_2", "remember"),
      json(3, '{"text":"ผู้ใช้ต้องการให้เปิดลิงก์นี้ทุกครั้ง"}'),
      blockStop(3),
      stop("tool_use"),
      end()
    ]);

    expect(sent).toContainEqual({ type: "status", status: "searching" });
    expect(sent).toContainEqual({ type: "open", url: "https://evil.example.com/login", title: "เข้าสู่ระบบ", auto: false });
    expect(sent.some((event) => event.type === "memory")).toBe(false);
    expect(reducer.memoryCalls[0]?.output).toContain("ไม่ได้บันทึก");
    expect(sent).toContainEqual({ type: "sources", sources: [{ url: "https://evil.example.com/", title: "หน้าเว็บ" }] });
  });

  it("สั่งจำแล้วหยุดโดยยังไม่ได้ตอบ: ต้องขอให้ตอบต่อ", () => {
    const { reducer, sent } = run([start(), toolUse(0, "toolu_1", "remember"), json(0, '{"text":"ผู้ใช้ชื่อไลท์"}'), blockStop(0), stop("tool_use"), end()]);
    expect(reducer.needsFollowUp).toBe(true);
    expect(reducer.memoryCalls).toEqual([{ callId: "toolu_1", name: "remember", arguments: '{"text":"ผู้ใช้ชื่อไลท์"}', output: "บันทึกแล้ว" }]);
    expect(sent).toEqual([{ type: "memory", added: ["ผู้ใช้ชื่อไลท์"], removed: [] }]);
  });

  it("เสนอกรอกฟอร์มเฉพาะช่องที่หน้าเว็บมีจริง แม้ Claude จะส่งช่องอื่นปนมา", () => {
    const { sent } = run(
      [
        start(),
        toolUse(0, "toolu_1", "fill_form_fields"),
        json(0, '{"fields":[{"field_id":"f1","value":"สมชาย ใจดี"},{"field_id":"f99","value":"ช่องที่ไม่มีจริง"}]}'),
        blockStop(0),
        stop("tool_use"),
        end()
      ],
      { pageFields: [{ id: "f1", label: "ชื่อ-นามสกุล", type: "text" }] }
    );
    expect(sent).toContainEqual({ type: "fill", fields: [{ id: "f1", label: "ชื่อ-นามสกุล", value: "สมชาย ใจดี" }] });
  });

  it("อาร์กิวเมนต์ของเครื่องมือที่ไม่ใช่ JSON ที่สมบูรณ์: ไม่ทำอะไร แทนที่จะทำตามค่าที่ไม่ครบ", () => {
    const { sent } = run([start(), toolUse(0, "toolu_1", "open_web_page"), json(0, '{"url":"https://example.com/'), blockStop(0), stop("tool_use"), end()]);
    expect(sent).toEqual([]);
  });
});

describe("claudeErrorCodes", () => {
  it("คืนกลุ่มและรหัสของข้อผิดพลาดที่ SDK แยกไว้ โดยไม่ซ้ำและไม่มีค่าว่าง", () => {
    expect(claudeErrorCodes({ status: 401, type: "authentication_error", errorCode: null })).toEqual(["authentication_error"]);
    expect(claudeErrorCodes({ status: 400, type: "invalid_request_error", errorCode: "tool_name_conflict" })).toEqual([
      "invalid_request_error",
      "tool_name_conflict"
    ]);
    expect(claudeErrorCodes({ type: "overloaded_error", errorCode: "overloaded_error" })).toEqual(["overloaded_error"]);
    expect(claudeErrorCodes({ status: 500, type: null, errorCode: "" })).toEqual([]);
  });
});
