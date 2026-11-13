// ต้นทางจำลองของ Gemini สำหรับทดสอบ Javis ทั้งระบบ โดยไม่ติดต่อ Google จริงและไม่ใช้กุญแจจริง
// มีสองทางเหมือนของจริง: Interactions API (ค้นด้วย Google ได้) และทางที่เข้ากันได้กับ OpenAI (ไม่ค้นเว็บ)
// ตรวจรูปแบบคำขอของ Interactions ตามเอกสารของ Google และนิยามชนิดข้อมูลใน SDK ทางการ
import http from "node:http";
import { MEETING_SUMMARY, MEETING_TAG } from "./meeting-fixture.mjs";

const PORT = Number(process.env.MOCK_PORT || 8799);
const EXPECTED_KEY = process.env.MOCK_KEY || "test-gemini-key";
// ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริง
const TAVILY_KEY = "tvly-test-only-not-a-real-key";
// ผลค้นที่กำหนดเอง (JSON) สำหรับการตรวจในเบราว์เซอร์ที่ต้องการให้แหล่งข้อมูลชี้ไปยังหน้าทดลอง
const CUSTOM_TAVILY_RESULTS = process.env.MOCK_TAVILY_RESULTS ? JSON.parse(process.env.MOCK_TAVILY_RESULTS) : null;
const API_REVISION = "2026-05-20";

/** ok | no-grounding | search-quota | bad-request | strict-thinking | no-interactions-model | auth */
let mode = "ok";
const requests = [];
const rejections = [];

const json = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};
/** ข้อผิดพลาดแบบของ Google */
const reject = (response, httpStatus, status, message, kind) => {
  rejections.push(kind);
  json(response, httpStatus, { error: { code: httpStatus, message, status } });
};

const readBody = (request) =>
  new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
  });

function writeSse(response, events, withEventName = true) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of events) {
    const name = withEventName && event.event_type ? `event: ${event.event_type}\n` : "";
    response.write(`${name}data: ${JSON.stringify(event)}\n\n`);
  }
  response.end();
}

/** สไตล์ของแถบคำค้น โครงเดียวกับที่ Google ส่ง: มีทั้งโหมดสว่างและมืดตามการตั้งค่าของอุปกรณ์ */
const SUGGESTION_STYLES = `<style>
.container { align-items: center; border-radius: 8px; display: flex; font-family: Google Sans, Roboto, sans-serif; font-size: 14px; line-height: 20px; padding: 8px 12px; }
.chip { display: inline-block; border: solid 1px; border-radius: 16px; min-width: 14px; padding: 5px 16px; text-align: center; user-select: none; margin: 0 8px; -webkit-tap-highlight-color: transparent; }
.carousel { overflow: auto; scrollbar-width: none; white-space: nowrap; margin-right: -12px; }
.headline { display: flex; margin-right: 4px; }
.gradient-container { position: relative; }
.gradient { position: absolute; transform: translate(3px, -9px); height: 36px; width: 9px; }
@media (prefers-color-scheme: light) {
  .container { background-color: #fafafa; box-shadow: 0 0 0 1px #0000000f; }
  .chip { background-color: #ffffff; border-color: #d2d2d2; color: #5e5e5e; text-decoration: none; }
  .chip:hover { background-color: #f2f2f2; }
  .chip:focus { background-color: #f2f2f2; }
  .chip:active { background-color: #d8d8d8; border-color: #b6b6b6; }
  .logo-dark { display: none; }
  .gradient { background: linear-gradient(90deg, #fafafa 15%, #fafafa00 100%); }
}
@media (prefers-color-scheme: dark) {
  .container { background-color: #1f1f1f; box-shadow: 0 0 0 1px #ffffff26; }
  .chip { background-color: #2c2c2c; border-color: #3c4043; color: #fff; text-decoration: none; }
  .chip:hover { background-color: #353536; }
  .chip:focus { background-color: #353536; }
  .chip:active { background-color: #464849; border-color: #53575b; }
  .logo-light { display: none; }
  .gradient { background: linear-gradient(90deg, #1f1f1f 15%, #1f1f1f00 100%); }
}
</style>`;

const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect";

