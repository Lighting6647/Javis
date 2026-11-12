import { createHash } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ทดสอบเส้นทางสนทนาทั้งเส้น (POST /api/chat) ในโหมด Gemini ที่ค้นด้วย Google
 * ตั้งแต่คำขอที่ส่งไปยัง Google จนถึงเหตุการณ์ที่แอปได้รับ รวมถึงทางสำรองเมื่อ Google ปฏิเสธการค้น
 * ต้นทางของ Google ถูกแทนด้วยตัวจำลองในกระบวนการเดียวกัน จึงไม่มีคำขอใดออกเครือข่ายจริง
 */

const GEMINI_ROOT = "https://gemini.invalid/v1beta";
const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect";
const SUGGESTIONS = `<style>.chip { border-radius: 16px; }</style><div class="container"><a class="chip" href="${REDIRECT}/q1">ราคาทองวันนี้</a></div>`;

type Json = Record<string, unknown>;

interface UpstreamCall {
  api: "interactions" | "chat";
  url: string;
  headers: Headers;
  body: Json;
}

interface ChatReply {
  status: number;
  /** ข้อความแจ้งข้อผิดพลาด เมื่อเซิร์ฟเวอร์ไม่ได้ตอบเป็นสตรีม */
  error: string | null;
  events: Json[];
  text: string;
}

const realFetch = globalThis.fetch;
const servers: Server[] = [];

