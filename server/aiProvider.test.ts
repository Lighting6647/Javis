import { describe, expect, it } from "vitest";
import { resolveAiProvider } from "./aiProvider.js";

// ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริงของบริการใด
const OPENAI_KEY = "test-openai-key";
const GEMINI_KEY = "test-gemini-key";
const quiet = () => undefined;

describe("resolveAiProvider", () => {
  it("ไม่ได้ตั้งอะไรเลย: ใช้ OpenAI เหมือนเดิม", () => {
    expect(resolveAiProvider({}, quiet)).toMatchObject({
      name: "openai",
      apiStyle: "responses",
      apiKey: undefined,
      keyVariable: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      chatModel: "gpt-4.1-mini",
      transcribeModel: "gpt-transcribe",
      webSearch: true,
      creditCheck: true
    });
  });

  it("ตั้งแต่กุญแจของ OpenAI: พฤติกรรมเดิมทั้งหมด รวมค่าที่ผู้ดูแลกำหนดเอง", () => {
    const provider = resolveAiProvider(
      {
        OPENAI_API_KEY: OPENAI_KEY,
        OPENAI_CHAT_MODEL: "custom-model",
        OPENAI_TRANSCRIBE_MODEL: "custom-speech",
        OPENAI_BASE_URL: "https://proxy.example.com/v1/",
        WEB_SEARCH_ENABLED: "false",
        AI_CREDIT_CHECK: "false"
      },
      quiet
    );
    expect(provider).toMatchObject({
      name: "openai",
      apiKey: OPENAI_KEY,
      chatModel: "custom-model",
      transcribeModel: "custom-speech",
      baseUrl: "https://proxy.example.com/v1",
      webSearch: false,
      creditCheck: false
    });
    expect(provider.reasoningEffort).toBeUndefined();
  });

  it("ตั้งกุญแจของ Gemini อย่างเดียว: ใช้ Gemini ได้เลยโดยไม่ต้องตั้งค่าอื่น", () => {
    expect(resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY }, quiet)).toMatchObject({
      name: "gemini",
      apiStyle: "chat",
      apiKey: GEMINI_KEY,
      keyVariable: "GEMINI_API_KEY",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      chatModel: "gemini-3.5-flash-lite",
      chatModelVariable: "GEMINI_CHAT_MODEL",
      reasoningEffort: "minimal"
    });
  });

  it("มีกุญแจทั้งสองราย: ใช้ Gemini เพราะการตั้งกุญแจ Gemini คือเจตนาเปลี่ยนมาใช้", () => {
    const provider = resolveAiProvider({ OPENAI_API_KEY: OPENAI_KEY, GEMINI_API_KEY: GEMINI_KEY }, quiet);
    expect(provider).toMatchObject({ name: "gemini", apiKey: GEMINI_KEY });
  });

  it("AI_PROVIDER บังคับเลือกได้ทั้งสองทาง", () => {
    const both = { OPENAI_API_KEY: OPENAI_KEY, GEMINI_API_KEY: GEMINI_KEY };
    expect(resolveAiProvider({ ...both, AI_PROVIDER: "openai" }, quiet)).toMatchObject({ name: "openai", apiKey: OPENAI_KEY });
    expect(resolveAiProvider({ OPENAI_API_KEY: OPENAI_KEY, AI_PROVIDER: " Gemini " }, quiet)).toMatchObject({ name: "gemini", apiKey: undefined });
  });

  it("AI_PROVIDER ที่ไม่รู้จัก: เตือนแล้วเลือกจากกุญแจ", () => {
    const warnings: string[] = [];
    const provider = resolveAiProvider({ AI_PROVIDER: "claude", GEMINI_API_KEY: GEMINI_KEY }, (message) => warnings.push(message));
    expect(provider.name).toBe("gemini");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("AI_PROVIDER");
  });

  it("Gemini: ไม่ค้นเว็บ ไม่แปลงเสียง และไม่ใช้โควตาฟรีไปกับการตรวจเครดิต เว้นแต่สั่งชัดเจน", () => {
    const provider = resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY, WEB_SEARCH_ENABLED: "true" }, quiet);
    expect(provider).toMatchObject({ webSearch: false, transcribeModel: null, creditCheck: false });
    expect(resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY, AI_CREDIT_CHECK: "true" }, quiet).creditCheck).toBe(true);
  });

  it("Gemini: เปลี่ยนโมเดล ที่อยู่ และระดับการคิดได้", () => {
    const provider = resolveAiProvider(
      { GEMINI_API_KEY: GEMINI_KEY, GEMINI_CHAT_MODEL: "gemini-3.8-flash", GEMINI_BASE_URL: "http://127.0.0.1:8797/", GEMINI_REASONING_EFFORT: "LOW" },
      quiet
    );
    expect(provider).toMatchObject({ chatModel: "gemini-3.8-flash", baseUrl: "http://127.0.0.1:8797", reasoningEffort: "low" });
    expect(resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY, GEMINI_REASONING_EFFORT: "default" }, quiet).reasoningEffort).toBeUndefined();
  });

  it("ที่อยู่ที่ไม่ถูกต้องถูกแทนด้วยค่าเริ่มต้นพร้อมคำเตือน", () => {
    const warnings: string[] = [];
    const provider = resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY, GEMINI_BASE_URL: "ftp://example.com" }, (message) => warnings.push(message));
    expect(provider.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(warnings[0]).toContain("GEMINI_BASE_URL");
  });

  it("ค่าว่างหรือมีแต่ช่องว่างนับว่าไม่ได้ตั้ง", () => {
    expect(resolveAiProvider({ GEMINI_API_KEY: "   ", OPENAI_API_KEY: "" }, quiet)).toMatchObject({ name: "openai", apiKey: undefined });
  });
});
