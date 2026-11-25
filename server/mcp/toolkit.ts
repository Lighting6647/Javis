import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { PcActionKind, PcActionProposal } from "../chatProtocol.js";
import { isPublicAddress } from "../frameCheck.js";
import { safeHttpUrl } from "../responseStream.js";
import { sanitizeUpstreamMessage } from "../upstreamError.js";
import type { McpCaller } from "./hub.js";
import { checkBrowserTarget, checkCommand, checkPath, defaultPathPolicy, type ElementFacts, isSensitivePath, type PathPolicy } from "./policy.js";

/**
 * เครื่องมือควบคุมคอมพิวเตอร์ที่ Luna เรียกได้ ครอบเครื่องมือของ Desktop Commander และ Playwright ที่คัดแล้ว
 * - อ่านและค้นหา: ทำทันที
 * - เปลี่ยนแปลงอะไรก็ตาม: คืนข้อเสนอให้ผู้ใช้ยืนยันก่อน
 */
const MAX_RESULT_LENGTH = 6_000;
const MAX_WRITE_LENGTH = 20_000;
const MAX_TYPE_LENGTH = 500;
const ACTION_TTL_MS = 2 * 60 * 1000;
const MAX_PENDING = 20;
const COMMAND_TIMEOUT_MS = 30_000;
const CLICKABLE = /^(?:link|button|checkbox|radio|tab|menuitem|option|combobox)$/;
const TYPABLE = /^(?:textbox|searchbox|combobox|spinbutton)$/;

/** สิ่งที่อ่านมาแล้วในคำขอเดียวกัน ใช้กันเนื้อหาที่อ่านชักนำให้เปิดเว็บอื่นหรือส่งข้อมูลออก */
export interface TurnTaint {
  privateData: boolean;
  /** ชื่อเว็บที่อ่านแล้ว null = ยังไม่ได้อ่านเว็บ */
  webHost: string | null;
}

export type ToolOutcome =
  | { kind: "result"; text: string }
  | { kind: "denied"; text: string }
  | { kind: "confirm"; proposal: PcActionProposal };

export interface ActionOutcome {
  ok: boolean;
  /** ประโยคสั้นสำหรับพูด */
  summary: string;
  output?: string;
}

interface PendingAction {
  proposal: PcActionProposal;
  run: () => Promise<ActionOutcome>;
}

interface ProposalInput {
  kind: PcActionKind;
  title: string;
  detail: string;
  /** ต้องกดปุ่มเท่านั้น ใช้เสียงยืนยันไม่ได้ */
  buttonOnly: boolean;
}

export interface ToolkitDeps {
  mcp: McpCaller;
  paths?: PathPolicy;
  exists?: (target: string) => boolean;
  resolveHost?: (hostname: string) => Promise<string[]>;
  now?: () => number;
}

interface PageFacts {
  url: string;
  title: string;
  text: string;
}

const PAGE_PROBE = "() => ({ url: location.href, title: document.title, text: (document.body ? document.body.innerText : '').slice(0, 6000) })";
/** อ่านข้อเท็จจริงจากหน้าเว็บจริง ไม่เชื่อคำอธิบายของ AI */
const ELEMENT_PROBE = `(el) => {
  const form = el.closest('form') || el.ownerDocument;
  const label = [...(el.labels || [])].map((each) => each.innerText).join(' ');
  return {
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute('type') || '').toLowerCase(),
    text: [el.innerText, el.value && el.tagName !== 'TEXTAREA' && ['button', 'submit'].includes(el.type) ? el.value : '', label,
      ...['aria-label', 'name', 'id', 'placeholder', 'title', 'autocomplete'].map((name) => el.getAttribute(name))]
      .filter(Boolean).join(' ').replace(/\\s+/g, ' ').slice(0, 200),
    hasPassword: Boolean(form.querySelector('input[type=password]')),
    hasCard: Boolean(form.querySelector('[autocomplete^=cc-], [name*=card i][name*=num i], [name*=cvv i], [name*=cvc i]'))
  };
}`;

