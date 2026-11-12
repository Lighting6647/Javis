import { describe, expect, it } from "vitest";
import { createClaudeAccountProbe, startClaudeReply } from "./claudeClient.js";
import { FALLBACK_BETA, memoryOperatorNote, REFUSAL_REPLY } from "./claudeMessages.js";
import { createResponseReducer } from "./responseStream.js";

/**
 * การทดสอบชุดนี้ให้ SDK ของ Anthropic ทำงานจริงทั้งหมด เปลี่ยนเฉพาะตัวส่งคำขอเป็นต้นทางจำลอง
 * จึงตรวจได้ทั้งคำขอที่ SDK ส่งออกไปจริง และการอ่านสตรีมกับข้อผิดพลาดตามรูปแบบของ Anthropic
 */
const BASE = "https://claude.test";
// ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริงของบริการใด
const TEST_KEY = "test-claude-key";

type Json = Record<string, unknown>;
interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: Json | null;
}
type Reply = Response | Error | ((call: Call) => Response);

/** ต้นทางจำลอง: ตอบตามลำดับที่กำหนด และจดคำขอที่ SDK ส่งมาไว้ให้ตรวจ */
function fakeAnthropic(replies: Reply[]) {
  const calls: Call[] = [];
  const queue = [...replies];

  const fetchImpl: typeof fetch = async (input, init) => {
    const call: Call = {
      url: String(input instanceof Request ? input.url : input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as Json) : null
    };
    calls.push(call);
    init?.signal?.throwIfAborted();

    const reply = queue.shift();
    if (!reply) return jsonReply(500, "api_error", "ไม่มีคำตอบจำลองเหลือ");
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(call) : reply;
  };

  return { fetchImpl, calls };
}

function jsonReply(status: number, type: string, message: string): Response {
  return new Response(JSON.stringify({ type: "error", error: { type, message }, request_id: "req_test" }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** สตรีมแบบ SSE ตามรูปแบบของ Messages API */
function sse(events: Json[]): Response {
  const body = events.map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const messageStart = (model = "claude-opus-5-5"): Json => ({
  type: "message_start",
  message: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 12, output_tokens: 0 }
  }
});
const blockStart = (index: number, block: Json): Json => ({ type: "content_block_start", index, content_block: block });
const textDelta = (index: number, text: string): Json => ({ type: "content_block_delta", index, delta: { type: "text_delta", text } });
const jsonDelta = (index: number, partial: string): Json => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: partial } });
const blockStop = (index: number): Json => ({ type: "content_block_stop", index });
const messageEnd = (stopReason: string): Json[] => [
  { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 9 } },
  { type: "message_stop" }
];

const textReply = (text: string) =>
  sse([messageStart(), blockStart(0, { type: "text", text: "" }), textDelta(0, text), blockStop(0), ...messageEnd("end_turn")]);

const OPEN_PAGE = {
  type: "function",
  name: "open_web_page",
  description: "เปิดหน้าเว็บ",
  parameters: { type: "object", additionalProperties: false, required: ["url", "title"], properties: { url: { type: "string" }, title: { type: "string" } } }
};

function request(fetchImpl: typeof fetch, overrides: Partial<Parameters<typeof startClaudeReply>[0]> = {}) {
  return startClaudeReply({
    connection: { apiKey: TEST_KEY, baseUrl: BASE, fetchImpl },
    signal: new AbortController().signal,
    timeoutMs: 5000,
    model: "claude-opus-5-5",
    fixedInstructions: "คำสั่งส่วนที่ไม่เปลี่ยน",
    personalInstructions: "ยังไม่มีความจำเกี่ยวกับผู้ใช้",
    messages: [{ role: "user", content: "สวัสดี" }],
    tools: [{ type: "web_search" }, OPEN_PAGE],
    maxTokens: 8000,
    effort: "low",
    extras: true,
    ...overrides
  });
}

/** อ่านคำตอบจนจบ คืนเหตุการณ์แบบ Responses ทั้งหมด */
async function readAll(start: Awaited<ReturnType<typeof startClaudeReply>>): Promise<Json[]> {
  if (!start.ok) throw new Error(`คำขอถูกปฏิเสธ ${start.status}`);
  const events: Json[] = [];
  await start.events.read((event) => {
    events.push(event as Json);
    return false;
  });
  return events;
}

