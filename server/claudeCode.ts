/**
 * ผู้ให้บริการ claude-code: ใช้ Claude Code แบบไม่มีหน้าจอบนเครื่องนี้เป็นสมองของ Javis ผ่าน @anthropic-ai/claude-agent-sdk
 * ใช้บัญชีที่ล็อกอิน `claude` ไว้บนเครื่อง จึงไม่ต้องมีกุญแจ API และไม่เสียค่าใช้จ่ายตามโทเค็นแยก
 *
 * แนวทางมาจาก bridge ของ jarvis-main (bridge/server.mjs, bridge/policy.mjs) แต่แคบกว่า:
 * - เปิดเฉพาะเซิร์ฟเวอร์ที่รันบนเครื่องของผู้ใช้เอง (ดู claudeCodeAvailability ใน aiProvider.ts)
 * - อ่านอย่างเดียวเสมอ: Claude Code เห็นเฉพาะเครื่องมือค้นเว็บและอ่านหน้าเว็บ ไม่มีเครื่องมือไฟล์ เชลล์ หรือ MCP
 *   และทุกการเรียกเครื่องมือผ่าน PreToolUse hook ซึ่งปฏิเสธเป็นคำตัดสินสุดท้าย แม้ CLI จะอนุญาตเองไว้ก่อน
 * - ไม่โหลดการตั้งค่าของ Claude Code บนเครื่อง (settingSources: []) กฎอนุญาตใน ~/.claude จึงไม่มีผล
 * - ไม่เก็บบันทึกบทสนทนาลง ~/.claude/projects
 *
 * แพ็กเกจ SDK เป็นตัวเลือกเสริม: ไม่อยู่ใน dependencies เพื่อไม่ให้ build ของ Vercel/Docker ต้องมี
 * ติดตั้งเองด้วย `npm install @anthropic-ai/claude-agent-sdk` บนเครื่องที่จะใช้
 */
import { isIP } from "node:net";
import type { ReplyEvents, ReplyStart } from "./replySource.js";
import { sanitizeUpstreamMessage } from "./upstreamError.js";

/** ชื่อแพ็กเกจของ SDK เก็บเป็นตัวแปรเพื่อให้ TypeScript และตัว bundle ไม่ต้องหาแพ็กเกจนี้ตอน build */
const SDK_MODULE = "@anthropic-ai/claude-agent-sdk";

/** เครื่องมือของ Claude Code ที่ Javis เปิดให้ใช้: ค้นเว็บและอ่านหน้าเว็บสาธารณะ ไม่มีอะไรที่เปลี่ยนแปลงเครื่องหรือโลกภายนอก */
export const CLAUDE_CODE_TOOLS: readonly string[] = ["WebSearch", "WebFetch"];

/** จำนวนรอบสูงสุดที่ Claude Code วนเรียกเครื่องมือได้ในหนึ่งคำถาม (ค้นแล้วอ่านหน้าเว็บ) */
const MAX_TURNS = 6;

/** ส่วนของ SDK ที่ Javis ใช้ ประกาศเองเพราะแพ็กเกจเป็นตัวเลือกเสริมที่อาจไม่ได้ติดตั้ง */
export interface ClaudeCodeSdk {
  query(params: { prompt: string; options?: Record<string, unknown> }): AsyncIterable<unknown>;
}

export type ClaudeCodeLoader = () => Promise<ClaudeCodeSdk>;

/** โหลด SDK ตอนใช้ครั้งแรก ล้มเหลวเมื่อยังไม่ได้ติดตั้ง */
export const loadClaudeCodeSdk: ClaudeCodeLoader = async () => {
  const sdk = (await import(SDK_MODULE)) as Partial<ClaudeCodeSdk>;
  if (typeof sdk.query !== "function") throw new Error(`${SDK_MODULE} ไม่มีฟังก์ชัน query`);
  return sdk as ClaudeCodeSdk;
};

// ---------------------------------------------------------------------------
// นโยบายเครื่องมือ
// ---------------------------------------------------------------------------

export type ToolVerdict = { allow: true } | { allow: false; reason: string };

/** ชื่อโฮสต์ที่ชี้เข้าเครือข่ายภายในหรือเครื่องนี้เอง */
const INTERNAL_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i;

/** ที่อยู่ IP ที่ไม่ใช่ที่อยู่สาธารณะ: loopback, เครือข่ายส่วนตัว, link-local (รวม metadata ของคลาวด์), CGNAT และ IPv6 ภายใน */
export function isPrivateAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, "").toLowerCase();
  const version = isIP(host);
  if (version === 4) {
    const [a, b] = host.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) {
    if (host === "::" || host === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(host);
  }
  return false;
}