interface PageControl {
  role: string;
  name: string;
  ref: string;
}

/** อ่านปุ่มและช่องกรอกจากภาพรวมของหน้า บรรทัดมีรูป: - link "ชื่อ" [ref=e5] */
function parseControls(snapshot: string): PageControl[] {
  return snapshot.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*-\s+'?(\w+)(?:\s+"((?:[^"\\]|\\.)*)")?.*\[ref=((?:f\d+)?e\d+)\]/.exec(line);
    const [, role = "", name = "", ref = ""] = match ?? [];
    return match && (CLICKABLE.test(role) || TYPABLE.test(role)) ? [{ role, name: name.replace(/\\(.)/g, "$1"), ref }] : [];
  });
}

const asText = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const clip = (text: string): string => (text.length > MAX_RESULT_LENGTH ? `${text.slice(0, MAX_RESULT_LENGTH)}\n…(ตัดให้สั้นลง)` : text);
const denied = (text: string): ToolOutcome => ({ kind: "denied", text });
const result = (text: string): ToolOutcome => ({ kind: "result", text: clip(text) || "(ไม่มีข้อมูล)" });

/** ผลของ browser_evaluate อยู่ใต้หัวข้อ Result ในรูป JSON */
function parseEvaluated(text: string): unknown {
  const match = /### Result\s*\n([\s\S]*?)(?:\n### |$)/.exec(text);
  try {
    return JSON.parse(match?.[1] ?? "");
  } catch {
    return null;
  }
}

/** ตัดรายการที่อาจเป็นไฟล์กุญแจออกจากรายชื่อไฟล์ */
function withoutSensitive(listing: string): string {
  return listing
    .split(/\r?\n/)
    .filter((line) => !isSensitivePath(line.replace(/^\s*(?:📁|📄|\[[A-Z]+\])\s*/u, "").trim()))
    .join("\n");
}

export class PcToolkit {
  private readonly mcp: McpCaller;
  private readonly paths: PathPolicy;
  private readonly exists: (target: string) => boolean;
  private readonly resolveHost: (hostname: string) => Promise<string[]>;
  private readonly now: () => number;
  private readonly pending = new Map<string, PendingAction>();

  constructor(deps: ToolkitDeps) {
    this.mcp = deps.mcp;
    this.paths = deps.paths ?? defaultPathPolicy();
    this.exists = deps.exists ?? existsSync;
    this.resolveHost = deps.resolveHost ?? ((host) => lookup(host, { all: true }).then((list) => list.map((each) => each.address)));
    this.now = deps.now ?? Date.now;
  }

  private propose(input: ProposalInput, run: () => Promise<ActionOutcome>): ToolOutcome {
    const now = this.now();
    for (const [id, action] of this.pending) if (action.proposal.expiresAt <= now) this.pending.delete(id);
    if (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value ?? "");
    const proposal: PcActionProposal = { id: randomUUID(), ...input, expiresAt: now + ACTION_TTL_MS };
    this.pending.set(proposal.id, { proposal, run });
    return { kind: "confirm", proposal };
  }

  /** ผู้ใช้ตัดสินใจ: แต่ละข้อเสนอใช้ได้ครั้งเดียว และทำเฉพาะสิ่งที่แสดงบนการ์ด */
  async decide(id: string, decision: "confirm" | "cancel", via: "button" | "voice"): Promise<ActionOutcome> {
    const action = this.pending.get(id);
    if (!action || action.proposal.expiresAt <= this.now()) {
      this.pending.delete(id);
      return { ok: false, summary: "รายการนี้หมดเวลาแล้วค่ะ สั่งใหม่อีกครั้งนะคะ" };
    }
    if (decision === "confirm" && action.proposal.buttonOnly && via !== "button") {
      return { ok: false, summary: "คำสั่งนี้ต้องกดปุ่มยืนยันบนการ์ดเท่านั้นค่ะ" };
    }
    this.pending.delete(id);
    if (decision === "cancel") return { ok: true, summary: "ยกเลิกแล้วค่ะ" };
    try {
      return await action.run();
    } catch (error) {
      console.warn("ทำคำสั่งในเครื่องไม่สำเร็จ", error instanceof Error ? error.message : "unknown");
      return { ok: false, summary: "ทำไม่สำเร็จค่ะ" };
    }
  }

