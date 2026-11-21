import { describe, expect, it } from "vitest";
import {
  buildClaudeCodePrompt,
  type ClaudeCodeSdk,
  createClaudeCodeTranslator,
  decideClaudeCodeTool,
  enforceClaudeCodePolicy,
  fetchTargetProblem,
  isPrivateAddress,
  startClaudeCodeReply
} from "./claudeCode.js";

const delta = (text: string) => ({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });
const success = (result = "") => ({ type: "result", subtype: "success", result });

/** SDK จำลอง: คืนข้อความตามลำดับที่กำหนด และจดตัวเลือกที่ได้รับ */
function fakeSdk(messages: unknown[]) {
  const calls: Array<{ prompt: string; options?: Record<string, unknown> }> = [];
  const sdk: ClaudeCodeSdk = {
    query(params) {
      calls.push(params);
      return (async function* () {
        for (const message of messages) yield message;
      })();
    }
  };
  return { sdk, calls };
}

async function collect(start: Awaited<ReturnType<typeof startClaudeCodeReply>>): Promise<unknown[]> {
  if (!start.ok) throw new Error("expected ok");
  const events: unknown[] = [];
  await start.events.read((event) => {
    events.push(event);
    return false;
  });
  return events;
}

const baseRequest = {
  model: "default",
  instructions: "ตอบสั้น ๆ",
  messages: [{ role: "user", content: "ตอนนี้กี่โมง" }],
  webSearch: true,
  signal: new AbortController().signal,
  timeoutMs: 10_000
};

describe("decideClaudeCodeTool", () => {
  it("อนุญาตเฉพาะค้นเว็บและอ่านหน้าเว็บสาธารณะ", () => {
    expect(decideClaudeCodeTool("WebSearch", { query: "ข่าว" })).toEqual({ allow: true });
    expect(decideClaudeCodeTool("WebFetch", { url: "https://www.tmd.go.th/" })).toEqual({ allow: true });
  });

  it("ปฏิเสธเครื่องมือไฟล์ เชลล์ และ MCP", () => {
    for (const name of ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent", "mcp__gmail__send_email"]) {
      expect(decideClaudeCodeTool(name, {}).allow).toBe(false);
    }
  });

  it("WebFetch ไปที่อยู่ภายในถูกปฏิเสธ", () => {
    for (const url of [
      "http://localhost:8787/api",
      "http://127.0.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://router.local/",
      "http://intranet/",
      "file:///etc/passwd",
      "https://user:pass@example.com/",
      "ไม่ใช่ URL"
    ]) {
      expect(decideClaudeCodeTool("WebFetch", { url }).allow, url).toBe(false);
    }
  });
});

describe("isPrivateAddress / fetchTargetProblem", () => {
  it("แยกที่อยู่ภายในกับสาธารณะ", () => {
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("172.20.0.1")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
    expect(isPrivateAddress("example.com")).toBe(false);
  });

  it("ที่อยู่สาธารณะผ่าน", () => {
    expect(fetchTargetProblem("https://th.wikipedia.org/wiki/กรุงเทพมหานคร")).toBeNull();
    expect(fetchTargetProblem(42)).not.toBeNull();
  });
});

describe("enforceClaudeCodePolicy", () => {
  it("ปฏิเสธด้วย permissionDecision deny ซึ่งเป็นคำตัดสินสุดท้ายของ hook", async () => {
    await expect(enforceClaudeCodePolicy({ tool_name: "Bash", tool_input: { command: "cat ~/.ssh/id_rsa" } })).resolves.toMatchObject({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" }
    });
    await expect(enforceClaudeCodePolicy({ tool_name: "WebSearch", tool_input: { query: "ข่าว" } })).resolves.toEqual({});
  });
});

describe("buildClaudeCodePrompt", () => {
  it("คำถามเดียว: ส่งคำถามตรง ๆ", () => {
    expect(buildClaudeCodePrompt([{ role: "user", content: " สวัสดี " }])).toBe("สวัสดี");
  });

  it("มีประวัติ: เรียงประวัติก่อนคำถามล่าสุด และข้ามข้อความว่างหรือบทบาทอื่น", () => {
    const prompt = buildClaudeCodePrompt([
      { role: "user", content: "ชื่อผมคือไลท์" },
      { role: "assistant", content: "รับทราบครับ" },
      { role: "system", content: "ข้อความระบบ" },
      { role: "assistant", content: "   " },
      { role: "user", content: "ผมชื่ออะไร" }
    ]);
    expect(prompt).toContain("ผู้ใช้: ชื่อผมคือไลท์\nผู้ช่วย: รับทราบครับ");
    expect(prompt).not.toContain("ข้อความระบบ");
    expect(prompt.endsWith("ข้อความล่าสุดของผู้ใช้ที่ต้องตอบ:\nผมชื่ออะไร")).toBe(true);
  });

  it("ไม่มีข้อความของผู้ใช้: คืนสตริงว่าง", () => {
    expect(buildClaudeCodePrompt([{ role: "assistant", content: "สวัสดี" }])).toBe("");
  });
});

