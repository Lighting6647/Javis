/** ผู้ให้บริการโมเดล AI ที่ Javis รองรับ */
export type AiProviderName = "openai" | "gemini";

export interface AiProvider {
  name: AiProviderName;
  /** ชื่อสำหรับแสดงใน log */
  label: string;
  /**
   * รูปแบบ API ที่ใช้คุยกับผู้ให้บริการ
   * - responses: OpenAI Responses API (มีการค้นเว็บในตัว)
   * - chat: Chat Completions ซึ่งผู้ให้บริการรายอื่นรองรับ
   */
  apiStyle: "responses" | "chat";
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

function chooseProvider(env: Env, warn: (message: string) => void): AiProviderName {
  const requested = read(env, "AI_PROVIDER")?.toLowerCase();
  if (requested === "openai" || requested === "gemini") return requested;
  if (requested) warn(`ค่า AI_PROVIDER ไม่รู้จัก (ใช้ได้: openai, gemini) จึงเลือกจากกุญแจที่ตั้งไว้แทน`);

  // ตั้งกุญแจของ Gemini ไว้คือเจตนาใช้ Gemini แม้จะยังมีกุญแจของ OpenAI ค้างอยู่
  return read(env, "GEMINI_API_KEY") ? "gemini" : "openai";
}

/**
 * เลือกผู้ให้บริการ AI และค่าที่เกี่ยวข้องจากตัวแปรสภาพแวดล้อม
 * ตั้ง GEMINI_API_KEY อย่างเดียวก็ใช้ Gemini ได้เลย หรือบังคับด้วย AI_PROVIDER
 */
export function resolveAiProvider(env: Env, warn: (message: string) => void = console.warn): AiProvider {
  if (chooseProvider(env, warn) === "gemini") {
    const effort = read(env, "GEMINI_REASONING_EFFORT")?.toLowerCase();

    return {
      name: "gemini",
      label: "Google Gemini",
      apiStyle: "chat",
      apiKey: read(env, "GEMINI_API_KEY"),
      keyVariable: "GEMINI_API_KEY",
      baseUrl: readBaseUrl(env, "GEMINI_BASE_URL", GEMINI_BASE_URL, warn),
      chatModel: read(env, "GEMINI_CHAT_MODEL") ?? GEMINI_CHAT_MODEL,
      chatModelVariable: "GEMINI_CHAT_MODEL",
      // การแปลงเสียงผ่านทางที่เข้ากันได้กับ OpenAI ยังไม่มี แอปเดสก์ท็อปจึงต้องพิมพ์แทน
      transcribeModel: null,
      // การค้นเว็บในตัวไม่อยู่ในโควตาฟรีของโมเดลรุ่นปัจจุบัน
      webSearch: false,
      // คำขอตรวจเครดิตกินโควตาฟรีต่อวันซึ่งมีจำกัด จึงตรวจเฉพาะเมื่อสั่งชัดเจน
      creditCheck: isOn(env, "AI_CREDIT_CHECK"),
      reasoningEffort: effort === "default" ? undefined : (effort ?? GEMINI_REASONING_EFFORT)
    };
  }

  return {
    name: "openai",
    label: "OpenAI",
    apiStyle: "responses",
    apiKey: read(env, "OPENAI_API_KEY"),
    keyVariable: "OPENAI_API_KEY",
    baseUrl: readBaseUrl(env, "OPENAI_BASE_URL", OPENAI_BASE_URL, warn),
    chatModel: read(env, "OPENAI_CHAT_MODEL") ?? OPENAI_CHAT_MODEL,
    chatModelVariable: "OPENAI_CHAT_MODEL",
    transcribeModel: read(env, "OPENAI_TRANSCRIBE_MODEL") ?? OPENAI_TRANSCRIBE_MODEL,
    webSearch: !isOff(env, "WEB_SEARCH_ENABLED"),
    creditCheck: !isOff(env, "AI_CREDIT_CHECK")
  };
}
