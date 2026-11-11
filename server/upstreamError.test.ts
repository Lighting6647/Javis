import { describe, expect, it } from "vitest";
import { describeUpstreamFailure, readRejectedResponse, readUpstreamErrorCodes } from "./upstreamError.js";

/** รูปแบบจริงที่ OpenAI ส่งเมื่อเครดิตของบัญชีหมด */
const QUOTA_ERROR = {
  type: "insufficient_quota",
  code: "credit_balance_exhausted",
  message: "You have no credits remaining.",
  param: null
};

describe("readUpstreamErrorCodes", () => {
  it("อ่านจากเนื้อหาของคำตอบที่ถูกปฏิเสธ", () => {
    expect(readUpstreamErrorCodes({ error: QUOTA_ERROR })).toEqual(["credit_balance_exhausted", "insufficient_quota"]);
  });

  it("อ่านจากเหตุการณ์ error ในสตรีม", () => {
    expect(readUpstreamErrorCodes({ type: "error", error: QUOTA_ERROR, sequence_number: 2 })).toContain("insufficient_quota");
  });

  it("อ่านจากเหตุการณ์ response.failed", () => {
    const event = { type: "response.failed", response: { status: "failed", error: QUOTA_ERROR, output: [] } };
    expect(readUpstreamErrorCodes(event)).toContain("credit_balance_exhausted");
  });

  it("อ่านเหตุการณ์ error รุ่นเดิมที่วางรหัสไว้ชั้นนอก", () => {
    expect(readUpstreamErrorCodes({ type: "error", code: "rate_limit_exceeded", message: "slow down" })).toEqual([
      "rate_limit_exceeded"
    ]);
  });

  describe("รูปแบบของ Google (Gemini)", () => {
    // รูปแบบจริงที่ได้จากการเรียกด้วยกุญแจที่ไม่ถูกต้อง
    const BAD_KEY = { code: 400, message: "Please pass a valid API key", status: "INVALID_ARGUMENT" };

    it("อ่านสถานะจากคำตอบ ทั้งแบบปกติและแบบที่ห่อในรายการ", () => {
      const quota = { error: { code: 429, message: "Quota exceeded for metric", status: "RESOURCE_EXHAUSTED" } };
      expect(readUpstreamErrorCodes(quota)).toEqual(["RESOURCE_EXHAUSTED"]);
      expect(readUpstreamErrorCodes([quota])).toEqual(["RESOURCE_EXHAUSTED"]);
    });

    it("กุญแจผิดถูกจัดเป็นปัญหากุญแจ แม้รหัสจะเป็น 400 กลาง ๆ", () => {
      const codes = readUpstreamErrorCodes([{ error: BAD_KEY }]);
      expect(codes).toContain("invalid_api_key");
      expect(describeUpstreamFailure("chat", 400, codes)).toMatchObject({ reason: "auth", status: 502 });
    });

    it("คำขอผิดรูปแบบที่ไม่เกี่ยวกับกุญแจ ไม่ถูกเข้าใจว่าเป็นปัญหากุญแจ", () => {
      const codes = readUpstreamErrorCodes({ error: { code: 400, message: "Invalid JSON payload received", status: "INVALID_ARGUMENT" } });
      expect(describeUpstreamFailure("chat", 400, codes)).toMatchObject({ reason: "unknown" });
    });

    it("โควตาฟรีเต็มคือให้ลองใหม่ภายหลัง ไม่ใช่ให้เติมเครดิต", () => {
      const failure = describeUpstreamFailure("chat", 429, ["RESOURCE_EXHAUSTED"]);
      expect(failure).toMatchObject({ reason: "busy", status: 503 });
      expect(failure.message).not.toContain("เครดิต");
    });

    it("ไม่พบโมเดล และไม่มีสิทธิ์ใช้", () => {
      expect(describeUpstreamFailure("chat", 404, ["NOT_FOUND"])).toMatchObject({ reason: "model" });
      expect(describeUpstreamFailure("chat", 403, ["PERMISSION_DENIED"])).toMatchObject({ reason: "auth" });
    });

    it("ไม่คืนข้อความของต้นทาง แม้จะใช้ข้อความในการจัดกลุ่ม", () => {
      expect(readUpstreamErrorCodes({ error: BAD_KEY }).join(" ")).not.toContain("Please pass");
    });
  });

  it("ไม่นับชนิดของเหตุการณ์เป็นรหัสข้อผิดพลาด", () => {
    expect(readUpstreamErrorCodes({ type: "response.failed", response: { error: null } })).toEqual([]);
    expect(readUpstreamErrorCodes({ type: "error" })).toEqual([]);
  });

  it("ทนต่อข้อมูลที่ไม่ใช่รูปแบบที่คาดไว้", () => {
    for (const payload of [null, undefined, "error", 42, [], { error: "text" }, { error: { code: 7, type: null } }]) {
      expect(readUpstreamErrorCodes(payload)).toEqual([]);
    }
  });

  it("ตัดรหัสที่ยาวผิดปกติและไม่คืนข้อความของต้นทาง", () => {
    const codes = readUpstreamErrorCodes({ error: { code: "x".repeat(500), message: "secret account detail" } });
    expect(codes).toEqual(["x".repeat(80)]);
  });
});