/** ปัญหาของที่อยู่ที่ WebFetch จะเปิด หรือ null ถ้าเปิดได้ (ไม่ได้ resolve DNS ชื่อโฮสต์ที่ชี้เข้าภายในจึงยังผ่านได้ ดู README) */
export function fetchTargetProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || !URL.canParse(raw)) return "ที่อยู่ไม่ถูกต้อง";
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") return "เปิดได้เฉพาะ http และ https";
  if (url.username || url.password) return "ที่อยู่มีชื่อผู้ใช้หรือรหัสผ่าน";
  const host = url.hostname;
  if (!host.includes(".") && isIP(host.replace(/^\[|\]$/g, "")) === 0) return "ชื่อโฮสต์ภายใน";
  if (INTERNAL_HOST.test(host)) return "ชื่อโฮสต์ภายใน";
  if (isPrivateAddress(host)) return "ที่อยู่ภายใน";
  return null;
}

/**
 * ตัดสินการเรียกเครื่องมือหนึ่งครั้งจากชื่อและอาร์กิวเมนต์
 * อนุญาตเฉพาะเครื่องมือใน CLAUDE_CODE_TOOLS และ WebFetch ต้องชี้ไปที่อยู่สาธารณะเท่านั้น
 */
export function decideClaudeCodeTool(name: string, input: unknown): ToolVerdict {
  if (!CLAUDE_CODE_TOOLS.includes(name)) {
    return { allow: false, reason: "Blocked: LUNA runs Claude Code in read-only mode; only web search and reading public web pages are available." };
  }
  if (name === "WebFetch") {
    const problem = fetchTargetProblem((input as { url?: unknown } | null)?.url);
    if (problem) return { allow: false, reason: `Blocked: that address cannot be fetched (${problem}).` };
  }
  return { allow: true };
}

/** PreToolUse hook: เห็นทุกการเรียกเครื่องมือก่อนรัน รวมที่ CLI อนุญาตเองไว้แล้ว คำปฏิเสธของ hook เป็นคำตัดสินสุดท้าย */
export async function enforceClaudeCodePolicy(input: { tool_name?: unknown; tool_input?: unknown }): Promise<Record<string, unknown>> {
  const verdict = decideClaudeCodeTool(String(input.tool_name ?? ""), input.tool_input);
  if (verdict.allow) return {};
  console.warn(`Claude Code: ปฏิเสธเครื่องมือ ${String(input.tool_name)}`);
  return {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: verdict.reason }
  };
}

// ---------------------------------------------------------------------------
// คำขอ
// ---------------------------------------------------------------------------

/** คำสั่งเพิ่มเติมของโหมดนี้: Claude Code ไม่มีเครื่องมือของ Javis (เปิดหน้าเว็บ จำ กรอกฟอร์ม) */
export const CLAUDE_CODE_NOTE = [
  "คุณกำลังทำงานผ่าน Claude Code บนเครื่องของผู้ใช้ ในโหมดอ่านอย่างเดียว",
  "เครื่องมือที่มีคือ WebSearch สำหรับค้นเว็บ และ WebFetch สำหรับอ่านหน้าเว็บสาธารณะเท่านั้น",
  "ในโหมดนี้ไม่มีเครื่องมือเปิดหน้าเว็บ จำหรือลืมเรื่องของผู้ใช้ กรอกฟอร์ม เปิดโปรแกรม หรือแก้ไขไฟล์ ห้ามอ้างว่าทำสิ่งเหล่านั้นแล้ว ถ้าผู้ใช้สั่ง ให้บอกสั้น ๆ ว่าโหมดนี้ยังทำไม่ได้",
  "ตอบเป็นข้อความที่อ่านออกเสียงได้ทันที ห้ามบรรยายขั้นตอนการค้นหรือชื่อเครื่องมือ"
].join(" ");

export interface ClaudeCodeTurn {
  role: string;
  content: string;
}

/**
 * Claude Code รับคำถามเป็นข้อความเดียว ประวัติบทสนทนาจึงถูกเรียงเป็นบันทึกก่อนคำถามล่าสุด
 * ประวัติเป็นข้อมูล ไม่ใช่คำสั่ง คำถามล่าสุดของผู้ใช้คือสิ่งที่ต้องตอบ
 */
export function buildClaudeCodePrompt(turns: readonly ClaudeCodeTurn[]): string {
  const clean = turns.filter((turn) => (turn.role === "user" || turn.role === "assistant") && turn.content.trim());
  const lastUser = clean.map((turn) => turn.role).lastIndexOf("user");
  if (lastUser < 0) return "";

  const history = clean.slice(0, lastUser).map((turn) => `${turn.role === "user" ? "ผู้ใช้" : "ผู้ช่วย"}: ${turn.content.trim()}`);
  const question = clean[lastUser]!.content.trim();
  if (history.length === 0) return question;
  return `บทสนทนาก่อนหน้า (เป็นข้อมูลประกอบ):\n${history.join("\n")}\n\nข้อความล่าสุดของผู้ใช้ที่ต้องตอบ:\n${question}`;
}

