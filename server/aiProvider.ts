/** ผู้ให้บริการโมเดล AI ที่ Javis รองรับ */
export type AiProviderName = "openai" | "gemini" | "claude";

/** ระดับการคิดก่อนตอบที่ Claude รับ เรียงจากเร็วที่สุดไปละเอียดที่สุด */
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

export interface AiProvider {
  name: AiProviderName;
  /** ชื่อสำหรับแสดงใน log */
  label: string;
  /**
   * รูปแบบ API ที่ใช้คุยกับผู้ให้บริการ
   * - responses: OpenAI Responses API (มีการค้นเว็บในตัว)
   * - chat: Chat Completions ซึ่งผู้ให้บริการรายอื่นรองรับ
   * - claude: Claude Messages API ของ Anthropic เรียกผ่าน SDK ทางการ (มีการค้นเว็บในตัว)
   */
  apiStyle: "responses" | "chat" | "claude";
  apiKey: string | undefined;
  /** ชื่อตัวแปรที่ผู้ดูแลต้องตั้งกุญแจ ใช้ในข้อความแนะนำ */
  keyVariable: string;
  baseUrl: string;
  /** โมเดลที่ใช้คิดคำตอบ ควรเป็นโมเดลที่ตอบเร็วเพราะคำตอบถูกอ่านออกเสียงทันที */
  chatModel: string;
  chatModelVariable: string;
  /** โมเดลแปลงเสียงเป็นข้อความ (ใช้เฉพาะแอปเดสก์ท็อป) หรือ null ถ้าผู้ให้บริการรายนี้ยังไม่รองรับ */
  transcribeModel: string | null;
  /** ให้ AI ค้นเว็บเองได้ มีเฉพาะผู้ให้บริการที่มีเครื่องมือค้นเว็บในตัว */
  webSearch: boolean;
  /** ตรวจเครดิตตอนเริ่มด้วยคำขอสั้นหนึ่งครั้ง */
  creditCheck: boolean;
  /** ระดับการคิดก่อนตอบของโมเดลที่มีขั้นคิด ไม่กำหนด = ใช้ค่าเริ่มต้นของโมเดล */
  reasoningEffort?: string;
  /**
   * โมเดลที่ใช้ค้นเว็บ สำหรับผู้ให้บริการที่ขั้นค้นเว็บใช้โมเดลคนละตัวกับการสนทนาได้ (Gemini)
   * ผู้ให้บริการรายอื่นค้นในคำขอเดียวกับคำตอบ จึงไม่มีค่านี้
   */
  searchModel?: string;
}

type Env = Record<string, string | undefined>;

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_CHAT_MODEL = "gpt-4.1-mini";
const OPENAI_TRANSCRIBE_MODEL = "gpt-transcribe";

/** ที่อยู่ของ Gemini API แบบที่เข้ากันได้กับ OpenAI */
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
/** โมเดลรุ่นเบาที่อยู่ในโควตาฟรี ตอบเร็ว และมีโควตาต่อวันมากกว่ารุ่นใหญ่ */
const GEMINI_CHAT_MODEL = "gemini-3.5-flash-lite";
/** คิดให้น้อยที่สุด เพราะคำตอบถูกอ่านออกเสียงทันที ความเร็วสำคัญกว่าการคิดลึก */
const GEMINI_REASONING_EFFORT = "minimal";

const CLAUDE_BASE_URL = "https://api.anthropic.com";
/**
 * โมเดลรุ่นเล็กของ Anthropic: ราคาต่ำที่สุดและตอบเร็วที่สุด เหมาะกับคำตอบสั้นที่ถูกอ่านออกเสียง
 * เปลี่ยนเป็นรุ่นใหญ่ได้ด้วย ANTHROPIC_CHAT_MODEL (claude-sonnet-5-5 หรือ claude-opus-5-5)
 */
const CLAUDE_CHAT_MODEL = "claude-haiku-5-5";
/** ให้คิดก่อนตอบน้อยที่สุด เพราะคำตอบถูกอ่านออกเสียงทันที ความเร็วสำคัญกว่าการคิดลึก */
const CLAUDE_EFFORT: ClaudeEffort = "low";

const read = (env: Env, name: string) => env[name]?.trim() || undefined;
const isOff = (env: Env, name: string) => read(env, name)?.toLowerCase() === "false";
const isOn = (env: Env, name: string) => read(env, name)?.toLowerCase() === "true";

function readBaseUrl(env: Env, name: string, fallback: string, warn: (message: string) => void): string {
  const raw = read(env, name);
  if (!raw) return fallback;

  if (!URL.canParse(raw) || !/^https?:$/.test(new URL(raw).protocol)) {
    warn(`ค่า ${name} ไม่ใช่ URL ที่ถูกต้อง ใช้ค่าเริ่มต้นแทน`);
    return fallback;
  }
  return raw.replace(/\/+$/, "");
}

