import { describe, expect, it } from "vitest";
import { geminiKeyHint, hasGeminiKey, resolveAiProvider, resolveFallbackAiProviders } from "./aiProvider.js";

// ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริงของบริการใด
const GOOGLE_KEY = "test-google-key";
const GEMINI_KEY = "test-gemini-key";
const OPENAI_KEY = "test-openai-key";
const quiet = () => undefined;
const LOCAL = { inDocker: false };

describe("Google Gemini เป็นผู้ให้บริการหลัก", () => {
  it("รับกุญแจชื่อ GOOGLE_API_KEY ได้เหมือน GEMINI_API_KEY", () => {
    expect(resolveAiProvider({ GOOGLE_API_KEY: GOOGLE_KEY }, quiet, LOCAL)).toMatchObject({ name: "gemini", apiKey: GOOGLE_KEY });
    expect(hasGeminiKey({ GOOGLE_API_KEY: GOOGLE_KEY })).toBe(true);
  });

  it("ตั้งทั้งสองชื่อ: ใช้ GEMINI_API_KEY", () => {
    expect(resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY, GOOGLE_API_KEY: GOOGLE_KEY }, quiet, LOCAL).apiKey).toBe(GEMINI_KEY);
  });

  it("มีกุญแจ OpenAI ค้างอยู่ด้วย: ยังใช้ Gemini และ OpenAI เป็นตัวสำรอง", () => {
    const env = { GOOGLE_API_KEY: GOOGLE_KEY, OPENAI_API_KEY: OPENAI_KEY };
    expect(resolveAiProvider(env, quiet, LOCAL).name).toBe("gemini");
    expect(resolveFallbackAiProviders(env, "gemini", quiet, LOCAL).map((p) => p.name)).toEqual(["openai"]);
  });

  it("ค่าว่างหรือช่องว่างไม่นับเป็นกุญแจ", () => {
    expect(hasGeminiKey({ GEMINI_API_KEY: "  ", GOOGLE_API_KEY: "" })).toBe(false);
    expect(resolveAiProvider({ GOOGLE_API_KEY: " ", OPENAI_API_KEY: OPENAI_KEY }, quiet, LOCAL).name).toBe("openai");
  });

  it("Claude Code เป็นตัวสำรองท้ายสุดเมื่อเปิดไว้โดยไม่ได้ระบุเป็นหลัก", () => {
    const env = { GOOGLE_API_KEY: GOOGLE_KEY, CLAUDE_CODE_PROVIDER: "1" };
    expect(resolveAiProvider(env, quiet, LOCAL).name).toBe("gemini");
    expect(resolveFallbackAiProviders(env, "gemini", quiet, LOCAL).map((p) => p.name)).toEqual(["claude-code"]);
  });
});

describe("geminiKeyHint", () => {
  it("ยังไม่ได้ตั้งกุญแจ: บอกที่สร้างกุญแจและที่ใส่ โดยไม่มีค่ากุญแจใด", () => {
    const hint = geminiKeyHint({ OPENAI_API_KEY: OPENAI_KEY });
    expect(hint).toContain("https://aistudio.google.com/apikey");
    expect(hint).toContain(".env.local");
    expect(hint).toContain("GEMINI_API_KEY");
    expect(hint).not.toContain(OPENAI_KEY);
  });

  it("ตั้งกุญแจแล้ว หรือผู้ดูแลเลือกรายอื่นไว้ชัดเจน: ไม่แจ้ง", () => {
    expect(geminiKeyHint({ GOOGLE_API_KEY: GOOGLE_KEY })).toBeNull();
    expect(geminiKeyHint({ GEMINI_API_KEY: GEMINI_KEY })).toBeNull();
    expect(geminiKeyHint({ AI_PROVIDER: "openai", OPENAI_API_KEY: OPENAI_KEY })).toBeNull();
    expect(geminiKeyHint({ AI_PROVIDER: "claude-code" })).toBeNull();
  });

  it("ระบุ AI_PROVIDER=gemini แต่ไม่มีกุญแจ: แจ้ง", () => {
    expect(geminiKeyHint({ AI_PROVIDER: "gemini" })).not.toBeNull();
  });
});
