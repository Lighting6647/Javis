import {
  describeUpstreamFailure,
  readRejectedResponse,
  readUpstreamErrorCodes,
  type UpstreamFailureReason,
  type UpstreamService
} from "./upstreamError.js";

/**
 * สถานะของบริการ AI หนึ่งอย่าง
 * - unchecked: ยังไม่ได้ตรวจ
 * - ok: ใช้งานได้
 * - quota / auth / model: ใช้งานไม่ได้จนกว่าผู้ดูแลจะแก้ (เครดิตหมด กุญแจ API ใช้ไม่ได้ ไม่พบโมเดล)
 * - unreachable: ตรวจไม่ได้เพราะติดต่อบริการ AI ไม่สำเร็จ
 */
export type AiServiceState = "unchecked" | "ok" | "quota" | "auth" | "model" | "unreachable";
export type AiOverallStatus = "ok" | "degraded" | "unknown";
export type CreditState = "ok" | "exhausted" | "unverified" | "skipped";

export interface AiAccountSnapshot {
  status: AiOverallStatus;
  chat: AiServiceState;
  transcribe: AiServiceState;
  /** เวลาที่สถานะเปลี่ยนล่าสุด (ISO 8601) หรือ null ถ้ายังไม่เคยตรวจ */
  checkedAt: string | null;
}

const SERVICES: readonly UpstreamService[] = ["chat", "transcribe"];
/** ปัญหาที่ลองใหม่แล้วไม่หาย ต้องให้ผู้ดูแลแก้ */
const BLOCKING: ReadonlySet<AiServiceState> = new Set<AiServiceState>(["quota", "auth", "model"]);
/** ปัญหาระดับบัญชี กระทบทุกบริการพร้อมกัน */
const ACCOUNT_WIDE: ReadonlySet<AiServiceState> = new Set<AiServiceState>(["quota", "auth"]);

function otherService(service: UpstreamService): UpstreamService {
  return service === "chat" ? "transcribe" : "chat";
}

/**
 * เก็บสถานะล่าสุดของบัญชี AI เพื่อรายงานผ่าน /health
 * อัปเดตจากการตรวจตอนเริ่มเซิร์ฟเวอร์ และจากผลของคำขอจริงระหว่างใช้งาน (ไม่มีค่าใช้จ่ายเพิ่ม)
 */
export function createAiAccountStatus(now: () => Date = () => new Date()) {
  const states: Record<UpstreamService, AiServiceState> = { chat: "unchecked", transcribe: "unchecked" };
  let checkedAt: string | null = null;

  const set = (service: UpstreamService, state: AiServiceState) => {
    if (states[service] === state) return;
    states[service] = state;
    checkedAt = now().toISOString();
  };

  return {
    /**
     * บันทึกผลการตรวจบัญชี (ตอนเริ่มเซิร์ฟเวอร์ และการตรวจซ้ำระหว่างที่ยังมีปัญหา)
     * ผลตรวจที่ไม่ได้ข้อมูลใหม่จะไม่ลบปัญหาที่รู้อยู่แล้วจากคำขอจริงของผู้ใช้
     */
    apply(result: Pick<AccountCheckResult, UpstreamService | "credits">) {
      const creditsChecked = result.credits === "ok" || result.credits === "exhausted";

      for (const service of SERVICES) {
        const next = result[service];
        const current = states[service];
        // ไม่ได้ตรวจเครดิตรอบนี้: โมเดลยังอยู่ไม่ได้แปลว่าเครดิตกลับมาแล้ว
        if (current === "quota" && next === "ok" && !creditsChecked) continue;
        // ติดต่อต้นทางไม่ได้รอบนี้: ยังไม่รู้อะไรเพิ่ม ปัญหาเดิมจึงยังอยู่
        if (next === "unreachable" && BLOCKING.has(current)) continue;
        set(service, next);
      }
      checkedAt = now().toISOString();
    },

    /** คำขอจริงสำเร็จ: บัญชีใช้งานได้ ปัญหาระดับบัญชีที่เคยบันทึกไว้จึงไม่จริงแล้ว */
    reportSuccess(service: UpstreamService) {
      set(service, "ok");
      const other = otherService(service);
      if (ACCOUNT_WIDE.has(states[other]) || states[other] === "unreachable") set(other, "unchecked");
    },

    /** คำขอจริงล้มเหลว: บันทึกเฉพาะสาเหตุที่ลองใหม่แล้วไม่หาย ส่วนผู้ใช้หนาแน่นชั่วคราวไม่นับ */
    reportFailure(service: UpstreamService, reason: UpstreamFailureReason) {
      if (reason === "quota" || reason === "auth") {
        // โมเดลที่หาไม่เจอยังคงหาไม่เจอ ไม่ว่าเครดิตจะเหลือหรือไม่
        SERVICES.filter((each) => each === service || states[each] !== "model").forEach((each) => set(each, reason));
      } else if (reason === "model") {
        set(service, "model");
      }
    },

    snapshot(): AiAccountSnapshot {
      const values = SERVICES.map((service) => states[service]);
      const status: AiOverallStatus = values.some((state) => BLOCKING.has(state))
        ? "degraded"
        : values.includes("ok") && values.every((state) => state === "ok" || state === "unchecked")
          ? "ok"
          : "unknown";
      return { status, chat: states.chat, transcribe: states.transcribe, checkedAt };
    }
  };
}