/** ค่าที่ขึ้นต้นแบบกุญแจของ Google หรือ OpenAI */
const KEY_LIKE = /^(?:AIza|sk-)/;
const MAX_MODEL_NAME_LENGTH = 100;

/**
 * อ่านชื่อโมเดลที่ผู้ดูแลตั้งไว้ ถ้าค่าที่ใส่มาดูไม่ใช่ชื่อโมเดล จะใช้ค่าเริ่มต้นแทน
 * กันกรณีใส่กุญแจผิดช่อง เพราะชื่อโมเดลถูกใส่ในที่อยู่ของคำขอและถูกเขียนลง log
 * ซึ่งจะทำให้กุญแจรั่วทั้งสองทาง คำเตือนจึงไม่แสดงค่าที่ใส่มา
 */
function readModel(env: Env, name: string, fallback: string, keyVariable: string, warn: (message: string) => void): string {
  const value = read(env, name);
  if (!value) return fallback;

  if (KEY_LIKE.test(value)) {
    warn(`ค่า ${name} ดูเหมือนกุญแจ API ไม่ใช่ชื่อโมเดล จึงใช้โมเดล ${fallback} แทน ให้ย้ายกุญแจไปไว้ที่ ${keyVariable} แล้วลบ ${name} ออก`);
    return fallback;
  }
  if (value.length > MAX_MODEL_NAME_LENGTH || /\s/.test(value)) {
    warn(`ค่า ${name} ไม่ใช่ชื่อโมเดลที่ถูกต้อง จึงใช้โมเดล ${fallback} แทน`);
    return fallback;
  }
  return value;
}

function chooseProvider(env: Env, warn: (message: string) => void): AiProviderName {
  const requested = read(env, "AI_PROVIDER")?.toLowerCase();
  if (requested === "openai" || requested === "gemini" || requested === "claude") return requested;
  // ชื่อบริษัทผู้ให้บริการก็หมายถึงรายเดียวกัน
  if (requested === "anthropic") return "claude";
  if (requested) warn(`ค่า AI_PROVIDER ไม่รู้จัก (ใช้ได้: openai, gemini, claude) จึงเลือกจากกุญแจที่ตั้งไว้แทน`);

  // ตั้งกุญแจของรายใดไว้คือเจตนาใช้รายนั้น แม้จะยังมีกุญแจของรายอื่นค้างอยู่
  // เรียงจากรายที่เพิ่มเข้ามาล่าสุด ถ้าต้องการรายอื่นให้ระบุด้วย AI_PROVIDER
  if (read(env, "ANTHROPIC_API_KEY")) return "claude";
  return read(env, "GEMINI_API_KEY") ? "gemini" : "openai";
}

/** อ่านระดับการคิดของ Claude ค่าที่ไม่รู้จักจะใช้ค่าเริ่มต้นแทน และ default คือปล่อยให้โมเดลเลือกเอง */
function readClaudeEffort(env: Env, warn: (message: string) => void): ClaudeEffort | undefined {
  const value = read(env, "ANTHROPIC_EFFORT")?.toLowerCase();
  if (!value) return CLAUDE_EFFORT;
  if (value === "default") return undefined;

  const effort = CLAUDE_EFFORTS.find((each) => each === value);
  if (!effort) warn(`ค่า ANTHROPIC_EFFORT ไม่รู้จัก (ใช้ได้: ${CLAUDE_EFFORTS.join(", ")}, default) จึงใช้ ${CLAUDE_EFFORT} แทน`);
  return effort ?? CLAUDE_EFFORT;
}

/**
 * เลือกผู้ให้บริการ AI และค่าที่เกี่ยวข้องจากตัวแปรสภาพแวดล้อม
 * ตั้งกุญแจของรายใดไว้อย่างเดียวก็ใช้รายนั้นได้เลย (ANTHROPIC_API_KEY, GEMINI_API_KEY หรือ OPENAI_API_KEY)
 * หรือบังคับด้วย AI_PROVIDER
 */