// ---------------------------------------------------------------------------
// แปลงข้อความของ SDK เป็นเหตุการณ์แบบ Responses
// ---------------------------------------------------------------------------

/** รหัสข้อผิดพลาดของ SDK → สถานะ HTTP ที่ใกล้เคียง เพื่อให้ describeUpstreamFailure เลือกข้อความถึงผู้ใช้ได้ถูก */
const ERROR_STATUS: Record<string, number> = {
  authentication_failed: 401,
  oauth_org_not_allowed: 401,
  billing_error: 402,
  rate_limit: 429,
  overloaded: 529,
  model_not_found: 404
};

/** ผลของการแปลงข้อความหนึ่งรายการจาก SDK */
export interface TranslatedMessage {
  events: unknown[];
  /** Claude Code แจ้งล้มเหลว: สถานะ HTTP ที่ใกล้เคียงและรหัส */
  failure?: { status: number; code: string; detail: string };
  /** จบคำตอบแล้ว */
  done: boolean;
}

const textDelta = (text: string) => ({ type: "response.output_text.delta", delta: text });
const COMPLETED = { type: "response.completed", response: { status: "completed", output: [] } };

/** ตัวแปลงข้อความของ SDK หนึ่งคำตอบ เป็นเหตุการณ์แบบ Responses ที่ตัวประมวลผลคำตอบของ Javis เข้าใจ */
export function createClaudeCodeTranslator() {
  /** ได้ข้อความทีละส่วนจาก stream_event แล้ว: ข้อความเต็มตอนจบจึงไม่ต้องส่งซ้ำ */
  let streamedText = false;

  const push = (message: unknown): TranslatedMessage => {
    if (typeof message !== "object" || message === null) return { events: [], done: false };
    const msg = message as {
      type?: unknown;
      subtype?: unknown;
      error?: unknown;
      event?: { type?: unknown; delta?: { type?: unknown; text?: unknown } };
      message?: { content?: unknown };
      result?: unknown;
      errors?: unknown;
    };

    if (msg.type === "stream_event") {
      const event = msg.event;
      if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && typeof event.delta.text === "string" && event.delta.text) {
        streamedText = true;
        return { events: [textDelta(event.delta.text)], done: false };
      }
      return { events: [], done: false };
    }

    if (msg.type === "assistant" && typeof msg.error === "string") {
      const code = msg.error;
      return { events: [], failure: { status: ERROR_STATUS[code] ?? 502, code: `claude_code_${code}`, detail: code }, done: true };
    }

    if (msg.type === "result") {
      if (msg.subtype === "success") {
        // SDK รุ่นที่ไม่ส่งข้อความทีละส่วน: ส่งข้อความเต็มครั้งเดียวตอนจบ
        const text = !streamedText && typeof msg.result === "string" ? msg.result.trim() : "";
        return { events: [...(text ? [textDelta(text)] : []), COMPLETED], done: true };
      }
      const detail = Array.isArray(msg.errors) ? msg.errors.filter((each) => typeof each === "string").join("; ") : "";
      return { events: [], failure: { status: 502, code: `claude_code_${String(msg.subtype)}`, detail }, done: true };
    }

    return { events: [], done: false };
  };

  return {
    push,
    get started() {
      return streamedText;
    }
  };
}

export interface ClaudeCodeReplyRequest {
  /** "default" = ให้ Claude Code เลือกโมเดลตามบัญชี */
  model: string;
  effort?: string;
  instructions: string;
  messages: readonly ClaudeCodeTurn[];
  webSearch: boolean;
  signal: AbortSignal;
  timeoutMs: number;
  /** ตัวโหลด SDK สำหรับการทดสอบ ปกติโหลดแพ็กเกจจริง */
  load?: ClaudeCodeLoader;
  /** โฟลเดอร์ที่ Claude Code ทำงาน (ไม่มีเครื่องมือไฟล์ จึงไม่มีผลกับการอ่านไฟล์) */
  cwd?: string;
}

const rejection = (status: number, code: string, detail: string): ReplyStart => ({
  ok: false,
  status,
  rejection: { codes: [code], logDetail: sanitizeUpstreamMessage(detail) }
});