  async run(name: string, args: Record<string, unknown>, taint: TurnTaint): Promise<ToolOutcome> {
    switch (name) {
      case "pc_list_files":
        return this.listFiles(args, taint);
      case "pc_find_files":
        return this.findFiles(args, taint);
      case "pc_read_file":
        return this.readFile(args, taint);
      case "pc_write_file":
        return this.writeFile(args);
      case "pc_move_file":
        return this.moveFile(args);
      case "pc_run_command":
        return this.runCommand(args);
      case "browser_open":
        return this.browserOpen(args, taint);
      case "browser_read":
        return this.browserRead(taint);
      case "browser_click":
        return this.browserAct("click", args, taint);
      case "browser_type":
        return this.browserAct("type", args, taint);
      default:
        return denied("ไม่รู้จักเครื่องมือนี้");
    }
  }

  private async listFiles(args: Record<string, unknown>, taint: TurnTaint): Promise<ToolOutcome> {
    const target = checkPath(args.path, this.paths);
    if (!target.ok) return denied(target.reason);
    const listed = await this.mcp.call("desktop", "list_directory", { path: target.value, depth: 1 });
    taint.privateData = true;
    return listed.ok ? result(`${target.value}\n${withoutSensitive(listed.text)}`) : denied("เปิดโฟลเดอร์นี้ไม่ได้");
  }

  private async findFiles(args: Record<string, unknown>, taint: TurnTaint): Promise<ToolOutcome> {
    const target = checkPath(args.path, this.paths);
    if (!target.ok) return denied(target.reason);
    const pattern = asText(args.pattern, 100);
    if (!pattern) return denied("ไม่ได้ระบุชื่อไฟล์ที่จะค้น");
    // ค้นเฉพาะชื่อไฟล์ การค้นเนื้อหาจะหยิบข้อความจากไฟล์กุญแจมาได้
    const found = await this.mcp.call("desktop", "start_search", {
      path: target.value,
      pattern,
      searchType: "files",
      literalSearch: true,
      ignoreCase: true,
      includeHidden: false,
      maxResults: 40,
      timeout_ms: 10_000
    });
    taint.privateData = true;
    return found.ok ? result(withoutSensitive(found.text)) : denied("ค้นหาไม่สำเร็จ");
  }

  private async readFile(args: Record<string, unknown>, taint: TurnTaint): Promise<ToolOutcome> {
    const target = checkPath(args.path, this.paths);
    if (!target.ok) return denied(target.reason);
    const read = await this.mcp.call("desktop", "read_file", { path: target.value, isUrl: false, offset: 0, length: 300 });
    taint.privateData = true;
    return read.ok ? result(sanitizeUpstreamMessage(read.text)) : denied("อ่านไฟล์นี้ไม่ได้");
  }

  private writeFile(args: Record<string, unknown>): ToolOutcome {
    const target = checkPath(args.path, this.paths);
    if (!target.ok) return denied(target.reason);
    const content = typeof args.content === "string" ? args.content : "";
    if (!content || content.length > MAX_WRITE_LENGTH) return denied("ไม่มีเนื้อหา หรือเนื้อหายาวเกินไป");
    const append = args.mode === "append";
    // เขียนทับคือการลบเนื้อหาเดิม จึงไม่ทำ
    if (!append && this.exists(target.value)) return denied("มีไฟล์ชื่อนี้แล้ว ลูน่าไม่เขียนทับ ให้ใช้ชื่ออื่นหรือเขียนต่อท้าย");
    return this.propose(
      { kind: "write", title: append ? "เขียนต่อท้ายไฟล์" : "สร้างไฟล์ใหม่", detail: `${target.value}\n\n${content}`, buttonOnly: false },
      async () => {
        const again = checkPath(target.value, this.paths);
        if (!again.ok || (!append && this.exists(target.value))) return { ok: false, summary: "ไฟล์เปลี่ยนไประหว่างรอ จึงไม่ได้เขียนค่ะ" };
        const wrote = await this.mcp.call("desktop", "write_file", { path: target.value, content, mode: append ? "append" : "rewrite" });
        return { ok: wrote.ok, summary: wrote.ok ? `บันทึกไฟล์ ${path.win32.basename(target.value)} แล้วค่ะ` : "เขียนไฟล์ไม่สำเร็จค่ะ" };
      }
    );
  }