/** แถบคำค้นที่เกี่ยวข้อง โครงเดียวกับที่ Google ส่ง: สไตล์ในตัว โลโก้ SVG สองแบบ และลิงก์คำค้นที่พาไปหน้าผลค้นหา */
const SEARCH_SUGGESTIONS = `${SUGGESTION_STYLES}
<div class="container">
  <div class="headline">
    <svg class="logo-light" width="18" height="18" viewBox="9 9 35 35" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M26 10a16 16 0 1 0 0 32a16 16 0 1 0 0-32Zm0 6a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z" fill="#4285F4"/>
      <path d="M26 23h15v6H26z" fill="#4285F4"/>
    </svg>
    <svg class="logo-dark" width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="23" fill="#FFF" r="22"/>
      <path d="M24 10a13 13 0 1 0 0 26a13 13 0 1 0 0-26Zm0 5a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z" fill="#4285F4"/>
      <path d="M24 21h12v5H24z" fill="#4285F4"/>
    </svg>
    <div class="gradient-container"><div class="gradient"></div></div>
  </div>
  <div class="carousel">
    <a class="chip" href="${REDIRECT}/MockQueryNewsToday">ข่าววันนี้</a>
    <a class="chip" href="${REDIRECT}/MockQueryEconomy">ข่าวเศรษฐกิจล่าสุด</a>
    <a class="chip" href="${REDIRECT}/MockQueryGold">ราคาทองคำวันนี้ สมาคมค้าทองคำ</a>
    <a class="chip" href="${REDIRECT}/MockQueryRate">อัตราดอกเบี้ยนโยบาย ธนาคารแห่งประเทศไทย ล่าสุด</a>
  </div>
</div>`;

/** แถบคำค้นที่มีสิ่งแปลกปลอมปนมา ใช้ทดสอบว่าหน้าเว็บไม่รัน ไม่โหลด และไม่ทำให้ลิงก์อันตรายกดได้ (ของ Google จริงไม่มีสิ่งเหล่านี้) */
const TAMPERED_SUGGESTIONS = `${SUGGESTION_STYLES}
<style>:host { position: fixed !important; inset: 0 !important; z-index: 99999 !important; } @import url("https://tracker.example.com/style.css");</style>
<div class="container">
  <div class="headline">
    <svg class="logo-light" width="18" height="18" viewBox="9 9 35 35" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="12" fill="#34A853" onclick="window.__suggestionScriptRan = true"/>
      <foreignObject width="10" height="10"><iframe src="https://tracker.example.com/frame"></iframe></foreignObject>
    </svg>
  </div>
  <div class="carousel">
    <a class="chip" href="${REDIRECT}/MockQuerySafe" onclick="window.__suggestionScriptRan = true" style="color: red">คำค้นปกติ</a>
    <a class="chip" href="javascript:window.__suggestionScriptRan = true">ลิงก์ที่ไม่ปลอดภัย</a>
    <a class="chip" href="data:text/html,<script>parent.__suggestionScriptRan = true</script>">ลิงก์ข้อมูลฝัง</a>
  </div>
</div>
<form action="https://tracker.example.com/collect"><input name="secret" value="x"><button>ส่ง</button></form>
<script>window.__suggestionScriptRan = true;</script>
<img src="https://tracker.example.com/pixel.png" onerror="window.__suggestionScriptRan = true">`;

const created = { event_type: "interaction.created", interaction: { id: "int_mock", status: "in_progress", model: "mock" } };
const completed = (status = "completed") => ({ event_type: "interaction.completed", interaction: { id: "int_mock", status, usage: { total_tokens: 42 } } });
const start = (index, step) => ({ event_type: "step.start", index, step });
const delta = (index, value) => ({ event_type: "step.delta", index, delta: value });
const stop = (index) => ({ event_type: "step.stop", index });