/** สถานะบัญชี AI ของเซิร์ฟเวอร์นี้ */
export const aiAccount = createAiAccountStatus();

export interface AccountCheckOptions {
  baseUrl: string;
  apiKey: string | undefined;
  chatModel: string;
  transcribeModel: string;
  /** ส่งคำขอสั้นที่สุดหนึ่งครั้งเพื่อดูว่าเครดิตยังเหลือ (ใช้โทเค็นเล็กน้อย) */
  creditCheck: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RetiringModel {
  service: UpstreamService;
  model: string;
  /** วันที่ต้นทางประกาศปิดให้บริการ รูปแบบ YYYY-MM-DD */
  date: string;
}

export interface AccountCheckResult {
  chat: AiServiceState;
  transcribe: AiServiceState;
  credits: CreditState;
  retiring: RetiringModel[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** จำนวนโทเค็นคำตอบต่ำสุดที่ต้นทางรับ ใช้ให้การตรวจเครดิตถูกที่สุด */
const CREDIT_PROBE_TOKENS = 16;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function stateOf(service: UpstreamService, httpStatus: number, codes: readonly string[]): AiServiceState {
  const { reason } = describeUpstreamFailure(service, httpStatus, codes);
  return reason === "quota" || reason === "auth" || reason === "model" ? reason : "unreachable";
}

/**
 * ตรวจบัญชี AI: กุญแจ API ใช้ได้ไหม โมเดลที่ตั้งค่าไว้มีอยู่จริงไหม และเครดิตยังเหลือไหม
 * ไม่ throw ไม่ว่าเกิดอะไรขึ้น เพราะเป็นการตรวจเพื่อเตือน ไม่ใช่เงื่อนไขในการเริ่มเซิร์ฟเวอร์
 */
export async function runAccountCheck(options: AccountCheckOptions): Promise<AccountCheckResult> {
  const { baseUrl, apiKey, chatModel, transcribeModel, creditCheck } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retiring: RetiringModel[] = [];

  if (!apiKey) return { chat: "auth", transcribe: "auth", credits: "unverified", retiring };

  const headers = { Authorization: `Bearer ${apiKey}` };

  /** ถามต้นทางว่ามีโมเดลนี้ไหม (ไม่มีค่าใช้จ่าย) และยืนยันกุญแจ API ไปในตัว */
  const lookUpModel = async (service: UpstreamService, model: string): Promise<AiServiceState> => {
    try {
      const response = await fetchImpl(`${baseUrl}/models/${encodeURIComponent(model)}`, {
        headers,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) return stateOf(service, response.status, await readRejectedResponse(response));

      const payload = (await response.json().catch(() => null)) as { shutdown_date?: unknown } | null;
      const date = payload?.shutdown_date;
      if (typeof date === "string" && ISO_DATE.test(date)) retiring.push({ service, model, date });
      return "ok";
    } catch {
      return "unreachable";
    }
  };

  let [chat, transcribe] = await Promise.all([
    lookUpModel("chat", chatModel),
    lookUpModel("transcribe", transcribeModel)
  ]);

  // กุญแจ API ถูกปฏิเสธ: ทุกบริการใช้ไม่ได้ ไม่ต้องตรวจต่อ
  if (chat === "auth" || transcribe === "auth") return { chat: "auth", transcribe: "auth", credits: "unverified", retiring };
  if (!creditCheck) return { chat, transcribe, credits: "skipped", retiring };
  if (chat !== "ok") return { chat, transcribe, credits: "unverified", retiring };

  let credits: CreditState = "unverified";
  try {
    const response = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model: chatModel, input: "ping", max_output_tokens: CREDIT_PROBE_TOKENS, store: false })
    });