  private moveFile(args: Record<string, unknown>): ToolOutcome {
    const source = checkPath(args.source, this.paths);
    if (!source.ok) return denied(source.reason);
    const destination = checkPath(args.destination, this.paths);
    if (!destination.ok) return denied(destination.reason);
    if (!this.exists(source.value)) return denied("ไม่พบไฟล์ต้นทาง");
    if (this.exists(destination.value)) return denied("ปลายทางมีอยู่แล้ว ให้ระบุชื่อไฟล์ปลายทางที่ยังไม่มี");
    if (this.paths.roots.some((root) => root.toLowerCase() === source.value.toLowerCase())) return denied("ย้ายโฟลเดอร์หลักไม่ได้");
    return this.propose(
      { kind: "move", title: "ย้ายหรือเปลี่ยนชื่อไฟล์", detail: `จาก ${source.value}\nไป ${destination.value}`, buttonOnly: false },
      async () => {
        if (!checkPath(source.value, this.paths).ok || !checkPath(destination.value, this.paths).ok || this.exists(destination.value)) {
          return { ok: false, summary: "ไฟล์เปลี่ยนไประหว่างรอ จึงไม่ได้ย้ายค่ะ" };
        }
        const moved = await this.mcp.call("desktop", "move_file", { source: source.value, destination: destination.value });
        return { ok: moved.ok, summary: moved.ok ? "ย้ายไฟล์แล้วค่ะ" : "ย้ายไฟล์ไม่สำเร็จค่ะ" };
      }
    );
  }