export function resolveAiProvider(env: Env, warn: (message: string) => void = console.warn): AiProvider {
  const provider = chooseProvider(env, warn);

  // ใส่กุญแจของ Gemini ไว้ในช่องชื่อโมเดล โดยยังไม่ได้ตั้งกุญแจ: บอกให้ชัดว่าต้องย้ายไปไว้ที่ใด
  // (ถ้าใช้ Gemini อยู่แล้ว การอ่านชื่อโมเดลด้านล่างจะเตือนเอง) ไม่นำค่านั้นมาใช้เป็นกุญแจ และไม่แสดงค่า
  if (provider !== "gemini" && KEY_LIKE.test(read(env, "GEMINI_CHAT_MODEL") ?? "")) {
    warn("ค่า GEMINI_CHAT_MODEL ดูเหมือนกุญแจ API แต่ยังไม่ได้ตั้ง GEMINI_API_KEY ให้ย้ายกุญแจไปไว้ที่ GEMINI_API_KEY แล้วลบ GEMINI_CHAT_MODEL ออก");
  }

  if (provider === "claude") {
    return {
      name: "claude",
      label: "Anthropic Claude",
      apiStyle: "claude",
      apiKey: read(env, "ANTHROPIC_API_KEY"),
      keyVariable: "ANTHROPIC_API_KEY",
      baseUrl: readBaseUrl(env, "ANTHROPIC_BASE_URL", CLAUDE_BASE_URL, warn),
      chatModel: readModel(env, "ANTHROPIC_CHAT_MODEL", CLAUDE_CHAT_MODEL, "ANTHROPIC_API_KEY", warn),
      chatModelVariable: "ANTHROPIC_CHAT_MODEL",
      // Anthropic ไม่มีบริการแปลงเสียงเป็นข้อความ แอปเดสก์ท็อปจึงต้องพิมพ์แทน
      transcribeModel: null,
      webSearch: !isOff(env, "WEB_SEARCH_ENABLED"),
      creditCheck: !isOff(env, "AI_CREDIT_CHECK"),
      reasoningEffort: readClaudeEffort(env, warn)
    };
  }

  if (provider === "gemini") {
    const effort = read(env, "GEMINI_REASONING_EFFORT")?.toLowerCase();
    const chatModel = readModel(env, "GEMINI_CHAT_MODEL", GEMINI_CHAT_MODEL, "GEMINI_API_KEY", warn);
    // การตั้งกุญแจของบริการค้นเว็บภายนอก (Tavily) คือเจตนาให้ค้นเว็บ จึงไม่ต้องสั่งเปิดซ้ำ
    const hasSearchService = Boolean(read(env, "TAVILY_API_KEY"));

    return {
      name: "gemini",
      label: "Google Gemini",
      apiStyle: "chat",
      apiKey: read(env, "GEMINI_API_KEY"),
      keyVariable: "GEMINI_API_KEY",
      baseUrl: readBaseUrl(env, "GEMINI_BASE_URL", GEMINI_BASE_URL, warn),
      chatModel,
      chatModelVariable: "GEMINI_CHAT_MODEL",
      // การแปลงเสียงผ่านทางที่เข้ากันได้กับ OpenAI ยังไม่มี แอปเดสก์ท็อปจึงต้องพิมพ์แทน
      transcribeModel: null,
      // การค้นด้วย Google ต้องเปิดการเรียกเก็บเงินของโปรเจกต์ (กุญแจฟรีที่สร้างใหม่ค้นไม่ได้) จึงเปิดเฉพาะเมื่อสั่งชัดเจน
      webSearch: isOn(env, "WEB_SEARCH_ENABLED") || (hasSearchService && !isOff(env, "WEB_SEARCH_ENABLED")),
      // คำขอตรวจเครดิตกินโควตาฟรีต่อวันซึ่งมีจำกัด จึงตรวจเฉพาะเมื่อสั่งชัดเจน
      creditCheck: isOn(env, "AI_CREDIT_CHECK"),
      reasoningEffort: effort === "default" ? undefined : (effort ?? GEMINI_REASONING_EFFORT),
      // ไม่ตั้ง = ค้นด้วย Google โดยใช้โมเดลสนทนา ในคำขอเดียวกับคำตอบ
      ...(read(env, "GEMINI_SEARCH_MODEL") ? { searchModel: readModel(env, "GEMINI_SEARCH_MODEL", chatModel, "GEMINI_API_KEY", warn) } : {})
    };
  }

  return {
    name: "openai",
    label: "OpenAI",
    apiStyle: "responses",
    apiKey: read(env, "OPENAI_API_KEY"),
    keyVariable: "OPENAI_API_KEY",
    baseUrl: readBaseUrl(env, "OPENAI_BASE_URL", OPENAI_BASE_URL, warn),
    chatModel: readModel(env, "OPENAI_CHAT_MODEL", OPENAI_CHAT_MODEL, "OPENAI_API_KEY", warn),
    chatModelVariable: "OPENAI_CHAT_MODEL",
    transcribeModel: readModel(env, "OPENAI_TRANSCRIBE_MODEL", OPENAI_TRANSCRIBE_MODEL, "OPENAI_API_KEY", warn),
    webSearch: !isOff(env, "WEB_SEARCH_ENABLED"),
    creditCheck: !isOff(env, "AI_CREDIT_CHECK")
  };
}