    let failure: AiServiceState | null = null;
    if (!response.ok) {
      failure = stateOf("chat", response.status, await readRejectedResponse(response));
    } else {
      // ต้นทางอาจตอบ 200 แต่แจ้งล้มเหลวไว้ในเนื้อหา
      const payload = (await response.json().catch(() => null)) as { status?: unknown } | null;
      if (payload?.status === "failed") failure = stateOf("chat", 200, readUpstreamErrorCodes(payload));
      else credits = "ok";
    }

    if (failure === "quota" || failure === "auth") {
      chat = failure;
      if (transcribe !== "model") transcribe = failure;
      if (failure === "quota") credits = "exhausted";
    } else if (failure === "model") {
      chat = "model";
    }
  } catch {
    // ติดต่อไม่ได้ระหว่างตรวจเครดิต: ยังไม่รู้ผล ใช้สถานะจากการตรวจโมเดล
  }

  return { chat, transcribe, credits, retiring };
}

export interface AccountCheckReport {
  level: "info" | "warn" | "error";
  message: string;
}

const MS_PER_DAY = 86_400_000;

/** แปลงผลการตรวจเป็นข้อความสำหรับ log ของผู้ดูแล บอกผลกระทบและสิ่งที่ต้องแก้ */
export function describeAccountCheck(
  result: AccountCheckResult,
  settings: { hasApiKey: boolean; chatModel: string; transcribeModel: string },
  now: Date = new Date()
): AccountCheckReport[] {
  const reports: AccountCheckReport[] = [];
  const { chat, transcribe } = result;

  if (chat === "auth" || transcribe === "auth") {
    reports.push({
      level: "error",
      message: settings.hasApiKey
        ? "ตรวจบัญชี AI: OPENAI_API_KEY ถูกปฏิเสธ Javis จะตอบและแปลงเสียงไม่ได้จนกว่าจะแก้ค่านี้"
        : "ตรวจบัญชี AI: ยังไม่ได้ตั้ง OPENAI_API_KEY Javis จะตอบและแปลงเสียงไม่ได้"
    });
  } else if (chat === "quota" || transcribe === "quota") {
    reports.push({
      level: "error",
      message: "ตรวจบัญชี AI: เครดิตของบัญชีหมด Javis จะตอบและแปลงเสียงไม่ได้จนกว่าจะเติมเครดิต"
    });
  }

  if (chat === "model") {
    reports.push({
      level: "error",
      message: `ตรวจบัญชี AI: ไม่พบโมเดลสนทนา "${settings.chatModel}" (OPENAI_CHAT_MODEL) Javis จะตอบไม่ได้`
    });
  }
  if (transcribe === "model") {
    reports.push({
      level: "warn",
      message: `ตรวจบัญชี AI: ไม่พบโมเดลแปลงเสียง "${settings.transcribeModel}" (OPENAI_TRANSCRIBE_MODEL) แอปเดสก์ท็อปจะฟังเสียงพูดไม่ได้`
    });
  }
  if (chat === "unreachable" || transcribe === "unreachable") {
    reports.push({
      level: "warn",
      message: "ตรวจบัญชี AI: ติดต่อบริการ AI ไม่สำเร็จ จึงยังไม่รู้สถานะ จะรู้เมื่อมีคำขอแรกจากผู้ใช้"
    });
  }

  for (const { service, model, date } of result.retiring) {
    const days = Math.ceil((Date.parse(`${date}T00:00:00Z`) - now.getTime()) / MS_PER_DAY);
    const variable = service === "chat" ? "OPENAI_CHAT_MODEL" : "OPENAI_TRANSCRIBE_MODEL";
    reports.push({
      level: "warn",
      message:
        days > 0
          ? `ตรวจบัญชี AI: โมเดล "${model}" จะถูกปิดให้บริการวันที่ ${date} (อีก ${days} วัน) ควรเปลี่ยน ${variable} ก่อนถึงวันนั้น`
          : `ตรวจบัญชี AI: โมเดล "${model}" ถึงกำหนดปิดให้บริการแล้ว (${date}) ควรเปลี่ยน ${variable} ทันที`
    });
  }

  if (chat === "ok" && transcribe === "ok") {
    const creditNote =
      result.credits === "ok"
        ? "เครดิตยังเหลือ"
        : result.credits === "skipped"
          ? "ไม่ได้ตรวจเครดิตเพราะตั้ง AI_CREDIT_CHECK=false"
          : "ยังตรวจเครดิตไม่ได้";
    reports.unshift({
      level: "info",
      message: `ตรวจบัญชี AI: พร้อมใช้งาน (โมเดลสนทนา ${settings.chatModel}, โมเดลแปลงเสียง ${settings.transcribeModel}, ${creditNote})`
    });
  }

  return reports;
}