  private runCommand(args: Record<string, unknown>): ToolOutcome {
    const command = checkCommand(args.command);
    if (!command.ok) return denied(`ไม่รันคำสั่งนี้ เพราะ${command.reason}`);
    return this.propose({ kind: "command", title: "รันคำสั่งในเครื่อง (PowerShell)", detail: command.value, buttonOnly: true }, async () => {
      // คืนโฟลเดอร์ผู้ใช้จริงให้คำสั่ง เพราะตัวโปรเซสใช้โฟลเดอร์ตั้งค่าแยกของ Luna
      const home = homedir().replace(/'/g, "''");
      const ran = await this.mcp.call(
        "desktop",
        "start_process",
        { command: `$env:USERPROFILE='${home}'; ${command.value}`, timeout_ms: COMMAND_TIMEOUT_MS, shell: "powershell.exe" },
        COMMAND_TIMEOUT_MS + 15_000
      );
      const pid = /PID (\d+)/.exec(ran.text)?.[1];
      const finished = /has finished execution/i.test(ran.text);
      if (pid && !finished) await this.mcp.call("desktop", "force_terminate", { pid: Number(pid) });
      const output = sanitizeUpstreamMessage(
        ran.text
          .replace(/^Process started with PID.*$/m, "")
          .replace(/^Initial output:\s*/m, "")
          .replace(/^.*has finished execution.*$/m, "")
      ).trim();
      if (!ran.ok) return { ok: false, summary: "รันคำสั่งไม่สำเร็จค่ะ", output: clip(output) };
      if (!finished) return { ok: false, summary: "คำสั่งใช้เวลาเกินสามสิบวินาที จึงหยุดให้แล้วค่ะ", output: clip(output) };
      return { ok: true, summary: "รันคำสั่งเสร็จแล้วค่ะ", output: clip(output) };
    });
  }

  /** ที่อยู่เป็นเว็บสาธารณะจริง ไม่ใช่เครื่องนี้หรืออุปกรณ์ในวงเดียวกัน */
  private async isPublicUrl(value: string): Promise<boolean> {
    const url = safeHttpUrl(value);
    if (!url) return false;
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    try {
      const addresses = await this.resolveHost(host);
      return addresses.length > 0 && addresses.every(isPublicAddress);
    } catch {
      return false;
    }
  }

  private async readPage(): Promise<PageFacts | null> {
    const probed = await this.mcp.call("browser", "browser_evaluate", { function: PAGE_PROBE });
    const facts = probed.ok ? (parseEvaluated(probed.text) as Partial<PageFacts> | null) : null;
    if (!facts || typeof facts.url !== "string") return null;
    return { url: facts.url, title: String(facts.title ?? ""), text: String(facts.text ?? "") };
  }

  private async describePage(taint: TurnTaint): Promise<ToolOutcome> {
    const page = await this.readPage();
    if (!page || page.url === "about:blank") return denied("ยังไม่ได้เปิดหน้าเว็บ");
    // หน้าอาจพาไปที่อื่นเองหลังเปิด จึงตรวจที่อยู่สุดท้ายอีกครั้งก่อนส่งเนื้อหาให้ AI
    if (!(await this.isPublicUrl(page.url))) {
      await this.mcp.call("browser", "browser_navigate", { url: "about:blank" });
      return denied("หน้านี้พาไปยังที่อยู่ที่ไม่อนุญาต จึงปิดหน้านั้นแล้ว");
    }
    taint.webHost = new URL(page.url).hostname;
    const snapshot = await this.mcp.call("browser", "browser_snapshot", {});
    const controls = (snapshot.ok ? parseControls(snapshot.text) : [])
      .filter((control) => control.name)
      .slice(0, 40)
      .map((control) => `${control.role}: ${control.name.slice(0, 100)}`);
    return {
      kind: "result",
      text: `${page.title}\n${page.url}\n\n${page.text}${controls.length > 0 ? `\n\nส่วนที่กดหรือพิมพ์ได้:\n${controls.join("\n")}` : ""}`
    };
  }

  private async browserOpen(args: Record<string, unknown>, taint: TurnTaint): Promise<ToolOutcome> {
    const url = safeHttpUrl(args.url);
    if (!url) return denied("ที่อยู่เว็บไม่ถูกต้อง");
    if (!(await this.isPublicUrl(url))) return denied("ไม่เปิดที่อยู่ในเครื่องหรือในวงเครือข่ายภายใน");

    const host = new URL(url).hostname;
    const navigate = async () => this.mcp.call("browser", "browser_navigate", { url });
    // อ่านไฟล์หรือเว็บอื่นมาก่อนในคำขอเดียวกัน: เนื้อหานั้นอาจชักนำ หรือที่อยู่อาจพาข้อมูลออกไป จึงให้ผู้ใช้ดูก่อน
    if (taint.privateData || (taint.webHost !== null && taint.webHost !== host)) {
      return this.propose({ kind: "open", title: "เปิดหน้าเว็บในเบราว์เซอร์ของลูน่า", detail: url, buttonOnly: false }, async () => {
        const opened = await navigate();
        return { ok: opened.ok, summary: opened.ok ? "เปิดหน้าเว็บแล้วค่ะ ให้อ่านหน้านี้ต่อได้เลยนะคะ" : "เปิดหน้าเว็บไม่สำเร็จค่ะ" };
      });
    }
    const opened = await navigate();
    return opened.ok ? this.describePage(taint) : denied("เปิดหน้าเว็บไม่สำเร็จ");
  }

  private browserRead(taint: TurnTaint): Promise<ToolOutcome> {
    return this.describePage(taint);
  }

  private async probeElement(ref: string): Promise<ElementFacts | null> {
    const probed = await this.mcp.call("browser", "browser_evaluate", { element: "ส่วนที่เลือก", target: ref, function: ELEMENT_PROBE });
    const facts = probed.ok ? (parseEvaluated(probed.text) as Partial<ElementFacts> | null) : null;
    if (!facts || typeof facts.tag !== "string") return null;
    return {
      tag: facts.tag,
      type: String(facts.type ?? ""),
      text: String(facts.text ?? ""),
      hasPassword: facts.hasPassword === true,
      hasCard: facts.hasCard === true
    };
  }

  private async browserAct(action: "click" | "type", args: Record<string, unknown>, taint: TurnTaint): Promise<ToolOutcome> {
    const value = typeof args.text === "string" ? args.text : "";
    if (action === "type" && (!value.trim() || value.length > MAX_TYPE_LENGTH || /[\r\n]/.test(value))) return denied("ข้อความที่จะพิมพ์ไม่ถูกต้อง");
    const submit = action === "type" && args.submit === true;

    const page = await this.readPage();
    if (!page || page.url === "about:blank") return denied("ยังไม่ได้เปิดหน้าเว็บ");
    // หาปุ่มจากชื่อในหน้าปัจจุบันเอง AI ไม่ได้ถือรหัสจากหน้าก่อน
    const wanted = asText(args.name, 120).toLowerCase();
    const snapshot = wanted ? await this.mcp.call("browser", "browser_snapshot", {}) : null;
    const usable = (snapshot?.ok ? parseControls(snapshot.text) : []).filter((control) => (action === "click" ? CLICKABLE : TYPABLE).test(control.role));
    const exact = usable.filter((control) => control.name.toLowerCase() === wanted);
    const matches = exact.length > 0 ? exact : usable.filter((control) => wanted && control.name.toLowerCase().includes(wanted));
    const ref = matches.length === 1 ? matches[0]?.ref : undefined;
    if (!ref) {
      const names = (matches.length > 1 ? matches : usable).map((control) => control.name).filter(Boolean).slice(0, 12).join(", ");
      return denied(`${matches.length > 1 ? "มีหลายส่วนที่ชื่อตรงกัน" : "ไม่พบส่วนชื่อนั้นบนหน้าเว็บ"} ที่มีคือ: ${names || "ไม่มี"}`);
    }
    const facts = await this.probeElement(ref);
    if (!facts) return denied("ไม่พบส่วนนั้นบนหน้าเว็บ");
    taint.webHost = new URL(page.url).hostname;
    const blocked = checkBrowserTarget(action, facts, value);
    if (blocked) return denied(blocked);

    const name = facts.text || `<${facts.tag}>`;
    const title = action === "click" ? "คลิกในหน้าเว็บ" : submit ? "พิมพ์แล้วกด Enter ในหน้าเว็บ" : "พิมพ์ในหน้าเว็บ";
    const detail = action === "click" ? `${page.url}\nคลิก: ${name}` : `${page.url}\nช่อง: ${name}\nข้อความ: ${value}`;
    return this.propose({ kind: action, title, detail, buttonOnly: false }, async () => {
      // หน้าอาจเปลี่ยนระหว่างรอ: ทำเฉพาะเมื่อยังเป็นหน้าและส่วนเดิมที่แสดงบนการ์ด
      const pageNow = await this.readPage();
      const factsNow = pageNow ? await this.probeElement(ref) : null;
      if (!pageNow || !factsNow || pageNow.url !== page.url || factsNow.text !== facts.text || checkBrowserTarget(action, factsNow, value)) {
        return { ok: false, summary: "หน้าเว็บเปลี่ยนไประหว่างรอ จึงไม่ได้ทำค่ะ สั่งใหม่อีกครั้งนะคะ" };
      }
      const acted = await this.mcp.call(
        "browser",
        action === "click" ? "browser_click" : "browser_type",
        action === "click" ? { element: name, target: ref } : { element: name, target: ref, text: value, submit }
      );
      return {
        ok: acted.ok,
        summary: acted.ok ? "ทำในหน้าเว็บแล้วค่ะ สั่งให้อ่านหน้านี้ต่อได้เลยนะคะ" : "ทำในหน้าเว็บไม่สำเร็จค่ะ"
      };
    });
  }
}
