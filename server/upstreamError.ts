/** สาเหตุที่บริการ AI ต้นทางปฏิเสธคำขอ จัดกลุ่มเพื่อเลือกข้อความที่ผู้ใช้อ่านแล้วรู้ว่าต้องทำอะไรต่อ */
export type UpstreamFailureReason = "quota" | "auth" | "model" | "busy" | "unknown";

export interface UpstreamFailure {
  reason: UpstreamFailureReason;
  /** รหัสสถานะที่ตอบกลับไปยังแอป ไม่ใช้ 401 เพราะแอปตีความว่าเซสชันของผู้ใช้หมดอายุ */
  status: 502 | 503;
  /** ข้อความภาษาไทยสำหรับแสดงให้ผู้ใช้ */
  message: string;
}

/** บริการที่เรียกต้นทาง ใช้เลือกถ้อยคำให้ตรงกับสิ่งที่ผู้ใช้กำลังทำ */
export type UpstreamService = "chat" | "transcribe";

type Json = Record<string, unknown>;

const MAX_CODE_LENGTH = 80;
const QUOTA_CODES = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "billing_hard_limit_reached",
  "billing_not_active"
]);
// รหัสตัวพิมพ์ใหญ่คือสถานะของ Google (Gemini) ซึ่งใช้ชุดรหัสคนละแบบกับ OpenAI
const AUTH_CODES = new Set([
  "invalid_api_key",
  "invalid_authentication",
  "account_deactivated",
  "invalid_organization",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED"
]);
const MODEL_CODES = new Set(["model_not_found", "unsupported_model", "NOT_FOUND"]);
// RESOURCE_EXHAUSTED คือโควตาต่อนาทีหรือต่อวันเต็ม ซึ่งกลับมาใช้ได้เองโดยไม่ต้องให้ผู้ดูแลทำอะไร
const BUSY_CODES = new Set(["rate_limit_exceeded", "server_is_overloaded", "overloaded", "RESOURCE_EXHAUSTED", "UNAVAILABLE"]);
/** Google ตอบกุญแจผิดด้วยรหัสกลาง ๆ (400 INVALID_ARGUMENT) จึงต้องดูจากข้อความ ใช้เพื่อจัดกลุ่มเท่านั้น ไม่ส่งต่อให้ใคร */
const API_KEY_MESSAGE = /api key/i;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codesOf(error: unknown): string[] {
  if (!isObject(error)) return [];

  const codes = [error.code, error.type, error.status].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  if (typeof error.message === "string" && API_KEY_MESSAGE.test(error.message)) codes.push("invalid_api_key");
  return codes;
}

/**
 * อ่านรหัสข้อผิดพลาดจากคำตอบของต้นทาง รองรับทั้งสามรูปแบบที่พบจริง:
 * เนื้อหาของคำตอบที่ถูกปฏิเสธ `{ error }` เหตุการณ์ `error` ในสตรีม `{ type: "error", error }`
 * และเหตุการณ์ `response.failed` ที่มี `{ response: { error } }` รวมถึงแบบที่ Google ห่อไว้ในรายการ `[{ error }]`
 * คืนรายการว่างถ้าไม่พบ และไม่คืนข้อความของต้นทาง เพราะอาจมีข้อมูลบัญชีปนมา
 */
export function readUpstreamErrorCodes(input: unknown): string[] {
  const payload: unknown = Array.isArray(input) ? input[0] : input;
  if (!isObject(payload)) return [];

  const codes = [...codesOf(payload.error), ...(isObject(payload.response) ? codesOf(payload.response.error) : [])];
  // เหตุการณ์ error รุ่นเดิมวางรหัสไว้ชั้นนอกสุด
  if (payload.type === "error" && typeof payload.code === "string" && payload.code) codes.push(payload.code);

  return [...new Set(codes.map((code) => code.slice(0, MAX_CODE_LENGTH)))];
}

function reasonOf(httpStatus: number | null, codes: readonly string[]): UpstreamFailureReason {
  const has = (known: Set<string>) => codes.some((code) => known.has(code));

  // เครดิตหมดมาพร้อมรหัสสถานะ 429 เหมือนตอนผู้ใช้หนาแน่น จึงต้องดูรหัสข้อผิดพลาดก่อนรหัสสถานะ
  if (has(QUOTA_CODES)) return "quota";
  if (has(AUTH_CODES) || httpStatus === 401) return "auth";
  if (has(MODEL_CODES) || httpStatus === 404) return "model";
  if (has(BUSY_CODES) || httpStatus === 429 || httpStatus === 503) return "busy";
  return "unknown";
}