function textStep(index, text, annotations = []) {
  const half = Math.ceil(text.length / 2);
  return [
    start(index, { type: "model_output", content: [] }),
    delta(index, { type: "text", text: text.slice(0, half) }),
    delta(index, { type: "text", text: text.slice(half) }),
    ...(annotations.length > 0 ? [delta(index, { type: "text_annotation_delta", annotations })] : []),
    stop(index)
  ];
}
const thought = (index) => [start(index, { type: "thought", signature: "sig-mock" }), delta(index, { type: "thought_signature", signature: "sig-mock" }), stop(index)];
const search = (index, query, suggestions = SEARCH_SUGGESTIONS) => [
  start(index, { type: "google_search_call", id: "gs_mock", search_type: "web_search", arguments: { queries: [query] } }),
  stop(index),
  start(index + 1, { type: "google_search_result", call_id: "gs_mock", result: [{ search_suggestions: suggestions }] }),
  stop(index + 1)
];
const callWhole = (index, name, args) => [start(index, { type: "function_call", id: `fc_${name}`, name, arguments: args }), stop(index)];
function callStreamed(index, name, args) {
  const raw = JSON.stringify(args);
  const half = Math.ceil(raw.length / 2);
  return [
    start(index, { type: "function_call", id: `fc_${name}`, name, arguments: {} }),
    delta(index, { type: "arguments_delta", arguments: raw.slice(0, half) }),
    delta(index, { type: "arguments_delta", arguments: raw.slice(half) }),
    stop(index)
  ];
}

/** ตรวจรูปแบบคำขอของ Interactions API คืนข้อความถ้าผิด */
function interactionProblem(body) {
  if (!body || typeof body !== "object") return "Request body is not valid JSON";
  const known = new Set(["model", "input", "system_instruction", "tools", "generation_config", "stream", "store"]);
  const unknown = Object.keys(body).filter((key) => !known.has(key));
  if (unknown.length > 0) return `Unknown name "${unknown[0]}": Cannot find field.`;
  if (typeof body.model !== "string") return "model is required";
  if (body.stream !== true) return "this mock only serves streaming requests";
  if (typeof body.system_instruction !== "string") return "system_instruction must be a string";

  if (!Array.isArray(body.input) || body.input.length === 0) return "input: at least one step is required";
  const types = body.input.map((step) => step?.type);
  if (types.some((type) => type !== "user_input" && type !== "model_output")) return "input: unsupported step type";
  if (types[0] !== "user_input" || types.at(-1) !== "user_input") return "input: must start and end with user_input";
  if (types.some((type, index) => index > 0 && type === types[index - 1])) return "input: turns must alternate";
  if (body.input.some((step) => !Array.isArray(step.content) || step.content.some((part) => part?.type !== "text" || typeof part.text !== "string"))) {
    return "input: content must be a list of text parts";
  }

  const tools = body.tools ?? [];
  for (const tool of tools) {
    if (tool.type === "google_search") continue;
    if (tool.type !== "function" || typeof tool.name !== "string" || tool.parameters?.type !== "object") return "tools: invalid function declaration";
    if (JSON.stringify(tool).includes("additionalProperties")) return 'tools: Unknown name "additionalProperties"';
    if ("function" in tool || "strict" in tool) return "tools: OpenAI-style function wrapper is not accepted here";
  }
  const hasSearch = tools.some((tool) => tool.type === "google_search");
  const hasFunctions = tools.some((tool) => tool.type === "function");
  const config = body.generation_config ?? {};
  if (hasSearch && hasFunctions && config.tool_choice !== "validated") return "tool_choice: auto mode is not supported when combining built-in tools with function calling";
  if (config.thinking_level !== undefined && !["minimal", "low", "medium", "high"].includes(config.thinking_level)) return "generation_config.thinking_level: invalid value";
  // กติกาของ Gemini 2: ใช้เครื่องมือค้นร่วมกับฟังก์ชันไม่ได้ และตั้งค่าขั้นคิดคนละแบบกับรุ่น 3
  if (/^(models\/)?gemini-2[.-]/.test(body.model)) {
    if (hasSearch && hasFunctions) return "Combining built-in tools with function calling is only supported on Gemini 3 and newer models";
    if (config.thinking_level !== undefined) return "generation_config.thinking_level is not supported for this model";
  }
  return null;
}