describe("describeUpstreamFailure", () => {
  it("เครดิตหมดต้องไม่ถูกบอกว่าผู้ใช้หนาแน่น แม้ต้นทางตอบ 429", () => {
    const failure = describeUpstreamFailure("transcribe", 429, ["credit_balance_exhausted", "insufficient_quota"]);
    expect(failure).toMatchObject({ reason: "quota", status: 503 });
    expect(failure.message).toContain("เครดิต");
    expect(failure.message).not.toContain("หนาแน่น");
  });

  it("เครดิตหมดกลางสตรีมหลังต้นทางตอบ 200 แล้ว", () => {
    expect(describeUpstreamFailure("chat", null, ["insufficient_quota"])).toMatchObject({ reason: "quota", status: 503 });
  });

  it("429 ที่ไม่มีรหัสเครดิตคือผู้ใช้หนาแน่น", () => {
    expect(describeUpstreamFailure("chat", 429, ["rate_limit_exceeded"])).toMatchObject({ reason: "busy", status: 503 });
    expect(describeUpstreamFailure("chat", 429, [])).toMatchObject({ reason: "busy", status: 503 });
  });

  it("กุญแจ API ผิดไม่ถูกส่งต่อเป็น 401 เพราะแอปจะเข้าใจว่าเซสชันผู้ใช้หมดอายุ", () => {
    const failure = describeUpstreamFailure("chat", 401, ["invalid_api_key"]);
    expect(failure).toMatchObject({ reason: "auth", status: 502 });
    expect(describeUpstreamFailure("chat", 401, [])).toMatchObject({ reason: "auth", status: 502 });
  });

  it("โมเดลที่ตั้งค่าไว้ไม่มีอยู่จริง", () => {
    expect(describeUpstreamFailure("chat", 404, ["model_not_found"])).toMatchObject({ reason: "model", status: 502 });
  });

  it("ต้นทางรับงานไม่ไหวคือให้ลองใหม่ภายหลัง", () => {
    expect(describeUpstreamFailure("chat", 503, [])).toMatchObject({ reason: "busy", status: 503 });
    expect(describeUpstreamFailure("chat", null, ["server_is_overloaded"])).toMatchObject({ reason: "busy", status: 503 });
  });

  it("ต้นทางขัดข้องภายในไม่ถูกบอกว่าผู้ใช้หนาแน่น", () => {
    expect(describeUpstreamFailure("chat", 500, [])).toMatchObject({ reason: "unknown", status: 502 });
    expect(describeUpstreamFailure("chat", null, ["server_error"])).toMatchObject({ reason: "unknown", status: 502 });
  });

  it("ข้อผิดพลาดที่ไม่รู้จักใช้ข้อความกลางของแต่ละบริการ", () => {
    expect(describeUpstreamFailure("chat", 400, ["invalid_value"])).toMatchObject({ reason: "unknown", status: 502 });
    expect(describeUpstreamFailure("chat", null, []).message).toContain("บริการ AI");
    expect(describeUpstreamFailure("transcribe", 400, []).message).toContain("แปลงเสียง");
  });

  it("ใช้ชื่อบริการให้ตรงกับสิ่งที่ผู้ใช้ทำ", () => {
    expect(describeUpstreamFailure("transcribe", 429, []).message).toBe(
      "บริการแปลงเสียงมีผู้ใช้งานหนาแน่น กรุณาลองใหม่ในอีกสักครู่"
    );
    expect(describeUpstreamFailure("chat", 429, []).message).toBe("บริการ AI มีผู้ใช้งานหนาแน่น กรุณาลองใหม่ในอีกสักครู่");
  });

  it("เว้นวรรคหลังชื่อบริการที่ลงท้ายด้วยอักษรอังกฤษทุกข้อความ", () => {
    for (const [status, codes] of [
      [429, ["insufficient_quota"]],
      [401, []],
      [404, []],
      [429, []],
      [400, []]
    ] as const) {
      expect(describeUpstreamFailure("chat", status, codes).message).not.toMatch(/AI[ก-๙]/);
    }
  });
});

describe("readRejectedResponse", () => {
  it("อ่านรหัสจากคำตอบ JSON", async () => {
    const upstream = new Response(JSON.stringify({ error: QUOTA_ERROR }), { status: 429 });
    expect(await readRejectedResponse(upstream)).toContain("insufficient_quota");
  });

  it("คืนรายการว่างเมื่อคำตอบไม่ใช่ JSON", async () => {
    expect(await readRejectedResponse(new Response("<html>Bad gateway</html>", { status: 502 }))).toEqual([]);
    expect(await readRejectedResponse(new Response(null, { status: 500 }))).toEqual([]);
  });
});
