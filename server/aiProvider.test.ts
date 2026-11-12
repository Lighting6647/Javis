import { describe, expect, it } from "vitest";
import { resolveAiProvider } from "./aiProvider.js";

// ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริงของบริการใด
const OPENAI_KEY = "test-openai-key";
const GEMINI_KEY = "test-gemini-key";
const CLAUDE_KEY = "test-claude-key";
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
    const provider = resolveAiProvider({ AI_PROVIDER: "llama", GEMINI_API_KEY: GEMINI_KEY }, (message) => warnings.push(message));
    expect(provider.name).toBe("gemini");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("AI_PROVIDER");
    expect(warnings[0]).toContain("claude");
  });

  describe("Claude ของ Anthropic", () => {
    it("ตั้งกุญแจของ Anthropic อย่างเดียว: ใช้ Claude ได้เลยโดยไม่ต้องตั้งค่าอื่น", () => {
      expect(resolveAiProvider({ ANTHROPIC_API_KEY: CLAUDE_KEY }, quiet)).toMatchObject({
        name: "claude",
        label: "Anthropic Claude",
        apiStyle: "claude",
        apiKey: CLAUDE_KEY,
        keyVariable: "ANTHROPIC_API_KEY",
        baseUrl: "https://api.anthropic.com",
        // รุ่นราคาต่ำสุดและเร็วที่สุด เหมาะกับคำตอบสั้นที่ถูกอ่านออกเสียง
        chatModel: "claude-haiku-5-5",
        chatModelVariable: "ANTHROPIC_CHAT_MODEL",
        webSearch: true,
        creditCheck: true,
        reasoningEffort: "low"
      });
    });

    it("มีกุญแจหลายราย: ใช้ Claude เพราะการตั้งกุญแจของ Anthropic คือเจตนาเปลี่ยนมาใช้", () => {
      const all = { OPENAI_API_KEY: OPENAI_KEY, GEMINI_API_KEY: GEMINI_KEY, ANTHROPIC_API_KEY: CLAUDE_KEY };
      expect(resolveAiProvider(all, quiet)).toMatchObject({ name: "claude", apiKey: CLAUDE_KEY });
      // ยังบังคับกลับไปใช้รายอื่นได้โดยไม่ต้องลบกุญแจ
      expect(resolveAiProvider({ ...all, AI_PROVIDER: "gemini" }, quiet)).toMatchObject({ name: "gemini", apiKey: GEMINI_KEY });
      expect(resolveAiProvider({ ...all, AI_PROVIDER: "openai" }, quiet)).toMatchObject({ name: "openai", apiKey: OPENAI_KEY });
    });

    it("AI_PROVIDER รับทั้งชื่อ claude และ anthropic แม้ยังไม่ได้ตั้งกุญแจ", () => {
      for (const value of ["claude", " Anthropic "]) {
        const warnings: string[] = [];
        const provider = resolveAiProvider({ AI_PROVIDER: value, OPENAI_API_KEY: OPENAI_KEY }, (message) => warnings.push(message));
        expect(provider).toMatchObject({ name: "claude", apiKey: undefined, keyVariable: "ANTHROPIC_API_KEY" });
        expect(warnings).toEqual([]);
      }
    });

    it("ไม่มีการแปลงเสียง และปิดการค้นเว็บกับการตรวจเครดิตได้", () => {
      expect(resolveAiProvider({ ANTHROPIC_API_KEY: CLAUDE_KEY }, quiet).transcribeModel).toBeNull();
      expect(
        resolveAiProvider({ ANTHROPIC_API_KEY: CLAUDE_KEY, WEB_SEARCH_ENABLED: "false", AI_CREDIT_CHECK: "FALSE" }, quiet)
      ).toMatchObject({ webSearch: false, creditCheck: false });
    });

    it("เปลี่ยนโมเดล ที่อยู่ และระดับการคิดได้", () => {
      const provider = resolveAiProvider(
        {
          ANTHROPIC_API_KEY: CLAUDE_KEY,
          ANTHROPIC_CHAT_MODEL: "claude-opus-5-5",
          ANTHROPIC_BASE_URL: "http://127.0.0.1:8797/",
          ANTHROPIC_EFFORT: "Medium"
        },
        quiet
      );
      expect(provider).toMatchObject({ chatModel: "claude-opus-5-5", baseUrl: "http://127.0.0.1:8797", reasoningEffort: "medium" });
    });

    it("ระดับการคิด: default คือให้โมเดลเลือกเอง ค่าที่ไม่รู้จักถูกแทนด้วยค่าเริ่มต้นพร้อมคำเตือน", () => {
      expect(resolveAiProvider({ ANTHROPIC_API_KEY: CLAUDE_KEY, ANTHROPIC_EFFORT: "default" }, quiet).reasoningEffort).toBeUndefined();

      const warnings: string[] = [];
      const provider = resolveAiProvider({ ANTHROPIC_API_KEY: CLAUDE_KEY, ANTHROPIC_EFFORT: "minimal" }, (message) => warnings.push(message));
      expect(provider.reasoningEffort).toBe("low");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("ANTHROPIC_EFFORT");
    });

    it("ใส่กุญแจไว้ในช่องชื่อโมเดล: ใช้โมเดลเริ่มต้นแทน และคำเตือนไม่แสดงค่าที่ใส่มา", () => {
      // ค่าทดสอบเท่านั้น ประกอบขึ้นตอนรันเพื่อไม่ให้เครื่องมือสแกนความลับเข้าใจผิดว่าเป็นกุญแจจริง
      const claudeKeyLike = ["sk", "ant", "TESTONLYnotarealkey0000"].join("-");
      const warnings: string[] = [];
      const provider = resolveAiProvider({ ANTHROPIC_API_KEY: CLAUDE_KEY, ANTHROPIC_CHAT_MODEL: claudeKeyLike }, (message) => warnings.push(message));

      expect(provider.chatModel).toBe("claude-haiku-5-5");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("ANTHROPIC_CHAT_MODEL");
      expect(warnings[0]).toContain("ANTHROPIC_API_KEY");
      expect(warnings.join(" ")).not.toContain("TESTONLY");
    });
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

  describe("ใส่ค่าผิดช่อง", () => {
    // ค่าทดสอบเท่านั้น ประกอบขึ้นตอนรันเพื่อไม่ให้เครื่องมือสแกนความลับเข้าใจผิดว่าเป็นกุญแจจริง
    const googleKeyLike = `${"AI"}${"za"}SyTESTONLYnotarealkey0000`;
    const openaiKeyLike = ["sk", "proj", "TESTONLYnotarealkey0000"].join("-");

    it("ใส่กุญแจไว้ในช่องชื่อโมเดลของ Gemini: ใช้โมเดลเริ่มต้นแทน และคำเตือนไม่แสดงค่าที่ใส่มา", () => {
      const warnings: string[] = [];
      const provider = resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY, GEMINI_CHAT_MODEL: googleKeyLike }, (message) => warnings.push(message));

      // ชื่อโมเดลถูกใส่ในที่อยู่ของคำขอและใน log ถ้าปล่อยผ่าน กุญแจจะรั่วทั้งสองทาง
      expect(provider.chatModel).toBe("gemini-3.5-flash-lite");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("GEMINI_CHAT_MODEL");
      expect(warnings[0]).toContain("GEMINI_API_KEY");
      expect(warnings.join(" ")).not.toContain("TESTONLY");
    });

    it("ใส่กุญแจไว้ในช่องชื่อโมเดลโดยยังไม่ได้ตั้งกุญแจ: ไม่นำมาใช้เป็นกุญแจ และบอกว่าต้องย้ายไปไว้ที่ใด", () => {
      const warnings: string[] = [];
      const provider = resolveAiProvider({ GEMINI_CHAT_MODEL: googleKeyLike }, (message) => warnings.push(message));

      expect(provider).toMatchObject({ name: "openai", apiKey: undefined });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("ย้ายกุญแจไปไว้ที่ GEMINI_API_KEY");
      expect(warnings.join(" ")).not.toContain("TESTONLY");
    });

    it("บังคับใช้ Gemini แต่กุญแจอยู่ผิดช่อง: เตือนครั้งเดียว ไม่ซ้ำ", () => {
      const warnings: string[] = [];
      const provider = resolveAiProvider({ AI_PROVIDER: "gemini", GEMINI_CHAT_MODEL: googleKeyLike }, (message) => warnings.push(message));

      expect(provider).toMatchObject({ name: "gemini", apiKey: undefined, chatModel: "gemini-3.5-flash-lite" });
      expect(warnings).toHaveLength(1);
    });

    it("ใส่กุญแจไว้ในช่องชื่อโมเดลของ OpenAI: ใช้โมเดลเริ่มต้นแทนเช่นกัน", () => {
      const warnings: string[] = [];
      const provider = resolveAiProvider(
        { OPENAI_API_KEY: OPENAI_KEY, OPENAI_CHAT_MODEL: openaiKeyLike, OPENAI_TRANSCRIBE_MODEL: openaiKeyLike },
        (message) => warnings.push(message)
      );

      expect(provider).toMatchObject({ chatModel: "gpt-4.1-mini", transcribeModel: "gpt-transcribe" });
      expect(warnings).toHaveLength(2);
      expect(warnings.join(" ")).not.toContain("TESTONLY");
    });

    it("ค่าที่ยาวผิดปกติหรือมีช่องว่างไม่ใช่ชื่อโมเดล", () => {
      for (const value of ["x".repeat(101), "gemini 3.8 flash", "line\nbreak"]) {
        const warnings: string[] = [];
        const provider = resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY, GEMINI_CHAT_MODEL: value }, (message) => warnings.push(message));
        expect(provider.chatModel).toBe("gemini-3.5-flash-lite");
        expect(warnings).toHaveLength(1);
      }
    });

    it("ชื่อโมเดลจริงทุกรูปแบบยังใช้ได้ตามเดิม", () => {
      for (const value of ["gemini-3.8-flash", "models/gemini-3.8-flash", "gemini-3-flash-preview", "org/custom-model:tag_1.2"]) {
        const warnings: string[] = [];
        expect(resolveAiProvider({ GEMINI_API_KEY: GEMINI_KEY, GEMINI_CHAT_MODEL: value }, (message) => warnings.push(message)).chatModel).toBe(value);
        expect(warnings).toEqual([]);
      }
    });
  });

  it("ค่าว่างหรือมีแต่ช่องว่างนับว่าไม่ได้ตั้ง", () => {
    expect(resolveAiProvider({ GEMINI_API_KEY: "   ", OPENAI_API_KEY: "" }, quiet)).toMatchObject({ name: "openai", apiKey: undefined });
  });
});