describe("createClaudeCodeTranslator", () => {
  it("แปลงข้อความทีละส่วน และไม่ส่งข้อความเต็มซ้ำตอนจบ", () => {
    const translator = createClaudeCodeTranslator();
    expect(translator.push(delta("สวัสดี")).events).toEqual([{ type: "response.output_text.delta", delta: "สวัสดี" }]);
    const end = translator.push(success("สวัสดี"));
    expect(end.done).toBe(true);
    expect(end.events).toEqual([{ type: "response.completed", response: { status: "completed", output: [] } }]);
  });

  it("ไม่มีข้อความทีละส่วน: ส่งข้อความเต็มตอนจบ", () => {
    const translator = createClaudeCodeTranslator();
    expect(translator.push(success("ตอบครับ")).events[0]).toEqual({ type: "response.output_text.delta", delta: "ตอบครับ" });
  });

  it("ข้อผิดพลาดของบัญชีแปลงเป็นสถานะที่ใกล้เคียง", () => {
    const translator = createClaudeCodeTranslator();
    expect(translator.push({ type: "assistant", error: "authentication_failed", message: { content: [] } }).failure).toMatchObject({
      status: 401,
      code: "claude_code_authentication_failed"
    });
    expect(createClaudeCodeTranslator().push({ type: "assistant", error: "rate_limit" }).failure?.status).toBe(429);
    expect(createClaudeCodeTranslator().push({ type: "result", subtype: "error_max_turns", errors: ["too many"] }).failure).toMatchObject({
      status: 502,
      code: "claude_code_error_max_turns",
      detail: "too many"
    });
  });

  it("ข้อความอื่นถูกข้าม", () => {
    const translator = createClaudeCodeTranslator();
    expect(translator.push({ type: "system", subtype: "init" })).toEqual({ events: [], done: false });
    expect(translator.push(null)).toEqual({ events: [], done: false });
  });
});

describe("startClaudeCodeReply", () => {
  it("ยังไม่ได้ติดตั้ง SDK: คืนข้อผิดพลาด ไม่ throw", async () => {
    const start = await startClaudeCodeReply({
      ...baseRequest,
      load: () => Promise.reject(new Error("Cannot find package"))
    });
    expect(start).toMatchObject({ ok: false, rejection: { codes: ["claude_code_unavailable"] } });
  });

  it("สตรีมคำตอบ และส่งตัวเลือกแบบอ่านอย่างเดียว", async () => {
    const { sdk, calls } = fakeSdk([{ type: "system", subtype: "init" }, delta("บ่าย"), delta("สองโมง"), success("บ่ายสองโมง")]);
    const start = await startClaudeCodeReply({ ...baseRequest, load: async () => sdk });
    const events = await collect(start);

    expect(events).toEqual([
      { type: "response.output_text.delta", delta: "บ่าย" },
      { type: "response.output_text.delta", delta: "สองโมง" },
      { type: "response.completed", response: { status: "completed", output: [] } }
    ]);
    const options = calls[0]!.options!;
    expect(calls[0]!.prompt).toBe("ตอนนี้กี่โมง");
    expect(options).toMatchObject({
      tools: ["WebSearch", "WebFetch"],
      settingSources: [],
      mcpServers: {},
      strictMcpConfig: true,
      persistSession: false,
      includePartialMessages: true
    });
    expect(options.model).toBeUndefined();
    expect(String(options.systemPrompt)).toContain("ตอบสั้น ๆ");
    expect(String(options.systemPrompt)).toContain("โหมดอ่านอย่างเดียว");
  });

  it("canUseTool ของ SDK ใช้นโยบายเดียวกับ hook", async () => {
    const { sdk, calls } = fakeSdk([success("ok")]);
    await collect(await startClaudeCodeReply({ ...baseRequest, load: async () => sdk }));
    const canUseTool = calls[0]!.options!.canUseTool as (name: string, input: Record<string, unknown>) => Promise<{ behavior: string }>;
    await expect(canUseTool("Bash", { command: "ls" })).resolves.toMatchObject({ behavior: "deny" });
    await expect(canUseTool("WebSearch", { query: "x" })).resolves.toMatchObject({ behavior: "allow" });
  });

  it("ปิดการค้นเว็บ: ไม่มีเครื่องมือใดเลย และส่งโมเดลที่กำหนด", async () => {
    const { sdk, calls } = fakeSdk([success("ok")]);
    await collect(await startClaudeCodeReply({ ...baseRequest, webSearch: false, model: "claude-sonnet-5-5", load: async () => sdk }));
    expect(calls[0]!.options).toMatchObject({ tools: [], model: "claude-sonnet-5-5" });
  });

  it("ยังไม่ได้ล็อกอิน: คืนข้อผิดพลาดก่อนเริ่มตอบ", async () => {
    const { sdk } = fakeSdk([{ type: "assistant", error: "authentication_failed", message: { content: [] } }]);
    const start = await startClaudeCodeReply({ ...baseRequest, load: async () => sdk });
    expect(start).toMatchObject({ ok: false, status: 401, rejection: { codes: ["claude_code_authentication_failed"] } });
  });

  it("CLI เริ่มไม่ได้: คืนข้อผิดพลาด ไม่ throw", async () => {
    const sdk: ClaudeCodeSdk = {
      query() {
        return (async function* () {
          yield* [];
          throw new Error("Claude Code executable not found");
        })();
      }
    };
    const start = await startClaudeCodeReply({ ...baseRequest, load: async () => sdk });
    expect(start).toMatchObject({ ok: false, rejection: { codes: ["claude_code_failed"] } });
  });

  it("ล้มเหลวกลางคำตอบ: ส่งเหตุการณ์ error หลังข้อความที่ได้แล้ว", async () => {
    const { sdk } = fakeSdk([delta("เริ่ม"), { type: "result", subtype: "error_during_execution", errors: [] }]);
    const events = await collect(await startClaudeCodeReply({ ...baseRequest, load: async () => sdk }));
    expect(events).toEqual([
      { type: "response.output_text.delta", delta: "เริ่ม" },
      { type: "error", error: { code: "claude_code_error_during_execution" } }
    ]);
  });

  it("ไม่มีข้อความของผู้ใช้: ไม่เรียก Claude Code", async () => {
    const { sdk, calls } = fakeSdk([success("ok")]);
    const start = await startClaudeCodeReply({ ...baseRequest, messages: [], load: async () => sdk });
    expect(start.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