function sse(events: Json[]): Response {
  const body = events
    .map((event) => `${typeof event.event_type === "string" ? `event: ${event.event_type}\n` : ""}data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** คำตอบปฏิเสธแบบของ Google */
function rejected(httpStatus: number, status: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code: httpStatus, message, status } }), {
    status: httpStatus,
    headers: { "content-type": "application/json" }
  });
}

const created = { event_type: "interaction.created", interaction: { id: "int_1", status: "in_progress" } };
const completed = (status = "completed") => ({ event_type: "interaction.completed", interaction: { id: "int_1", status } });

/** คำตอบจากการค้นด้วย Google: ค้น ได้แถบคำค้น ตอบ และอ้างแหล่งที่มา */
const groundedAnswer = (): Response =>
  sse([
    created,
    { event_type: "step.start", index: 0, step: { type: "google_search_call", id: "gs_1", arguments: { queries: ["ราคาทองวันนี้"] } } },
    { event_type: "step.start", index: 1, step: { type: "google_search_result", call_id: "gs_1", result: [{ search_suggestions: SUGGESTIONS }] } },
    { event_type: "step.start", index: 2, step: { type: "model_output", content: [] } },
    { event_type: "step.delta", index: 2, delta: { type: "text", text: "ทองคำแท่งขายออกบาทละ 62,350 บาทครับ" } },
    {
      event_type: "step.delta",
      index: 2,
      delta: { type: "text_annotation_delta", annotations: [{ type: "url_citation", url: `${REDIRECT}/source1`, title: "goldtraders.or.th" }] }
    },
    completed()
  ]);

/** ข้อมูลหนึ่งก้อนของสตรีมแบบ Chat Completions */
const chunk = (delta: Json, finish: string | null = null) => ({
  id: "chatcmpl-1",
  object: "chat.completion.chunk",
  choices: [{ index: 0, delta, finish_reason: finish }]
});

/** คำตอบเป็นข้อความจากโมเดลสนทนา (รูปแบบ Chat Completions) */
const spokenAnswer = (text: string): Response => sse([chunk({ role: "assistant", content: text }), chunk({}, "stop")]);

/** คำตอบจากทางที่ไม่ค้นเว็บ */
const plainAnswer = (): Response => spokenAnswer("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");

interface ToolCall {
  name: string;
  args: Json;
}

/**
 * โมเดลสนทนาเรียกเครื่องมือ (รูปแบบ Chat Completions: ชื่อมาก่อน แล้วอาร์กิวเมนต์ทยอยมาเป็นชิ้น)
 * @param say คำพูดที่โมเดลพูดก่อนเรียกเครื่องมือ ถ้ามี
 */
const toolCalls = (calls: ToolCall[], say?: string): Response =>
  sse([
    chunk({
      role: "assistant",
      content: say ?? null,
      tool_calls: calls.map((call, index) => ({ index, id: `call_${index + 1}`, type: "function", function: { name: call.name, arguments: "" } }))
    }),
    ...calls.flatMap((call, index) => {
      const json = JSON.stringify(call.args);
      const half = Math.ceil(json.length / 2);
      return [json.slice(0, half), json.slice(half)].map((piece) => chunk({ tool_calls: [{ index, function: { arguments: piece } }] }));
    }),
    chunk({}, "tool_calls")
  ]);

/** โมเดลสนทนาขอให้ค้นเว็บผ่านเครื่องมือของ Javis */
const searchRequest = (query: string, say?: string): Response => toolCalls([{ name: "search_web", args: { query } }], say);

type Responder = (call: UpstreamCall) => Response;

/** เปิดการค้นเว็บโดยไม่ตั้งอะไรเพิ่ม: ทางฟรี ซึ่งขั้นค้นใช้โมเดลที่โควตาฟรีค้นด้วย Google ได้ */
const FREE_SEARCH = { WEB_SEARCH_ENABLED: "true" };
/** ตั้งโมเดลค้นให้เป็นตัวเดียวกับโมเดลสนทนา (Gemini 3): ค้นในคำขอเดียวกับคำตอบ */
const INLINE_SEARCH = { WEB_SEARCH_ENABLED: "true", GEMINI_SEARCH_MODEL: "gemini-3.5-flash-lite" };

/**
 * เริ่มเซิร์ฟเวอร์ Javis ชุดใหม่ (สถานะในหน่วยความจำเริ่มใหม่ทุกครั้ง) โดยต่อกับต้นทางจำลอง
 * @param respond ตัดสินว่าต้นทางจำลองตอบคำขอแต่ละครั้งอย่างไร
 */
async function boot(respond: Responder, env: Record<string, string> = FREE_SEARCH) {
  vi.resetModules();
  const settings: Record<string, string> = {
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: "test-gemini-key",
    GEMINI_BASE_URL: `${GEMINI_ROOT}/openai`,
    GEMINI_CHAT_MODEL: "",
    GEMINI_SEARCH_MODEL: "",
    GEMINI_REASONING_EFFORT: "",
    WEB_SEARCH_ENABLED: "",
    // ค่าว่างกันไม่ให้ค่าจริงใน .env.local ของเครื่องนักพัฒนาถูกโหลดเข้ามาในการทดสอบ
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    ACCESS_CODES: "",
    SESSION_SECRET: "",
    ALLOWED_ORIGINS: "",
    CHAT_RATE_LIMIT_MAX: "",
    ...env
  };
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);

  const calls: UpstreamCall[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("http://127.0.0.1:")) return realFetch(input, init);
    // คำขออื่นนอกจากต้นทางจำลองแปลว่ามีโค้ดพยายามออกเครือข่ายจริง
    if (!url.startsWith(GEMINI_ROOT)) throw new Error(`คำขอออกเครือข่ายที่ไม่คาดคิด: ${url}`);

    const call: UpstreamCall = {
      api: url.includes("/interactions") ? "interactions" : "chat",
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Json
    };
    calls.push(call);
    return respond(call);
  };
  vi.stubGlobal("fetch", fakeFetch);

  const warnings: string[] = [];
  vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => void warnings.push(parts.join(" ")));
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  const { createApp } = await import("./app.js");
  const server = createApp().listen(0, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const ask = async (
    content: string,
    history: Array<{ role: "user" | "assistant"; content: string }> = [],
    extra: Json = {}
  ): Promise<ChatReply> => {
    const response = await realFetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...history, { role: "user", content }], ...extra })
    });
    const raw = await response.text();
    if (!response.headers.get("content-type")?.includes("ndjson")) {
      return { status: response.status, error: (JSON.parse(raw) as { error: string }).error, events: [], text: "" };
    }
    const events = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Json);
    const text = events.map((event) => (event.type === "delta" ? String(event.text) : "")).join("");
    return { status: response.status, error: null, events, text };
  };

  return { ask, calls, warnings, apis: () => calls.map((call) => call.api) };
}

const bootInline = (respond: Responder) => boot(respond, INLINE_SEARCH);

const eventOf = (reply: ChatReply, type: string) => reply.events.find((event) => event.type === type);
const configOf = (call: UpstreamCall | undefined) => (call?.body.generation_config ?? {}) as Json;
const toolsOf = (call: UpstreamCall | undefined) => (call?.body.tools ?? []) as Json[];
/** ชื่อเครื่องมือที่ส่งให้โมเดลสนทนา (รูปแบบ Chat Completions) เรียงตามตัวอักษร */
const chatToolNames = (call: UpstreamCall | undefined) =>
  toolsOf(call)
    .map((tool) => String((tool.function as Json | undefined)?.name))
    .sort();
/** คำสั่งระบบที่ส่งให้โมเดลสนทนา (รูปแบบ Chat Completions) */
const chatSystemOf = (call: UpstreamCall | undefined) => String(((call?.body.messages ?? []) as Json[])[0]?.content);

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    })
  );
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/chat: Gemini ค้นด้วย Google ในคำขอเดียวกับคำตอบ (โมเดลค้นตัวเดียวกับโมเดลสนทนา)", () => {
  it("ส่งคำขอไปยัง Interactions API ตามรูปแบบของ Google และส่งคำตอบ แหล่งที่มา กับแถบคำค้นให้แอป", async () => {
    const app = await bootInline(() => groundedAnswer());
    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");

    expect(reply.status).toBe(200);
    expect(reply.events[0]).toEqual({ type: "status", status: "searching" });
    expect(reply.text).toBe("ทองคำแท่งขายออกบาทละ 62,350 บาทครับ");
    expect(eventOf(reply, "sources")).toEqual({ type: "sources", sources: [{ url: `${REDIRECT}/source1`, title: "goldtraders.or.th" }] });
    // แถบคำค้นของ Google ต้องไปถึงแอปตามที่ได้รับ เพราะเงื่อนไขการใช้กำหนดให้แสดงโดยไม่ดัดแปลง
    expect(eventOf(reply, "suggestions")).toEqual({ type: "suggestions", html: [SUGGESTIONS] });

    expect(app.apis()).toEqual(["interactions"]);
    const [call] = app.calls;
    expect(call?.url).toBe(`${GEMINI_ROOT}/interactions?alt=sse`);
    expect(call?.headers.get("x-goog-api-key")).toBe("test-gemini-key");
    expect(call?.headers.get("api-revision")).toBe("2026-05-20");
    expect(call?.headers.get("authorization")).toBeNull();
    expect(call?.body).toMatchObject({
      model: "gemini-3.5-flash-lite",
      stream: true,
      // ไม่ให้ Google เก็บบทสนทนาของผู้ใช้
      store: false,
      input: [{ type: "user_input", content: [{ type: "text", text: "ราคาทองวันนี้เท่าไหร่" }] }],
      generation_config: { thinking_level: "minimal", tool_choice: "validated" }
    });
    expect(toolsOf(call).map((tool) => tool.name ?? tool.type)).toEqual(["google_search", "open_web_page", "remember", "forget_memory"]);
    // โมเดลต้องรู้ว่าค้นเว็บได้ และรู้วันที่ปัจจุบัน จึงจะรู้ว่าเรื่องใดควรค้นก่อนตอบ
    expect(call?.body.system_instruction).toContain("ให้ค้นเว็บก่อนตอบ");
    expect(call?.body.system_instruction).toMatch(/วันนี้คือวัน\S+ที่ \d{1,2} \S+ ค\.ศ\. \d{4} \(พ\.ศ\. \d{4}\) ตามเวลาประเทศไทย/);
  });

  it("ค่าเริ่มต้นไม่ค้นเว็บ: ใช้ทางเดิมอย่างเดียว เพื่อให้โควตาฟรีทำงานเหมือนเดิม", async () => {
    const app = await boot(() => plainAnswer(), {});
    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");

    expect(reply.text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");
    expect(eventOf(reply, "suggestions")).toBeUndefined();
    expect(app.apis()).toEqual(["chat"]);
    expect(chatToolNames(app.calls[0])).toEqual(["forget_memory", "open_web_page", "remember"]);
    expect(app.calls[0]?.url).toBe(`${GEMINI_ROOT}/openai/chat/completions`);
    expect(app.calls[0]?.headers.get("authorization")).toBe("Bearer test-gemini-key");
    expect(JSON.stringify(app.calls[0]?.body)).toContain("ค้นข้อมูลจากเว็บเองไม่ได้");
  });

  it("กุญแจของโควตาฟรี (403): ตอบโดยไม่ค้นเว็บแทนการแจ้งข้อผิดพลาด แล้วไม่ลองค้นอีกจนกว่าจะรีสตาร์ต", async () => {
    const app = await bootInline((call) =>
      call.api === "interactions" ? rejected(403, "PERMISSION_DENIED", "Grounding with Google Search is not available on the free tier.") : plainAnswer()
    );

    const first = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(first.status).toBe(200);
    expect(first.text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");
    expect(app.apis()).toEqual(["interactions", "chat"]);
    // เมื่อค้นไม่ได้ โมเดลต้องถูกบอกว่าห้ามแต่งข้อมูลล่าสุดขึ้นเอง
    expect(JSON.stringify(app.calls[1]?.body)).toContain("ค้นข้อมูลจากเว็บเองไม่ได้");

    await app.ask("สวัสดี");
    expect(app.apis()).toEqual(["interactions", "chat", "chat"]);
    expect(app.warnings.join("\n")).toMatch(/ไม่รับเครื่องมือค้นเว็บ.*เปิดการเรียกเก็บเงิน.*not available on the free tier/);
  });

  it("โควตาค้นเว็บเต็ม (429): ตอบโดยไม่ค้นเว็บ พักการค้นหนึ่งชั่วโมง แล้วกลับมาค้นเอง", async () => {
    let quotaFull = true;
    const app = await bootInline((call) => {
      if (call.api === "chat") return plainAnswer();
      return quotaFull ? rejected(429, "RESOURCE_EXHAUSTED", "Quota exceeded for metric: grounding_search_requests_per_day") : groundedAnswer();
    });

    expect((await app.ask("ราคาทองวันนี้เท่าไหร่")).text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");
    await app.ask("แล้วราคาน้ำมันล่ะ");
    // ระหว่างพัก ไม่ยิงคำขอที่รู้ว่าจะถูกปฏิเสธซ้ำ
    expect(app.apis()).toEqual(["interactions", "chat", "chat"]);
    expect(app.warnings.join("\n")).toMatch(/โควตาค้นเว็บของ Google Gemini เต็ม.*60 นาที/);

    quotaFull = false;
    const later = Date.now() + 61 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const resumed = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(app.apis().at(-1)).toBe("interactions");
    expect(eventOf(resumed, "suggestions")).toBeDefined();
  });

  it("โมเดลไม่รับระดับการคิดตอนค้นเว็บ: ลองใหม่โดยยังค้นเว็บอยู่ และบอกสาเหตุที่แท้จริงใน log", async () => {
    const app = await bootInline((call) => {
      if (call.api === "chat") return plainAnswer();
      return configOf(call).thinking_level ? rejected(400, "INVALID_ARGUMENT", "Thinking level minimal is not supported for this model.") : groundedAnswer();
    });

    const first = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(eventOf(first, "suggestions")).toBeDefined();
    expect(app.apis()).toEqual(["interactions", "interactions"]);
    expect(toolsOf(app.calls[1]).some((tool) => tool.type === "google_search")).toBe(true);

    await app.ask("แล้วราคาน้ำมันล่ะ");
    // คำขอถัดไปไม่ส่งระดับการคิดตั้งแต่แรก จึงไม่มีคำขอที่ถูกปฏิเสธซ้ำ
    expect(app.apis()).toEqual(["interactions", "interactions", "interactions"]);
    expect(configOf(app.calls[2]).thinking_level).toBeUndefined();

    const log = app.warnings.join("\n");
    expect(log).toMatch(/ไม่รับระดับการคิด "minimal" ตอนค้นด้วย Google/);
    expect(log).not.toContain("ไม่รับเครื่องมือค้นเว็บ");
  });

  it("ทางค้นเว็บปฏิเสธรูปแบบคำขอ (400): ตอบโดยไม่ค้นเว็บ และไม่โทษระดับการคิดเมื่อตัดออกแล้วยังไม่ผ่าน", async () => {
    const app = await bootInline((call) => (call.api === "interactions" ? rejected(400, "INVALID_ARGUMENT", 'Unknown name "tool_choice"') : plainAnswer()));

    expect((await app.ask("ราคาทองวันนี้เท่าไหร่")).text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");
    await app.ask("สวัสดี");
    expect(app.apis()).toEqual(["interactions", "interactions", "chat", "chat"]);

    const log = app.warnings.join("\n");
    expect(log).toContain("ไม่รับเครื่องมือค้นเว็บ");
    expect(log).not.toContain("ไม่รับระดับการคิด");
  });

  it("ทางค้นเว็บไม่รู้จักโมเดลที่ตั้งไว้ (404): ตอบผ่านทางเดิมแทนการแจ้งว่าโมเดลใช้ไม่ได้", async () => {
    const app = await bootInline((call) => (call.api === "interactions" ? rejected(404, "NOT_FOUND", "Model is not supported for interactions.") : plainAnswer()));

    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(reply.status).toBe(200);
    expect(reply.text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");
    expect(app.apis()).toEqual(["interactions", "chat"]);
  });

  it("กุญแจผิด: ไม่ลองซ้ำ และบอกผู้ใช้ว่าเป็นปัญหาการตั้งค่าของผู้ดูแล", async () => {
    const app = await bootInline(() => rejected(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key."));

    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(reply.status).toBe(502);
    expect(reply.error).toContain("กุญแจ API ของระบบใช้งานไม่ได้");
    expect(app.apis()).toEqual(["interactions"]);
  });

  it("Google แจ้งโควตาเต็มกลางสตรีม ก่อนส่งคำตอบ: ผู้ใช้ได้ข้อความให้ลองใหม่ ไม่ใช่คำตอบว่าง", async () => {
    const app = await bootInline(() => sse([created, { event_type: "error", error: { code: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }]));

    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(reply.status).toBe(503);
    expect(reply.error).toContain("มีผู้ใช้งานหนาแน่น");
  });

  it("คำตอบถูกตัดก่อนจบ: เก็บข้อความที่ได้ไว้ แต่ไม่เปิดหน้าเว็บจากคำสั่งที่มาไม่ครบ", async () => {
    const app = await bootInline(() =>
      sse([
        created,
        { event_type: "step.start", index: 0, step: { type: "model_output", content: [] } },
        { event_type: "step.delta", index: 0, delta: { type: "text", text: "กำลังเปิดหน้าเว็บให้ครับ" } },
        { event_type: "step.start", index: 1, step: { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา" } } },
        completed("incomplete")
      ])
    );

    const reply = await app.ask("เปิดเว็บกรมอุตุนิยมวิทยาให้หน่อย");
    expect(reply.status).toBe(200);
    expect(reply.text).toBe("กำลังเปิดหน้าเว็บให้ครับ");
    expect(eventOf(reply, "open")).toBeUndefined();
  });

  it("สั่งเปิดหน้าเว็บโดยไม่ได้ค้น: เปิดให้อัตโนมัติ แต่ถ้าค้นเว็บมาก่อนจะให้ผู้ใช้กดเปิดเอง", async () => {
    const openPage = { type: "function_call", id: "fc_1", name: "open_web_page", arguments: { url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา" } };
    let searchFirst = false;
    const app = await bootInline(() =>
      sse([
        created,
        ...(searchFirst ? [{ event_type: "step.start", index: 0, step: { type: "google_search_call", id: "gs_1", arguments: { queries: ["กรมอุตุนิยมวิทยา"] } } }] : []),
        { event_type: "step.start", index: 1, step: openPage },
        completed("requires_action")
      ])
    );

    expect(eventOf(await app.ask("เปิดเว็บกรมอุตุนิยมวิทยาให้หน่อย"), "open")).toMatchObject({ url: "https://www.tmd.go.th/", auto: true });
    searchFirst = true;
    expect(eventOf(await app.ask("ค้นแล้วเปิดเว็บกรมอุตุนิยมวิทยาให้หน่อย"), "open")).toMatchObject({ url: "https://www.tmd.go.th/", auto: false });
  });
});

describe("POST /api/chat: Gemini ค้นด้วย Google เป็นขั้นแยก (ทางฟรี)", () => {
  /** โมเดลสนทนาขอค้นเมื่อมีเครื่องมือขอค้น ส่วนขั้นค้นตอบจากการค้นด้วย Google */
  const searchingModel: Responder = (call) => {
    if (call.api === "interactions") return groundedAnswer();
    return chatToolNames(call).includes("search_web") ? searchRequest("ราคาทองคำวันนี้") : plainAnswer();
  };

  it("คำถามที่ต้องค้น: โมเดลสนทนาขอค้น แล้วเซิร์ฟเวอร์ส่งคำขอค้นแยกไปยังโมเดลที่โควตาฟรีค้นด้วย Google ได้", async () => {
    const app = await boot(searchingModel);
    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");

    expect(reply.status).toBe(200);
    expect(reply.events[0]).toEqual({ type: "status", status: "searching" });
    expect(reply.text).toBe("ทองคำแท่งขายออกบาทละ 62,350 บาทครับ");
    expect(eventOf(reply, "sources")).toEqual({ type: "sources", sources: [{ url: `${REDIRECT}/source1`, title: "goldtraders.or.th" }] });
    expect(eventOf(reply, "suggestions")).toEqual({ type: "suggestions", html: [SUGGESTIONS] });

    expect(app.apis()).toEqual(["chat", "interactions"]);
    const [chat, search] = app.calls;
    // ขั้นแรก: โมเดลสนทนาตัวเดิม ได้เครื่องมือของ Javis ครบ พร้อมเครื่องมือขอค้น
    expect(chat?.body.model).toBe("gemini-3.5-flash-lite");
    expect(chatToolNames(chat)).toEqual(["forget_memory", "open_web_page", "remember", "search_web"]);
    expect(chatSystemOf(chat)).not.toContain("ค้นข้อมูลจากเว็บเองไม่ได้");
    // ขั้นค้น: โมเดลที่โควตาฟรีค้นด้วย Google ได้ มีแต่เครื่องมือค้นของ Google เพราะรุ่นนี้ใช้ร่วมกับเครื่องมืออื่นไม่ได้
    expect(search?.url).toBe(`${GEMINI_ROOT}/interactions?alt=sse`);
    expect(search?.headers.get("x-goog-api-key")).toBe("test-gemini-key");
    expect(search?.body).toMatchObject({
      model: "gemini-2.5-flash-lite",
      stream: true,
      store: false,
      tools: [{ type: "google_search" }],
      input: [{ type: "user_input", content: [{ type: "text", text: "ราคาทองวันนี้เท่าไหร่" }] }]
    });
    expect(configOf(search)).not.toHaveProperty("tool_choice");
    expect(configOf(search)).not.toHaveProperty("thinking_level");
    // คำค้นที่โมเดลสนทนาเสนอถูกส่งต่อให้ขั้นค้น
    expect(search?.body.system_instruction).toContain("ราคาทองคำวันนี้");
  });

  it("คำถามทั่วไป: ตอบในคำขอเดียว ไม่ใช้โควตาค้น และไม่บอกว่ากำลังค้น", async () => {
    const app = await boot(() => spokenAnswer("สวัสดีครับ มีอะไรให้ผมช่วยไหมครับ"));
    const reply = await app.ask("สวัสดี");

    expect(reply.text).toBe("สวัสดีครับ มีอะไรให้ผมช่วยไหมครับ");
    expect(eventOf(reply, "status")).toBeUndefined();
    expect(app.apis()).toEqual(["chat"]);
  });

  it("ขั้นค้นได้รับบทสนทนาทั้งหมด จึงเข้าใจคำถามที่อ้างถึงเรื่องก่อนหน้า", async () => {
    const app = await boot(searchingModel);
    await app.ask("แล้ววันนี้ราคาเท่าไหร่", [
      { role: "user", content: "ทองคำแท่งกับทองรูปพรรณต่างกันยังไง" },
      { role: "assistant", content: "ทองคำแท่งไม่มีค่ากำเหน็จสูงเท่าทองรูปพรรณครับ" }
    ]);

    expect(app.calls[1]?.body.input).toEqual([
      { type: "user_input", content: [{ type: "text", text: "ทองคำแท่งกับทองรูปพรรณต่างกันยังไง" }] },
      { type: "model_output", content: [{ type: "text", text: "ทองคำแท่งไม่มีค่ากำเหน็จสูงเท่าทองรูปพรรณครับ" }] },
      { type: "user_input", content: [{ type: "text", text: "แล้ววันนี้ราคาเท่าไหร่" }] }
    ]);
  });

  it("โมเดลพูดก่อนแล้วจึงขอค้น: คำพูดทั้งสองส่วนไม่ติดกันเป็นคำเดียว", async () => {
    const app = await boot((call) => (call.api === "interactions" ? groundedAnswer() : searchRequest("ราคาทองคำวันนี้", "ขอตรวจสอบสักครู่นะครับ")));
    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");

    expect(reply.text).toBe("ขอตรวจสอบสักครู่นะครับ ทองคำแท่งขายออกบาทละ 62,350 บาทครับ");
  });

  it("ขอค้นพร้อมสั่งจำและเปิดหน้าเว็บในคำขอเดียว: จำเรื่องที่ผู้ใช้บอกได้ แต่หน้าเว็บให้ผู้ใช้กดเปิดเองเพราะรอบนี้อ่านเว็บ", async () => {
    const app = await boot((call) =>
      call.api === "interactions"
        ? groundedAnswer()
        : toolCalls([
            { name: "search_web", args: { query: "ราคาทองคำวันนี้" } },
            { name: "remember", args: { text: "ผู้ใช้ลงทุนในทองคำ" } },
            { name: "open_web_page", args: { url: "https://www.goldtraders.or.th/", title: "สมาคมค้าทองคำ" } }
          ])
    );
    const reply = await app.ask("จำไว้ว่าผมลงทุนในทองคำ แล้วค้นราคาวันนี้ พร้อมเปิดเว็บสมาคมค้าทองคำให้ด้วย");

    expect(eventOf(reply, "memory")).toEqual({ type: "memory", added: ["ผู้ใช้ลงทุนในทองคำ"], removed: [] });
    expect(eventOf(reply, "open")).toEqual({ type: "open", url: "https://www.goldtraders.or.th/", title: "สมาคมค้าทองคำ", auto: false });
    // คำตอบมาจากขั้นค้น ไม่มีประโยคเติมซ้ำ และมีการเรียกโมเดลแค่สองครั้ง
    expect(reply.text).toBe("ทองคำแท่งขายออกบาทละ 62,350 บาทครับ");
    expect(app.apis()).toEqual(["chat", "interactions"]);
  });

  it("โควตาค้นของวันนั้นเต็ม (429): ตอบโดยไม่ค้นแทนการแจ้งข้อผิดพลาด พักการค้นหนึ่งชั่วโมง แล้วกลับมาค้นเอง", async () => {
    let quotaFull = true;
    const app = await boot((call) => {
      if (call.api === "interactions") return quotaFull ? rejected(429, "RESOURCE_EXHAUSTED", "Quota exceeded for metric: grounding requests per day") : groundedAnswer();
      return chatToolNames(call).includes("search_web") ? searchRequest("ราคาทองคำวันนี้") : plainAnswer();
    });

    const first = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(first.status).toBe(200);
    expect(first.text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");
    // ไม่ได้ค้นจริง จึงไม่บอกผู้ใช้ว่ากำลังค้น
    expect(eventOf(first, "status")).toBeUndefined();
    expect(app.apis()).toEqual(["chat", "interactions", "chat"]);
    // คำขอสำรองบอกโมเดลว่าค้นไม่ได้ และไม่ให้เครื่องมือ เพราะเครื่องมือของขั้นแรกถูกทำไปแล้ว
    expect(chatSystemOf(app.calls[2])).toContain("ค้นข้อมูลจากเว็บเองไม่ได้");
    expect(chatToolNames(app.calls[2])).toEqual([]);

    await app.ask("แล้วราคาน้ำมันล่ะ");
    // ระหว่างพัก โมเดลไม่ได้เครื่องมือขอค้น จึงไม่มีคำขอค้นที่รู้ว่าจะถูกปฏิเสธ
    expect(app.apis()).toEqual(["chat", "interactions", "chat", "chat"]);
    expect(chatToolNames(app.calls[3])).not.toContain("search_web");
    expect(app.warnings.join("\n")).toMatch(/โควตาค้นเว็บของ Google Gemini เต็ม.*60 นาที/);

    quotaFull = false;
    const later = Date.now() + 61 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const resumed = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(app.apis().slice(4)).toEqual(["chat", "interactions"]);
    expect(eventOf(resumed, "suggestions")).toBeDefined();
  });

  it.each([
    [400, "INVALID_ARGUMENT", "Search grounding is not supported for this model."],
    [403, "PERMISSION_DENIED", "Grounding with Google Search is not enabled for this project."],
    [404, "NOT_FOUND", "models/gemini-2.5-flash-lite is no longer available."]
  ])("Google ปฏิเสธขั้นค้น (%i): ตอบโดยไม่ค้นแทนการแจ้งข้อผิดพลาด แล้วไม่ขอค้นอีกจนกว่าจะรีสตาร์ต", async (httpStatus, status, message) => {
    const app = await boot((call) => {
      if (call.api === "interactions") return rejected(httpStatus, status, message);
      return chatToolNames(call).includes("search_web") ? searchRequest("ราคาทองคำวันนี้") : plainAnswer();
    });

    const first = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(first.status).toBe(200);
    expect(first.text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");

    await app.ask("แล้วราคาน้ำมันล่ะ");
    expect(app.apis()).toEqual(["chat", "interactions", "chat", "chat"]);
    expect(chatToolNames(app.calls[3])).not.toContain("search_web");
    // ผู้ดูแลต้องรู้ว่าโมเดลใดค้นไม่ได้ และ Google ให้เหตุผลว่าอะไร
    const log = app.warnings.join("\n");
    expect(log).toContain("gemini-2.5-flash-lite");
    expect(log).toContain(message);
  });

  it("ขั้นค้นล้มเหลวกลางทางก่อนมีคำตอบ: ผู้ใช้ได้ข้อความให้ลองใหม่ ไม่ใช่คำตอบว่าง", async () => {
    const app = await boot((call) =>
      call.api === "interactions"
        ? sse([created, { event_type: "error", error: { code: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }])
        : searchRequest("ราคาทองคำวันนี้")
    );

    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(app.apis()).toEqual(["chat", "interactions"]);
    expect(reply.status).toBe(503);
    expect(reply.error).toContain("มีผู้ใช้งานหนาแน่น");
  });

  it("ขั้นค้นจบโดยไม่มีข้อความ: บอกผู้ใช้ว่าค้นไม่สำเร็จ แทนการส่งคำตอบว่าง", async () => {
    const app = await boot((call) => (call.api === "interactions" ? sse([created, completed()]) : searchRequest("ราคาทองคำวันนี้")));

    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");
    expect(reply.status).toBe(200);
    expect(reply.text).toMatch(/ค้น.*ไม่สำเร็จ/);
  });

  describe("ช่องวินิจฉัยของผู้ดูแล", () => {
    // ค่าทดสอบเท่านั้น เซิร์ฟเวอร์รู้จักเฉพาะค่าแฮชของรหัสนี้
    const TOKEN = "diagnostic-token-used-only-in-tests";
    const withToken = { ...FREE_SEARCH, DIAGNOSTIC_TOKEN_SHA256: createHash("sha256").update(TOKEN).digest("hex") };
    const refusedSearch: Responder = (call) => {
      if (call.api === "interactions") return rejected(403, "PERMISSION_DENIED", "Grounding with Google Search is not enabled for this project.");
      return chatToolNames(call).includes("search_web") ? searchRequest("ราคาทองคำวันนี้") : plainAnswer();
    };

    it("คำขอที่แนบรหัสถูกต้อง: ได้รายการคำขอที่ส่งไปยัง Google พร้อมสถานะและเหตุผลที่ถูกปฏิเสธ", async () => {
      const app = await boot(refusedSearch, withToken);
      const reply = await app.ask("ราคาทองวันนี้เท่าไหร่", [], { diagnose: TOKEN });

      const diagnostic = eventOf(reply, "diagnostic") as { attempts: Array<{ target: string; status: number; detail?: string }> } | undefined;
      expect(diagnostic?.attempts.map((attempt) => [attempt.target.split(" ")[0], attempt.status])).toEqual([
        ["chat", 200],
        ["interactions", 403],
        ["chat", 200]
      ]);
      expect(diagnostic?.attempts[1]?.detail).toBe("Grounding with Google Search is not enabled for this project.");
      // ผู้ใช้ยังได้คำตอบตามปกติ
      expect(reply.text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");
    });

    it.each([
      ["ไม่แนบรหัส", {}],
      ["รหัสผิด", { diagnose: "not-the-token" }]
    ])("%s: คำตอบไม่มีข้อมูลวินิจฉัย", async (_name, extra) => {
      const app = await boot(refusedSearch, withToken);
      const reply = await app.ask("ราคาทองวันนี้เท่าไหร่", [], extra);

      expect(eventOf(reply, "diagnostic")).toBeUndefined();
      expect(reply.text).toBe("ตอนนี้ผมไม่มีข้อมูลราคาล่าสุดครับ");
    });

    it("ผู้ถือรหัสลองโมเดลค้นตัวอื่นได้ในคำขอเดียว ส่วนคำขอทั่วไปเปลี่ยนโมเดลไม่ได้", async () => {
      const app = await boot(searchingModel, withToken);

      await app.ask("ราคาทองวันนี้เท่าไหร่", [], { diagnose: TOKEN, searchModel: "gemini-3.6-flash" });
      expect(app.calls[1]?.body.model).toBe("gemini-3.6-flash");

      // ไม่มีรหัส: ค่าที่ส่งมาถูกเมิน ไม่เช่นนั้นใครก็เลือกโมเดลที่มีค่าใช้จ่ายสูงกว่าได้
      await app.ask("ราคาทองวันนี้เท่าไหร่", [], { searchModel: "gemini-3.6-flash" });
      expect(app.calls[3]?.body.model).toBe("gemini-2.5-flash-lite");
    });

    it("การลองโมเดลค้นของผู้ถือรหัสไม่เปลี่ยนสถานะการค้นของผู้ใช้ทั่วไป ไม่ว่าจะถูกปฏิเสธหรือเคยถูกปิดไว้", async () => {
      const app = await boot((call) => {
        if (call.api === "interactions") {
          return call.body.model === "gemini-3.6-flash" ? rejected(403, "PERMISSION_DENIED", "Search grounding is not available.") : groundedAnswer();
        }
        return chatToolNames(call).includes("search_web") ? searchRequest("ราคาทองคำวันนี้") : plainAnswer();
      }, withToken);

      // ลองโมเดลที่ถูกปฏิเสธ: ผู้ใช้ทั่วไปยังค้นได้ตามเดิม
      await app.ask("ราคาทองวันนี้เท่าไหร่", [], { diagnose: TOKEN, searchModel: "gemini-3.6-flash" });
      const normal = await app.ask("ราคาทองวันนี้เท่าไหร่");
      expect(eventOf(normal, "suggestions")).toBeDefined();
      expect(app.warnings.join("\n")).not.toContain("ปิดการค้นเว็บ");
    });

    it("เซิร์ฟเวอร์ที่ไม่ได้ตั้งค่าแฮชของรหัส: ไม่มีรหัสใดใช้ได้", async () => {
      const app = await boot(refusedSearch, { ...FREE_SEARCH, DIAGNOSTIC_TOKEN_SHA256: "" });
      const reply = await app.ask("ราคาทองวันนี้เท่าไหร่", [], { diagnose: TOKEN });

      expect(eventOf(reply, "diagnostic")).toBeUndefined();
    });
  });

  it("ตั้งโมเดลสนทนาเป็นรุ่น 2.5 เอง: ยังค้นเป็นขั้นแยก เพราะรุ่นนี้ใช้การค้นร่วมกับเครื่องมืออื่นไม่ได้", async () => {
    const app = await boot(searchingModel, { ...FREE_SEARCH, GEMINI_CHAT_MODEL: "gemini-2.5-flash-lite" });
    const reply = await app.ask("ราคาทองวันนี้เท่าไหร่");

    expect(eventOf(reply, "suggestions")).toBeDefined();
    expect(app.apis()).toEqual(["chat", "interactions"]);
    expect(app.calls.map((call) => call.body.model)).toEqual(["gemini-2.5-flash-lite", "gemini-2.5-flash-lite"]);
  });
});