const COMPLETED = { type: "response.completed", response: { status: "completed", output: [] } };

describe("startClaudeReply", () => {
  it("ส่งคำขอตามรูปแบบของ Messages API: กุญแจ สิทธิ์ใช้โมเดลสำรอง และเนื้อหาครบ", async () => {
    const upstream = fakeAnthropic([textReply("สวัสดีครับ")]);
    await readAll(await request(upstream.fetchImpl));

    expect(upstream.calls).toHaveLength(1);
    const [call] = upstream.calls;
    expect(call?.method).toBe("POST");
    expect(new URL(call?.url ?? "").origin + new URL(call?.url ?? "").pathname).toBe(`${BASE}/v1/messages`);

    // SDK เป็นผู้เลือกช่องส่งกุญแจ ที่ต้องแน่ใจคือกุญแจถูกส่งไปกับคำขอ และไม่หลุดไปอยู่ในที่อยู่หรือเนื้อหา
    const credentials = [call?.headers.get("x-api-key"), call?.headers.get("authorization")].join(" ");
    expect(credentials).toContain(TEST_KEY);
    expect(call?.url).not.toContain(TEST_KEY);
    expect(JSON.stringify(call?.body)).not.toContain(TEST_KEY);
    expect(call?.headers.get("anthropic-beta")).toContain(FALLBACK_BETA);
    expect(call?.headers.get("anthropic-version")).toBeTruthy();

    expect(call?.body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      stream: true,
      messages: [{ role: "user", content: "สวัสดี" }],
      output_config: { effort: "low" },
      fallbacks: "default",
      system: [
        { type: "text", text: "คำสั่งส่วนที่ไม่เปลี่ยน", cache_control: { type: "ephemeral" } },
        { type: "text", text: "ยังไม่มีความจำเกี่ยวกับผู้ใช้" }
      ],
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 3 },
        { name: "open_web_page", eager_input_streaming: true, input_schema: { type: "object", required: ["url", "title"] } }
      ]
    });
    // สิทธิ์เบต้าถูกส่งเป็นส่วนหัว ไม่ใช่ในเนื้อหา และไม่ส่งค่าที่ Claude รุ่นปัจจุบันปฏิเสธ
    for (const absent of ["betas", "thinking", "temperature", "tool_choice"]) expect(call?.body).not.toHaveProperty(absent);
  });

  it("ปิดตัวเลือกเสริม: ไม่ขอสิทธิ์เบต้าและไม่ส่งค่าที่โมเดลบางรุ่นไม่รับ", async () => {
    const upstream = fakeAnthropic([textReply("ครับ")]);
    await readAll(await request(upstream.fetchImpl, { extras: false }));

    const [call] = upstream.calls;
    expect(call?.headers.get("anthropic-beta") ?? "").not.toContain(FALLBACK_BETA);
    for (const absent of ["fallbacks", "output_config", "betas"]) expect(call?.body).not.toHaveProperty(absent);
    expect(JSON.stringify(call?.body)).not.toContain("eager_input_streaming");
  });

  it("โมเดลเริ่มต้น (Haiku): ใช้เครื่องมือค้นเว็บรุ่นพื้นฐาน และไม่ขอโมเดลสำรองซึ่งรุ่นนี้ไม่มี", async () => {
    const upstream = fakeAnthropic([textReply("ครับ")]);
    await readAll(await request(upstream.fetchImpl, { model: "claude-haiku-5-5" }));

    const [call] = upstream.calls;
    expect(call?.body).toMatchObject({
      model: "claude-haiku-5-5",
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }, { name: "open_web_page", eager_input_streaming: true }]
    });
    expect(call?.body).not.toHaveProperty("fallbacks");
    expect(call?.headers.get("anthropic-beta") ?? "").not.toContain(FALLBACK_BETA);
  });

  it("รอบตอบต่อหลังจำหรือลืม: ผลถูกส่งเป็นข้อความระบบต่อจากข้อความของผู้ใช้ โดยไม่มีเครื่องมือ", async () => {
    const upstream = fakeAnthropic([textReply("จำไว้แล้วครับ")]);
    const note = memoryOperatorNote(["บันทึกแล้ว"]);
    const events = await readAll(
      await request(upstream.fetchImpl, {
        model: "claude-haiku-5-5",
        tools: [],
        speakRefusal: false,
        messages: [
          { role: "user", content: "จำไว้ว่าผมชื่อไลท์" },
          { role: "system", content: note }
        ]
      })
    );

    expect(events).toEqual([{ type: "response.output_text.delta", delta: "จำไว้แล้วครับ" }, COMPLETED]);
    expect(upstream.calls[0]?.body?.messages).toEqual([
      { role: "user", content: "จำไว้ว่าผมชื่อไลท์" },
      { role: "system", content: note }
    ]);
    expect(upstream.calls[0]?.body).not.toHaveProperty("tools");
  });

  it("อ่านคำตอบแบบสตรีมเป็นเหตุการณ์ที่ตัวประมวลผลคำตอบเข้าใจ", async () => {
    const upstream = fakeAnthropic([
      sse([messageStart(), blockStart(0, { type: "text", text: "" }), textDelta(0, "สวัสดี"), textDelta(0, "ครับ"), blockStop(0), ...messageEnd("end_turn")])
    ]);
    expect(await readAll(await request(upstream.fetchImpl))).toEqual([
      { type: "response.output_text.delta", delta: "สวัสดี" },
      { type: "response.output_text.delta", delta: "ครับ" },
      COMPLETED
    ]);
  });

  it("การเรียกเครื่องมือไปถึงตัวประมวลผลคำตอบ และถูกตรวจก่อนใช้", async () => {
    const upstream = fakeAnthropic([
      sse([
        messageStart(),
        blockStart(0, { type: "tool_use", id: "toolu_1", name: "open_web_page", input: {} }),
        jsonDelta(0, '{"url":"https://example.com/"'),
        jsonDelta(0, ',"title":"ตัวอย่าง"}'),
        blockStop(0),
        ...messageEnd("tool_use")
      ])
    ]);
    const reducer = createResponseReducer();
    const sent = (await readAll(await request(upstream.fetchImpl))).flatMap((event) => reducer.push(event));

    expect([...sent, ...reducer.finish()]).toContainEqual({ type: "open", url: "https://example.com/", title: "ตัวอย่าง", auto: true });
  });

  it("Claude ปฏิเสธคำขอ (ตอบ 200 พร้อมเหตุผลการหยุดเป็น refusal): ผู้ใช้ได้ยินประโยคขออภัย", async () => {
    const refusal = () => sse([messageStart(), ...messageEnd("refusal")]);
    const upstream = fakeAnthropic([refusal(), refusal()]);

    expect(await readAll(await request(upstream.fetchImpl))).toEqual([{ type: "response.output_text.delta", delta: REFUSAL_REPLY }, COMPLETED]);
    // รอบตอบต่อมีประโยคสำรองของตัวเอง จึงไม่พูดซ้อน
    expect(await readAll(await request(upstream.fetchImpl, { speakRefusal: false }))).toEqual([COMPLETED]);
  });

  describe("คำขอถูกปฏิเสธตั้งแต่ต้น", () => {
    it.each([
      ["กุญแจผิด", 401, "authentication_error"],
      ["ปัญหาการชำระเงิน", 402, "billing_error"],
      ["ไม่พบโมเดล", 404, "not_found_error"],
      ["รูปแบบคำขอไม่ถูกต้อง", 400, "invalid_request_error"]
    ])("%s: คืนรหัสสถานะและกลุ่มของข้อผิดพลาด โดยไม่เปิดสตรีม", async (_name, status, type) => {
      const upstream = fakeAnthropic([jsonReply(status, type, "รายละเอียดจากต้นทาง")]);
      const start = await request(upstream.fetchImpl);

      expect(start).toEqual({ ok: false, status, rejection: { codes: [type], logDetail: "รายละเอียดจากต้นทาง" } });
      // ข้อผิดพลาดกลุ่มนี้ลองใหม่ไปก็ไม่หาย จึงต้องไม่ส่งซ้ำ
      expect(upstream.calls).toHaveLength(1);
    });

    it("ข้อความของต้นทางถูกปิดบังสิ่งที่ดูเหมือนกุญแจ ก่อนนำไปเขียน log", async () => {
      // ค่าทดสอบเท่านั้น ประกอบขึ้นตอนรันเพื่อไม่ให้เครื่องมือสแกนความลับเข้าใจผิดว่าเป็นกุญแจจริง
      const keyLike = ["sk", "ant", "api03", "TESTONLYnotarealkey0000"].join("-");
      const upstream = fakeAnthropic([jsonReply(400, "invalid_request_error", `bad key ${keyLike}`)]);
      const start = await request(upstream.fetchImpl);

      expect(start.ok).toBe(false);
      if (!start.ok) {
        expect(start.rejection.logDetail).not.toContain("TESTONLY");
        expect(start.rejection.logDetail).toContain("[ปิดบัง]");
      }
    });

    it("ตอบ 200 แล้วแจ้งล้มเหลวเป็นเหตุการณ์แรก: ยังคืนเป็นคำขอที่ถูกปฏิเสธพร้อมรหัส", async () => {
      const upstream = fakeAnthropic([sse([{ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }])]);
      expect(await request(upstream.fetchImpl)).toMatchObject({ ok: false, status: 0, rejection: { codes: ["overloaded_error"] } });
    });

    it("คำตอบที่ไม่ใช่ JSON: ไม่มีรหัสให้อ่าน แต่ยังรู้รหัสสถานะ", async () => {
      const upstream = fakeAnthropic([new Response("<html>Bad request</html>", { status: 400, headers: { "content-type": "text/html" } })]);
      expect(await request(upstream.fetchImpl)).toEqual({ ok: false, status: 400, rejection: { codes: [], logDetail: "" } });
    });
  });

  it("Anthropic แจ้งล้มเหลวกลางสตรีม: ส่งต่อเป็นเหตุการณ์ล้มเหลวพร้อมรหัส ให้เลือกข้อความถึงผู้ใช้ได้ถูก", async () => {
    const upstream = fakeAnthropic([
      sse([
        messageStart(),
        blockStart(0, { type: "text", text: "" }),
        textDelta(0, "กำลัง"),
        { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }
      ])
    ]);
    const reducer = createResponseReducer();
    (await readAll(await request(upstream.fetchImpl))).forEach((event) => reducer.push(event));

    expect(reducer.failed).toBe(true);
    expect(reducer.failureCodes).toEqual(["overloaded_error"]);
    expect(reducer.done).toBe(false);
  });

  describe("การค้นเว็บหยุดพักกลางทาง (pause_turn)", () => {
    const searching = [
      blockStart(0, { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} }),
      jsonDelta(0, '{"query":"ราคาทองวันนี้"}'),
      blockStop(0)
    ];
    const paused = () => sse([messageStart(), ...searching, ...messageEnd("pause_turn")]);

    it("ส่งคำตอบที่ได้กลับไปตามเดิมเพื่อให้ทำต่อ โดยไม่เพิ่มข้อความของผู้ใช้", async () => {
      const upstream = fakeAnthropic([paused(), textReply("ทองคำแท่งบาทละ 52,000 บาทครับ")]);
      const events = await readAll(await request(upstream.fetchImpl));

      expect(events).toEqual([
        { type: "response.web_search_call.in_progress" },
        { type: "response.output_text.delta", delta: "ทองคำแท่งบาทละ 52,000 บาทครับ" },
        COMPLETED
      ]);
      expect(upstream.calls).toHaveLength(2);
      expect(upstream.calls[1]?.body?.messages).toEqual([
        { role: "user", content: "สวัสดี" },
        { role: "assistant", content: [{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "ราคาทองวันนี้" } }] }
      ]);
      // คำขอที่ทำต่อใช้การตั้งค่าเดิมทุกอย่าง
      expect(upstream.calls[1]?.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "low" } });
    });

    it("หยุดพักซ้ำไม่จบ: ทำต่อไม่เกินสองครั้ง แล้วจบคำตอบเท่าที่มี", async () => {
      const upstream = fakeAnthropic([paused(), paused(), paused(), paused()]);
      const events = await readAll(await request(upstream.fetchImpl));

      expect(upstream.calls).toHaveLength(3);
      expect(events.at(-1)).toEqual(COMPLETED);
    });
  });

  describe("อาร์กิวเมนต์ของเครื่องมือที่ Claude เขียนมาอ่านไม่ได้", () => {
    /** ถูกตัดกลางคัน: SDK ยอมรับโดยไม่แจ้ง Javis จึงต้องตรวจเอง */
    const CUT_SHORT = '{"url": tru';
    /** ผิดรูปจนอ่านไม่ได้เลย: SDK แจ้งเป็นข้อผิดพลาด */
    const GARBLED = "}{";

    const broken = (partial: string, before: Json[] = []) =>
      sse([
        messageStart(),
        ...before,
        blockStart(before.length > 0 ? 1 : 0, { type: "tool_use", id: "toolu_1", name: "open_web_page", input: {} }),
        jsonDelta(before.length > 0 ? 1 : 0, partial),
        blockStop(before.length > 0 ? 1 : 0),
        ...messageEnd("tool_use")
      ]);
    const fixed = () =>
      sse([
        messageStart(),
        blockStart(0, { type: "tool_use", id: "toolu_2", name: "open_web_page", input: {} }),
        jsonDelta(0, '{"url":"https://example.com/","title":"ตัวอย่าง"}'),
        blockStop(0),
        ...messageEnd("tool_use")
      ]);
    const spoken = [blockStart(0, { type: "text", text: "" }), textDelta(0, "กำลังเปิดให้ครับ"), blockStop(0)];

    it.each([
      ["ถูกตัดกลางคัน", CUT_SHORT],
      ["ผิดรูปจนอ่านไม่ได้", GARBLED]
    ])("%s และยังไม่ได้ส่งอะไรให้ผู้ใช้: ขอคำตอบรอบนั้นใหม่หนึ่งครั้ง และใช้เฉพาะการเรียกเครื่องมือของรอบใหม่", async (_name, partial) => {
      const upstream = fakeAnthropic([broken(partial), fixed()]);
      const events = await readAll(await request(upstream.fetchImpl));

      expect(upstream.calls).toHaveLength(2);
      expect(upstream.calls[1]?.body?.messages).toEqual([{ role: "user", content: "สวัสดี" }]);
      expect(events).toEqual([
        {
          type: "response.output_item.done",
          item: { type: "function_call", name: "open_web_page", call_id: "toolu_2", arguments: '{"url":"https://example.com/","title":"ตัวอย่าง"}' }
        },
        COMPLETED
      ]);
    });

    it("ถูกตัดกลางคันซ้ำอีก: เลิกลอง และจบคำตอบโดยไม่ทำตามเครื่องมือที่อ่านไม่ได้", async () => {
      const upstream = fakeAnthropic([broken(CUT_SHORT), broken(CUT_SHORT), fixed()]);
      expect(await readAll(await request(upstream.fetchImpl))).toEqual([COMPLETED]);
      expect(upstream.calls).toHaveLength(2);
    });

    it("ถูกตัดกลางคันหลังส่งข้อความไปแล้ว: ไม่ขอใหม่เพราะข้อความจะซ้ำ ผู้ใช้ได้ข้อความส่วนที่ตอบมาแล้ว", async () => {
      const upstream = fakeAnthropic([broken(CUT_SHORT, spoken), fixed()]);
      expect(await readAll(await request(upstream.fetchImpl))).toEqual([{ type: "response.output_text.delta", delta: "กำลังเปิดให้ครับ" }, COMPLETED]);
      expect(upstream.calls).toHaveLength(1);
    });

    it("ผิดรูปซ้ำอีก: เลิกลองและแจ้งว่าคำตอบมาไม่ครบ", async () => {
      const upstream = fakeAnthropic([broken(GARBLED), broken(GARBLED), fixed()]);
      await expect(readAll(await request(upstream.fetchImpl))).rejects.toThrow();
      expect(upstream.calls).toHaveLength(2);
    });

    it("ผิดรูปหลังส่งข้อความไปแล้ว: ไม่ขอใหม่ แจ้งว่าคำตอบมาไม่ครบแทน", async () => {
      const upstream = fakeAnthropic([broken(GARBLED, spoken), fixed()]);
      await expect(readAll(await request(upstream.fetchImpl))).rejects.toThrow();
      expect(upstream.calls).toHaveLength(1);
    });
  });

  it("ผู้ใช้ยกเลิกก่อนเริ่ม: ไม่นับเป็นคำขอที่ต้นทางปฏิเสธ", async () => {
    const upstream = fakeAnthropic([textReply("ไม่ควรไปถึง")]);
    await expect(request(upstream.fetchImpl, { signal: AbortSignal.abort() })).rejects.toThrow();
  });

  it("ผู้เรียกหยุดอ่านกลางทาง: เลิกรับสตรีมโดยไม่ค้าง", async () => {
    const upstream = fakeAnthropic([textReply("สวัสดีครับ")]);
    const start = await request(upstream.fetchImpl);
    const events: unknown[] = [];

    if (!start.ok) throw new Error("คำขอควรผ่าน");
    await start.events.read((event) => {
      events.push(event);
      return true;
    });
    expect(events).toEqual([{ type: "response.output_text.delta", delta: "สวัสดีครับ" }]);
  });
});