function describeInteraction(request, body) {
  const tools = body.tools ?? [];
  const lastUser = [...body.input].reverse().find((step) => step.type === "user_input");
  return {
    api: "interactions",
    url: request.url,
    keyHeader: request.headers["x-goog-api-key"] ?? null,
    authorization: request.headers.authorization ?? null,
    revision: request.headers["api-revision"] ?? null,
    model: body.model,
    store: body.store,
    stream: body.stream,
    instructions: body.system_instruction,
    tools: tools.map((tool) => (tool.type === "function" ? `function:${tool.name}` : tool.type)),
    toolChoice: body.generation_config?.tool_choice ?? null,
    thinkingLevel: body.generation_config?.thinking_level ?? null,
    maxTokens: body.generation_config?.max_output_tokens ?? null,
    turns: body.input.map((step) => step.type),
    lastUser: lastUser?.content?.map((part) => part.text).join("") ?? ""
  };
}

/** เลือกคำตอบของ Interactions จากข้อความล่าสุดของผู้ใช้ */
function interactionReply(seen) {
  const said = seen.lastUser;
  const has = (name) => seen.tools.includes(`function:${name}`);
  const canSearch = seen.tools.includes("google_search");
  const citation = { type: "url_citation", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/MockRedirect123", title: "news.example.com", start_index: 0, end_index: 20 };

  if (said.includes(MEETING_TAG)) return [created, ...thought(0), ...textStep(1, MEETING_SUMMARY), completed()];
  if (said.includes("ล้มกลางทาง")) return [created, { event_type: "error", error: { code: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }];
  if (said.includes("ตอบยาวเกิน")) return [created, ...textStep(0, "คำตอบที่ถูกตัด"), start(1, { type: "function_call", id: "fc_cut", name: "open_web_page", arguments: { url: "https://cut.exa" } }), completed("incomplete")];
  if (said.includes("ค้นแล้วเปิด") && canSearch) {
    return [created, ...thought(0), ...search(1, "เว็บข่าว"), ...callWhole(3, "open_web_page", { url: "https://news.example.com/", title: "ข่าว" }), completed("requires_action")];
  }
  if (said.includes("แปลกปลอม") && canSearch) {
    return [created, ...thought(0), ...search(1, said, TAMPERED_SUGGESTIONS), ...textStep(3, "คำตอบนี้มาพร้อมแถบคำค้นที่มีสิ่งแปลกปลอมครับ", [citation]), completed()];
  }
  if ((said.includes("ข่าว") || said.includes("ราคา")) && canSearch) {
    return [created, ...thought(0), ...search(1, said), ...textStep(3, "วันนี้มีข่าวเด่นเรื่องเศรษฐกิจครับ", [citation]), completed()];
  }
  if (said.includes("เปิดเว็บ") && has("open_web_page")) {
    return [created, ...textStep(0, "ได้ครับ เปิดให้แล้ว"), ...callWhole(1, "open_web_page", { url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา" }), completed("requires_action")];
  }
  if (said.includes("จำไว้ว่า") && has("remember")) {
    return [created, ...thought(0), ...callStreamed(1, "remember", { text: said.split("จำไว้ว่า")[1].trim() }), completed("requires_action")];
  }
  return [created, ...thought(0), ...textStep(1, "สวัสดีครับ ผม Javis ยินดีช่วยครับ"), completed()];
}

/**
 * ทางที่เข้ากันได้กับ OpenAI: ตอบแบบ Chat Completions ค้นเว็บเองไม่ได้
 * แต่เรียกเครื่องมือของ Javis ได้ รวมถึงเครื่องมือขอค้นเว็บ (search_web) เมื่อ Javis ส่งมาให้
 */
function chatReply(body) {
  const lastUser = [...(body.messages ?? [])].reverse().find((message) => message.role === "user")?.content ?? "";
  const tools = (body.tools ?? []).map((tool) => tool.function?.name);
  const chunk = (delta, finish = null) => ({ id: "chatcmpl-mock", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] });
  const speak = (text) => [chunk({ role: "assistant", content: text.slice(0, 8) }), chunk({ content: text.slice(8) }), chunk({}, "stop")];
  const call = (calls, say) => [
    chunk({
      role: "assistant",
      content: say ?? null,
      tool_calls: calls.map((each, index) => ({ index, id: `call_${index + 1}`, type: "function", function: { name: each.name, arguments: JSON.stringify(each.args) } }))
    }),
    chunk({}, "tool_calls")
  ];

  if (lastUser.includes(MEETING_TAG)) return speak(MEETING_SUMMARY);
  if (lastUser.includes("[ข้อความจากระบบ")) return speak("รับทราบครับ จัดการเรื่องความจำให้แล้ว");
  // ขั้นตอบจากผลค้นของบริการค้นเว็บภายนอก: ผลค้นอยู่ในคำสั่งระบบ
  const system = body.messages?.[0]?.content ?? "";
  if (system.includes("ผลการค้นเว็บด้วยคำค้น")) {
    return speak(system.includes("62,350") ? "จากผลค้น ทองคำแท่งขายออกบาทละ 62,350 บาทครับ" : "ผมค้นแล้วแต่ไม่พบข้อมูลเรื่องนี้ครับ");
  }
  const canSearch = tools.includes("search_web");
  if (lastUser.includes("ค้นแล้วเปิด") && canSearch) {
    return call([
      { name: "search_web", args: { query: "เว็บข่าว" } },
      { name: "open_web_page", args: { url: "https://news.example.com/", title: "ข่าว" } }
    ]);
  }
  if (lastUser.includes("พูดก่อนค้น") && canSearch) return call([{ name: "search_web", args: { query: "ข่าววันนี้" } }], "ขอตรวจสอบสักครู่นะครับ");
  if ((lastUser.includes("ข่าว") || lastUser.includes("ราคา") || lastUser.includes("แปลกปลอม")) && canSearch) {
    return call([{ name: "search_web", args: { query: lastUser.slice(0, 60) } }]);
  }
  // เรียกเครื่องมืออื่นเฉพาะตอนที่ Javis ให้เครื่องมือขอค้นมาด้วย (ทางฟรีแบบสองจังหวะ) คำขอสำรองที่ไม่ค้นเว็บจึงตอบเป็นข้อความเสมอ
  if (canSearch && lastUser.includes("เปิดเว็บ") && tools.includes("open_web_page")) {
    return call([{ name: "open_web_page", args: { url: "https://www.tmd.go.th/", title: "กรมอุตุนิยมวิทยา" } }], "ได้ครับ เปิดให้แล้ว");
  }
  if (canSearch && lastUser.includes("จำไว้ว่า") && tools.includes("remember")) {
    return call([{ name: "remember", args: { text: lastUser.split("จำไว้ว่า")[1].trim() } }]);
  }
  return speak("ตอบจากทางเดิมที่ไม่ค้นเว็บครับ");
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === "/__requests") return json(response, 200, requests);
  if (path === "/__rejections") return json(response, 200, rejections);
  if (path.startsWith("/__mode/")) {
    mode = path.slice("/__mode/".length);
    return json(response, 200, { mode });
  }

  // บริการค้นเว็บ Tavily จำลอง (อยู่ในกระบวนการเดียวกันเพื่อความง่าย): ใช้กุญแจของตัวเอง คนละตัวกับของ Gemini
  if (request.method === "POST" && path === "/search") {
    const body = await readBody(request);
    const tavilyKey = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const seen = { api: "tavily", url: request.url, authorization: request.headers.authorization ?? null, keyHeader: request.headers["x-goog-api-key"] ?? null, body };
    if (tavilyKey !== TAVILY_KEY || mode === "tavily-auth") {
      rejections.push("tavily_auth");
      return json(response, 401, { detail: { error: `Unauthorized: missing or invalid API key ${tavilyKey}.` } });
    }
    if (mode === "tavily-quota") {
      rejections.push("tavily_quota");
      return json(response, 432, { detail: { error: "This request exceeds your plan's set usage limit." } });
    }
    if (typeof body?.query !== "string" || !body.query || body.search_depth !== "basic") {
      rejections.push("tavily_shape");
      return json(response, 400, { detail: { error: "Invalid request" } });
    }
    requests.push(seen);
    return json(response, 200, {
      query: body.query,
      response_time: 0.9,
      results: CUSTOM_TAVILY_RESULTS ?? [
        { title: "ราคาทองคำวันนี้ | สมาคมค้าทองคำ", url: "https://www.goldtraders.or.th/", content: "ทองคำแท่ง ขายออก 62,350 บาท รับซื้อ 62,250 บาท", score: 0.93 },
        { title: "ราคาทองวันนี้ล่าสุด", url: "https://www.thairath.co.th/money/gold", content: "ราคาทองคำเปิดตลาดปรับขึ้น 100 บาท", score: 0.81 },
        { title: "ลิงก์ที่ไม่ปลอดภัย", url: "javascript:alert(1)", content: "ต้องถูกทิ้ง", score: 0.5 }
      ]
    });
  }

  const key = request.headers["x-goog-api-key"] ?? String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (mode === "auth" || key !== EXPECTED_KEY) {
    return reject(response, 400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", "auth");
  }

  if (request.method === "GET" && path.startsWith("/models/")) return json(response, 200, { id: decodeURIComponent(path.slice("/models/".length)), object: "model" });

  if (request.method === "POST" && path === "/interactions") {
    const body = await readBody(request);
    if (request.headers["api-revision"] !== API_REVISION) return reject(response, 400, "INVALID_ARGUMENT", "Unsupported Api-Revision", "revision");
    if (url.searchParams.get("alt") !== "sse") return reject(response, 400, "INVALID_ARGUMENT", "alt=sse is required for streaming", "alt");
    if (request.headers.authorization) return reject(response, 400, "INVALID_ARGUMENT", "Use x-goog-api-key, not Authorization", "auth_header");
    const problem = interactionProblem(body);
    if (problem) return reject(response, 400, "INVALID_ARGUMENT", problem, "shape");

    const seen = describeInteraction(request, body);
    const grounded = seen.tools.includes("google_search");
    if (mode === "no-interactions-model") {
      return reject(response, 404, "NOT_FOUND", `models/${body.model} is not found for API version v1beta, or is not supported for interactions.`, "not_found");
    }
    if (mode === "strict-thinking" && seen.thinkingLevel !== null) {
      return reject(response, 400, "INVALID_ARGUMENT", `Thinking level ${seen.thinkingLevel} is not supported for this model.`, "thinking");
    }
    if (mode === "no-grounding" && grounded) {
      return reject(response, 403, "PERMISSION_DENIED", "Grounding with Google Search is not available on the free tier. Enable billing to use it.", "grounding");
    }
    if (mode === "search-quota" && grounded) {
      return reject(response, 429, "RESOURCE_EXHAUSTED", "Quota exceeded for metric: grounding_search_requests_per_day", "search_quota");
    }
    if (mode === "bad-request") {
      // ข้อความที่มีสิ่งที่ดูเหมือนกุญแจปนมา ใช้ตรวจว่า log ถูกปิดบัง (ค่าปลอม ประกอบขึ้นตอนรัน)
      const fakeKey = `${"AI"}${"za"}SyFAKEfake0000notarealkey00`;
      return reject(response, 400, "INVALID_ARGUMENT", `Invalid JSON payload received. Unknown name "foo" (key ${fakeKey})`, "bad_request");
    }

    requests.push(seen);
    return writeSse(response, interactionReply(seen));
  }

  if (request.method === "POST" && path === "/chat/completions") {
    const body = await readBody(request);
    requests.push({
      api: "chat",
      url: request.url,
      authorization: request.headers.authorization ?? null,
      model: body?.model,
      tools: (body?.tools ?? []).map((tool) => `function:${tool.function?.name}`),
      reasoningEffort: body?.reasoning_effort ?? null,
      maxTokens: body?.max_completion_tokens ?? body?.max_tokens ?? null,
      roles: (body?.messages ?? []).map((message) => message.role),
      instructions: body?.messages?.[0]?.content ?? "",
      lastUser: [...(body?.messages ?? [])].reverse().find((message) => message.role === "user")?.content ?? ""
    });
    return writeSse(response, chatReply(body ?? {}), false);
  }

  return reject(response, 404, "NOT_FOUND", `unknown endpoint ${path}`, "endpoint");
});

server.listen(PORT, "127.0.0.1");