/** ชื่อบริการสำหรับขึ้นต้นประโยค ชื่อที่ลงท้ายด้วยอักษรอังกฤษต้องเว้นวรรคก่อนคำไทยที่ตามมา */
const SERVICE_NAME: Record<UpstreamService, string> = {
  chat: "บริการ AI ",
  transcribe: "บริการแปลงเสียง"
};

const UNKNOWN_MESSAGE: Record<UpstreamService, string> = {
  chat: "บริการ AI ตอบกลับผิดพลาด กรุณาลองใหม่",
  transcribe: "แปลงเสียงเป็นข้อความไม่สำเร็จ กรุณาลองใหม่"
};

/**
 * แปลงความล้มเหลวของต้นทางเป็นข้อความที่บอกผู้ใช้ว่าลองใหม่แล้วจะหายไหม
 * @param httpStatus รหัสสถานะของต้นทาง หรือ null ถ้าล้มเหลวกลางสตรีมหลังตอบ 200 แล้ว
 */
export function describeUpstreamFailure(
  service: UpstreamService,
  httpStatus: number | null,
  codes: readonly string[]
): UpstreamFailure {
  const reason = reasonOf(httpStatus, codes);
  const name = SERVICE_NAME[service];

  switch (reason) {
    case "quota":
      return {
        reason,
        status: 503,
        message: `${name}ใช้งานไม่ได้ เพราะเครดิตของบัญชี AI หมด กรุณาแจ้งผู้ดูแลระบบให้เติมเครดิต`
      };
    case "auth":
      return {
        reason,
        status: 502,
        message: `กุญแจ API ของระบบใช้งานไม่ได้ กรุณาแจ้งผู้ดูแลระบบให้ตรวจการตั้งค่า`
      };
    case "model":
      return {
        reason,
        status: 502,
        message: `${name}ใช้งานไม่ได้ เพราะโมเดลที่ตั้งค่าไว้ไม่พร้อมใช้ กรุณาแจ้งผู้ดูแลระบบให้ตรวจการตั้งค่า`
      };
    case "busy":
      return { reason, status: 503, message: `${name}มีผู้ใช้งานหนาแน่น กรุณาลองใหม่ในอีกสักครู่` };
    default:
      return { reason, status: 502, message: UNKNOWN_MESSAGE[service] };
  }
}

export interface UpstreamRejection {
  codes: string[];
  /**
   * ข้อความของต้นทางที่ตัดให้สั้นและปิดบังสิ่งที่ดูเหมือนกุญแจแล้ว
   * สำหรับ log ของผู้ดูแลเท่านั้น ห้ามส่งให้ผู้ใช้
   */
  logDetail: string;
}

const MAX_LOG_DETAIL_LENGTH = 240;
/** สิ่งที่ดูเหมือนกุญแจหรือโทเค็น: กุญแจของ OpenAI และ Google และค่าที่ตามหลังคำว่า Bearer */
const SECRET_LIKE = /sk-[A-Za-z0-9_*.-]{6,}|AIza[0-9A-Za-z_-]{10,}|Bearer\s+\S+/g;

/** ทำข้อความของต้นทางให้ปลอดภัยพอจะเขียนลง log: บรรทัดเดียว ไม่มีสิ่งที่ดูเหมือนกุญแจ และไม่ยาวเกินกำหนด */
export function sanitizeUpstreamMessage(message: unknown): string {
  if (typeof message !== "string") return "";
  return message.replace(/\s+/g, " ").replace(SECRET_LIKE, "[ปิดบัง]").trim().slice(0, MAX_LOG_DETAIL_LENGTH);
}

function messageOf(input: unknown): unknown {
  const payload: unknown = Array.isArray(input) ? input[0] : input;
  return isObject(payload) && isObject(payload.error) ? payload.error.message : undefined;
}

/**
 * อ่านคำตอบที่ถูกปฏิเสธ แล้วปิดการเชื่อมต่อของคำตอบนั้น
 * คืนรหัสข้อผิดพลาดสำหรับจัดกลุ่ม และข้อความที่ปิดบังแล้วสำหรับให้ผู้ดูแลหาสาเหตุ
 */
export async function readRejection(upstream: Response): Promise<UpstreamRejection> {
  try {
    const payload: unknown = await upstream.json();
    return { codes: readUpstreamErrorCodes(payload), logDetail: sanitizeUpstreamMessage(messageOf(payload)) };
  } catch {
    // ต้นทางไม่ได้ตอบเป็น JSON: ไม่มีรหัสให้อ่าน
    await upstream.body?.cancel().catch(() => undefined);
    return { codes: [], logDetail: "" };
  }
}

/** อ่านเฉพาะรหัสข้อผิดพลาดจากคำตอบที่ถูกปฏิเสธ */
export async function readRejectedResponse(upstream: Response): Promise<string[]> {
  return (await readRejection(upstream)).codes;
}
