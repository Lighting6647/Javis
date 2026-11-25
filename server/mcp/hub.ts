import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DESKTOP_COMMANDER_ENTRY, PLAYWRIGHT_ENTRY } from "./localAccess.js";
import { defaultPathPolicy } from "./policy.js";

export type McpServerName = "desktop" | "browser";

export interface McpResult {
  ok: boolean;
  text: string;
}

/** ส่วนที่เครื่องมือต้องการจากเซิร์ฟเวอร์ MCP แยกไว้เพื่อให้ทดสอบได้โดยไม่เปิดโปรเซสจริง */
export interface McpCaller {
  call(server: McpServerName, tool: string, args: Record<string, unknown>, timeoutMs?: number): Promise<McpResult>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
/** ไม่ได้ใช้นานเท่านี้ ปิดโปรเซส (รวมหน้าต่างเบราว์เซอร์) */
const IDLE_CLOSE_MS = 15 * 60 * 1000;

/** ที่เก็บการตั้งค่าของ Desktop Commander เฉพาะของ Luna แยกจากที่ผู้ใช้ตั้งไว้ให้โปรแกรมอื่น */
function prepareDesktopHome(): string {
  const home = path.join(tmpdir(), "luna-desktop-commander");
  const configDir = path.join(home, ".claude-server-commander");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify({
      telemetryEnabled: false,
      allowedDirectories: [...new Set(defaultPathPolicy().roots)],
      defaultShell: "powershell.exe",
      blockedCommands: []
    })
  );
  return home;
}

/**
 * ตัวแปรสภาพแวดล้อมของโปรเซสลูก: SDK ส่งเฉพาะชุดพื้นฐานที่ปลอดภัยให้ ที่นี่เพิ่มเท่าที่ Windows ต้องใช้
 * ห้ามส่ง process.env ทั้งก้อน เพราะมีกุญแจ API และโทเค็นของ Google อยู่
 */
function childEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { ...extra };
  for (const name of ["PATHEXT", "COMSPEC", "WINDIR", "PROGRAMDATA", "PROGRAMFILES", "ProgramFiles(x86)"]) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  return env;
}

function launchOptions(server: McpServerName): { args: string[]; env: Record<string, string>; cwd: string } {
  if (server === "desktop") {
    return {
      args: [DESKTOP_COMMANDER_ENTRY],
      env: childEnv({ USERPROFILE: prepareDesktopHome(), DESKTOP_COMMANDER_DISABLE_TELEMETRY: "true" }),
      cwd: homedir()
    };
  }
  const outputDir = path.join(tmpdir(), "luna-browser");
  mkdirSync(outputDir, { recursive: true });
  const headless = process.env.LUNA_BROWSER_HEADLESS?.trim().toLowerCase() === "true";
  return {
    // isolated: โปรไฟล์ว่างในหน่วยความจำ ไม่มีบัญชีหรือคุกกี้จาก Chrome ของผู้ใช้
    args: [PLAYWRIGHT_ENTRY, "--browser", "chrome", "--isolated", "--output-dir", outputDir, ...(headless ? ["--headless"] : [])],
    env: childEnv({}),
    cwd: outputDir
  };
}

interface Connection {
  client: Client;
  idle: NodeJS.Timeout;
}

/** เปิดเซิร์ฟเวอร์ MCP เมื่อมีคนใช้ครั้งแรก และปิดเองเมื่อไม่ได้ใช้ */
export class McpHub implements McpCaller {
  private readonly connections = new Map<McpServerName, Promise<Connection>>();

  private async open(server: McpServerName): Promise<Connection> {
    // โหลด SDK เมื่อใช้จริงเท่านั้น เซิร์ฟเวอร์บน Vercel จึงไม่ต้องโหลด
    const [{ Client: McpClient }, { StdioClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/stdio.js")
    ]);
    const options = launchOptions(server);
    const transport = new StdioClientTransport({ command: process.execPath, ...options, stderr: "ignore" });
    const client = new McpClient({ name: "luna", version: "1.0.0" });
    client.onclose = () => this.connections.delete(server);
    await client.connect(transport, { timeout: DEFAULT_TIMEOUT_MS });
    return { client, idle: this.idleTimer(server) };
  }

  private idleTimer(server: McpServerName): NodeJS.Timeout {
    const timer = setTimeout(() => void this.close(server), IDLE_CLOSE_MS);
    timer.unref();
    return timer;
  }

  private async close(server: McpServerName): Promise<void> {
    const pending = this.connections.get(server);
    this.connections.delete(server);
    const connection = await pending?.catch(() => null);
    if (!connection) return;
    clearTimeout(connection.idle);
    await connection.client.close().catch(() => undefined);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((server) => this.close(server)));
  }

  async call(server: McpServerName, tool: string, args: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<McpResult> {
    let pending = this.connections.get(server);
    if (!pending) {
      pending = this.open(server);
      this.connections.set(server, pending);
    }
    let connection: Connection;
    try {
      connection = await pending;
    } catch (error) {
      this.connections.delete(server);
      console.warn(`เปิดเซิร์ฟเวอร์ MCP ${server} ไม่สำเร็จ`, error instanceof Error ? error.message : "unknown");
      return { ok: false, text: "เปิดตัวควบคุมในเครื่องไม่สำเร็จ" };
    }

    clearTimeout(connection.idle);
    connection.idle = this.idleTimer(server);
    try {
      const result = await connection.client.callTool({ name: tool, arguments: args }, undefined, { timeout: timeoutMs });
      const content = Array.isArray(result.content) ? (result.content as Array<{ type?: string; text?: string }>) : [];
      const text = content.flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : [])).join("\n");
      return { ok: result.isError !== true, text };
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : "เรียกเครื่องมือไม่สำเร็จ" };
    }
  }
}