describe("createClaudeAccountProbe", () => {
  const modelInfo = (overrides: Json = {}) =>
    new Response(
      JSON.stringify({
        id: "claude-test",
        type: "model",
        display_name: "Claude Test",
        created_at: "2026-01-01T00:00:00Z",
        lifecycle: "active",
        deprecated_at: null,
        retires_at: null,
        ...overrides
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const probeOf = (replies: Reply[]) => {
    const upstream = fakeAnthropic(replies);
    return { probe: createClaudeAccountProbe({ apiKey: TEST_KEY, baseUrl: BASE, fetchImpl: upstream.fetchImpl }, 2000), calls: upstream.calls };
  };

  it("ถามโมเดลผ่าน Models API ซึ่งไม่มีค่าใช้จ่าย", async () => {
    const { probe, calls } = probeOf([modelInfo()]);
    expect(await probe.lookUpModel("chat", "claude-test")).toEqual({ state: "ok", retiresOn: undefined });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/v1/models/claude-test");
  });

  it("บอกวันปลดระวางของโมเดลที่ถูกประกาศแล้ว และนับโมเดลที่ปลดระวางแล้วว่าใช้ไม่ได้", async () => {
    const deprecated = probeOf([modelInfo({ lifecycle: "deprecated", retires_at: "2027-02-01T00:00:00Z" })]);
    expect(await deprecated.probe.lookUpModel("chat", "claude-test")).toEqual({ state: "ok", retiresOn: "2027-02-01" });

    const retired = probeOf([modelInfo({ lifecycle: "retired", retires_at: "2026-06-15T00:00:00Z" })]);
    expect(await retired.probe.lookUpModel("chat", "claude-test")).toEqual({ state: "model" });
  });

  it.each([
    ["กุญแจผิด", 401, "authentication_error", "auth"],
    ["กุญแจไม่มีสิทธิ์", 403, "permission_error", "auth"],
    ["ไม่พบโมเดล", 404, "not_found_error", "model"],
    ["Anthropic ขัดข้อง", 500, "api_error", "unreachable"]
  ])("ถามโมเดลแล้ว%s", async (_name, status, type, state) => {
    const { probe, calls } = probeOf([jsonReply(status, type, "รายละเอียด")]);
    expect(await probe.lookUpModel("chat", "claude-test")).toEqual({ state });
    // การตรวจต้องจบเร็ว จึงไม่ส่งคำขอซ้ำแม้เป็นข้อผิดพลาดที่ลองใหม่ได้
    expect(calls).toHaveLength(1);
  });

  it("ติดต่อไม่ได้: รายงานว่ายังไม่รู้สถานะ ไม่ throw", async () => {
    const { probe } = probeOf([new TypeError("fetch failed")]);
    expect(await probe.lookUpModel("chat", "claude-test")).toEqual({ state: "unreachable" });
  });

  it("ตรวจเครดิตด้วยคำขอที่เล็กที่สุด", async () => {
    const reply = new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-test",
        content: [{ type: "text", text: "pong" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 8, output_tokens: 3 }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    const { probe, calls } = probeOf([reply]);

    expect(await probe.probeCredits("claude-test")).toBe("ok");
    expect(calls[0]?.method).toBe("POST");
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/v1/messages");
    expect(calls[0]?.body).toEqual({ model: "claude-test", max_tokens: 16, messages: [{ role: "user", content: "ping" }] });
  });

  it.each([
    ["เครดิตหมด", 402, "billing_error", "quota"],
    ["กุญแจถูกยกเลิก", 401, "authentication_error", "auth"],
    ["ผู้ใช้หนาแน่น", 529, "overloaded_error", "unreachable"]
  ])("ตรวจเครดิตแล้ว%s", async (_name, status, type, state) => {
    const { probe } = probeOf([jsonReply(status, type, "รายละเอียด")]);
    expect(await probe.probeCredits("claude-test")).toBe(state);
  });
});
