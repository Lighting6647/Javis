import { describe, expect, it } from "vitest";
import { claudeCodeAvailability, resolveAiProvider, resolveFallbackAiProviders } from "./aiProvider.js";

// ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริงของบริการใด
const GEMINI_KEY = "test-gemini-key";
const CLAUDE_KEY = "test-claude-key";
const quiet = () => undefined;
const LOCAL = { inDocker: false };
const DOCKER = { inDocker: true };

describe("claudeCodeAvailability", () => {
  it("ไม่ได้ตั้ง CLAUDE_CODE_PROVIDER: ปิด", () => {
    expect(claudeCodeAvailability({}, LOCAL)).toEqual({ requested: false, allowed: false });
    expect(claudeCodeAvailability({ CLAUDE_CODE_PROVIDER: "0" }, LOCAL)).toEqual({ requested: false, allowed: false });
  });

  it("ตั้งไว้บนเครื่องของผู้ใช้: เปิด", () => {
    for (const value of ["1", "true", " TRUE ", "on", "yes"]) {
      expect(claudeCodeAvailability({ CLAUDE_CODE_PROVIDER: value }, LOCAL)).toEqual({ requested: true, allowed: true });
    }
  });

  it("Vercel, Docker และ production: ไม่เปิดแม้ตั้งไว้", () => {
    expect(claudeCodeAvailability({ CLAUDE_CODE_PROVIDER: "1", VERCEL: "1" }, LOCAL)).toMatchObject({ requested: true, allowed: false });
    expect(claudeCodeAvailability({ CLAUDE_CODE_PROVIDER: "1" }, DOCKER)).toMatchObject({ requested: true, allowed: false });
    expect(claudeCodeAvailability({ CLAUDE_CODE_PROVIDER: "1", NODE_ENV: "production" }, LOCAL)).toMatchObject({
      requested: true,
      allowed: false
    });
  });
});

describe("resolveAiProvider: claude-code", () => {
  it("เปิดไว้อย่างเดียวโดยไม่ได้ระบุ AI_PROVIDER: ไม่เป็นหลัก มีกุญแจ Google จึงใช้ Gemini", () => {
    expect(resolveAiProvider({ CLAUDE_CODE_PROVIDER: "1", GEMINI_API_KEY: GEMINI_KEY }, quiet, LOCAL).name).toBe("gemini");
    expect(resolveAiProvider({ CLAUDE_CODE_PROVIDER: "1" }, quiet, LOCAL).name).toBe("openai");
  });

  it("เปิดไว้และระบุ AI_PROVIDER=claude-code: ใช้ Claude Code เป็นหลัก แม้มีกุญแจ Google", () => {
    const provider = resolveAiProvider({ CLAUDE_CODE_PROVIDER: "1", AI_PROVIDER: "claude-code", GEMINI_API_KEY: GEMINI_KEY }, quiet, LOCAL);
    expect(provider).toMatchObject({ name: "claude-code", apiStyle: "claude-code", apiKey: undefined, chatModel: "default", transcribeModel: null });
  });

  it("AI_PROVIDER ระบุรายอื่น: ใช้รายนั้น", () => {
    const provider = resolveAiProvider({ CLAUDE_CODE_PROVIDER: "1", AI_PROVIDER: "gemini", GEMINI_API_KEY: GEMINI_KEY }, quiet, LOCAL);
    expect(provider.name).toBe("gemini");
  });

  it("AI_PROVIDER=claude-code โดยไม่ได้เปิด CLAUDE_CODE_PROVIDER: เตือนแล้วเลือกจากกุญแจ", () => {
    const warnings: string[] = [];
    const provider = resolveAiProvider({ AI_PROVIDER: "claude-code", GEMINI_API_KEY: GEMINI_KEY }, (message) => warnings.push(message), LOCAL);
    expect(provider.name).toBe("gemini");
    expect(warnings.join(" ")).toContain("CLAUDE_CODE_PROVIDER=1");
  });

  it("ตั้งไว้แต่รันใน Docker: เตือนและไม่ใช้ Claude Code", () => {
    const warnings: string[] = [];
    const provider = resolveAiProvider({ CLAUDE_CODE_PROVIDER: "1", ANTHROPIC_API_KEY: CLAUDE_KEY }, (message) => warnings.push(message), DOCKER);
    expect(provider.name).toBe("claude");
    expect(warnings.join(" ")).toContain("Docker");
  });

  it("ตั้งไว้บน Vercel: ไม่ใช้ Claude Code", () => {
    expect(resolveAiProvider({ CLAUDE_CODE_PROVIDER: "1", VERCEL: "1", GEMINI_API_KEY: GEMINI_KEY }, quiet, LOCAL).name).toBe("gemini");
  });

  it("CLAUDE_CODE_MODEL กำหนดโมเดล ค่าที่ดูเหมือนกุญแจไม่ถูกใช้", () => {
    const base = { CLAUDE_CODE_PROVIDER: "1", AI_PROVIDER: "claude-code" };
    expect(resolveAiProvider({ ...base, CLAUDE_CODE_MODEL: "claude-sonnet-5-5" }, quiet, LOCAL).chatModel).toBe("claude-sonnet-5-5");
    expect(resolveAiProvider({ ...base, CLAUDE_CODE_MODEL: "sk-not-a-model" }, quiet, LOCAL).chatModel).toBe("default");
  });
});

describe("resolveFallbackAiProviders: claude-code", () => {
  it("Claude Code เป็นหลัก: รายที่มีกุญแจเป็นตัวสำรอง", () => {
    const env = { CLAUDE_CODE_PROVIDER: "1", GEMINI_API_KEY: GEMINI_KEY, ANTHROPIC_API_KEY: CLAUDE_KEY };
    expect(resolveFallbackAiProviders(env, "claude-code", quiet, LOCAL).map((p) => p.name)).toEqual(["gemini", "claude"]);
  });

  it("รายที่มีกุญแจเป็นหลัก: Claude Code เป็นตัวสำรองท้ายสุด", () => {
    const env = { CLAUDE_CODE_PROVIDER: "1", AI_PROVIDER: "gemini", GEMINI_API_KEY: GEMINI_KEY, ANTHROPIC_API_KEY: CLAUDE_KEY };
    expect(resolveFallbackAiProviders(env, "gemini", quiet, LOCAL).map((p) => p.name)).toEqual(["claude", "claude-code"]);
  });

  it("ไม่เปิดหรือรันใน Docker: ไม่มี Claude Code ในตัวสำรอง", () => {
    expect(resolveFallbackAiProviders({ GEMINI_API_KEY: GEMINI_KEY }, "gemini", quiet, LOCAL)).toEqual([]);
    expect(resolveFallbackAiProviders({ CLAUDE_CODE_PROVIDER: "1", GEMINI_API_KEY: GEMINI_KEY }, "gemini", quiet, DOCKER)).toEqual([]);
  });
});