/**
 * ขอคำตอบจาก Claude Code แบบสตรีม
 * คืนข้อผิดพลาดเป็นผลลัพธ์ (ไม่ throw) เมื่อยังไม่ได้ติดตั้ง SDK หรือ Claude Code แจ้งล้มเหลวก่อนเริ่มตอบ
 * เพื่อให้ chat.ts สลับไปผู้ให้บริการสำรองหรือแจ้งผู้ใช้ได้
 */
export async function startClaudeCodeReply(request: ClaudeCodeReplyRequest): Promise<ReplyStart> {
  let sdk: ClaudeCodeSdk;
  try {
    sdk = await (request.load ?? loadClaudeCodeSdk)();
  } catch (error) {
    return rejection(500, "claude_code_unavailable", `ยังไม่ได้ติดตั้ง ${SDK_MODULE}: ${error instanceof Error ? error.message : "unknown"}`);
  }

  const prompt = buildClaudeCodePrompt(request.messages);
  if (!prompt) return rejection(400, "claude_code_empty_prompt", "ไม่มีข้อความของผู้ใช้");

  const abort = new AbortController();
  const cancel = () => abort.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, request.timeoutMs);
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", cancel);
  };

  const tools = request.webSearch ? [...CLAUDE_CODE_TOOLS] : [];
  const session = sdk.query({
    prompt,
    options: {
      systemPrompt: `${request.instructions}\n\n${CLAUDE_CODE_NOTE}`,
      tools,
      allowedTools: [],
      hooks: { PreToolUse: [{ hooks: [enforceClaudeCodePolicy] }] },
      canUseTool: async (name: string, input: Record<string, unknown>) => {
        const verdict = decideClaudeCodeTool(name, input);
        return verdict.allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: verdict.reason };
      },
      permissionMode: "default",
      settingSources: [],
      mcpServers: {},
      strictMcpConfig: true,
      persistSession: false,
      includePartialMessages: true,
      maxTurns: MAX_TURNS,
      abortController: abort,
      ...(request.cwd ? { cwd: request.cwd } : {}),
      ...(request.model && request.model !== "default" ? { model: request.model } : {}),
      ...(request.effort ? { effort: request.effort } : {})
    }
  });
  const iterator = session[Symbol.asyncIterator]();
  const translator = createClaudeCodeTranslator();

  // อ่านจนได้สิ่งแรกที่ส่งให้ผู้ใช้ได้ หรือรู้ว่าล้มเหลว ก่อนเปิดสตรีมให้แอป จึงยังตอบเป็นข้อผิดพลาดที่มีข้อความชัดเจนได้
  const pending: unknown[] = [];
  let finished = false;
  try {
    while (pending.length === 0 && !finished) {
      const next = await iterator.next();
      if (next.done) {
        finished = true;
        if (pending.length === 0) {
          cleanup();
          return rejection(502, "claude_code_no_reply", "Claude Code จบโดยไม่ตอบ");
        }
        break;
      }
      const translated = translator.push(next.value);
      if (translated.failure) {
        abort.abort();
        cleanup();
        return rejection(translated.failure.status, translated.failure.code, translated.failure.detail);
      }
      pending.push(...translated.events);
      finished = translated.done;
    }
  } catch (error) {
    cleanup();
    if (request.signal.aborted) throw error;
    // CLI เริ่มไม่ได้ (เช่นยังไม่ได้ล็อกอิน หรือหาไฟล์ของ Claude Code ไม่พบ) หรือหมดเวลา
    return rejection(abort.signal.aborted ? 504 : 500, "claude_code_failed", error instanceof Error ? error.message : "unknown");
  }

  const events: ReplyEvents = {
    async read(onEvent) {
      try {
        for (const event of pending.splice(0)) {
          if (onEvent(event)) return;
        }
        while (!finished) {
          const next = await iterator.next();
          if (next.done) {
            // จบโดยไม่มีผลสรุป: ถือว่าจบคำตอบเท่าที่ได้
            onEvent(COMPLETED);
            return;
          }
          const translated = translator.push(next.value);
          if (translated.failure) {
            onEvent({ type: "error", error: { code: translated.failure.code } });
            return;
          }
          finished = translated.done;
          if (translated.events.some((event) => onEvent(event))) return;
        }
      } finally {
        abort.abort();
        cleanup();
      }
    },
    async cancel() {
      abort.abort();
      cleanup();
    }
  };
  return { ok: true, events };
}

/** ตรวจว่า SDK โหลดได้ สำหรับการตรวจบัญชีตอนเริ่มเซิร์ฟเวอร์ (ไม่ส่งคำถามจริง จึงไม่ใช้โควตา) */
export async function claudeCodeSdkInstalled(load: ClaudeCodeLoader = loadClaudeCodeSdk): Promise<boolean> {
  try {
    await load();
    return true;
  } catch {
    return false;
  }
}
