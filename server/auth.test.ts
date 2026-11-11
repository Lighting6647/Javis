import { describe, expect, it } from "vitest";
import {
  createAuthenticator,
  parseAccessCodes,
  readBearerToken,
  resolveAccessMode,
  SESSION_TTL_MS,
  type AccessUser
} from "./auth.js";

// ค่าทดสอบเท่านั้น ไม่ใช่รหัสจริงของระบบใด
const SECRET = "unit-test-secret-not-for-production-use";
const USERS: AccessUser[] = [
  { name: "light", code: "test-code-light-01" },
  { name: "nurse", code: "test-code-nurse-02" }
];

function setup(users = USERS, startAt = 1_000_000) {
  const clock = { now: startAt };
  const auth = createAuthenticator({ users, secret: SECRET, now: () => clock.now });
  return { auth, clock };
}

describe("parseAccessCodes", () => {
  it("อ่านผู้ใช้หลายคน ตัดช่องว่าง และยอมให้รหัสมีเครื่องหมาย :", () => {
    expect(parseAccessCodes(" light : test-code-light-01 , nurse:pass:word:123 ", () => undefined)).toEqual([
      { name: "light", code: "test-code-light-01" },
      { name: "nurse", code: "pass:word:123" }
    ]);
  });

  it("คืนรายการว่างเมื่อไม่ได้ตั้งค่า", () => {
    expect(parseAccessCodes(undefined)).toEqual([]);
    expect(parseAccessCodes("  ")).toEqual([]);
  });

  it("ข้ามรายการที่ไม่ถูกต้องพร้อมคำเตือนที่ไม่เปิดเผยรหัส", () => {
    const warnings: string[] = [];
    const users = parseAccessCodes(
      [
        "ok:long-enough-code",
        "short:1234567",
        "no-code",
        "bad name:long-enough-code-2",
        "OK:another-long-code",
        "twin:long-enough-code"
      ].join(","),
      (message) => warnings.push(message)
    );

    expect(users).toEqual([{ name: "ok", code: "long-enough-code" }]);
    expect(warnings).toHaveLength(5);
    expect(warnings.join("\n")).not.toMatch(/1234567|long-enough-code|another-long-code/);
  });

  it("ใส่แต่รหัสโดยไม่มี ชื่อ: นำหน้า: บอกรูปแบบที่ถูก และไม่พิมพ์สิ่งที่ใส่มาเพราะอาจเป็นรหัสจริง", () => {
    // กรณีจริงที่พบตอนตั้งค่าบนโฮสต์: ผู้ดูแลใส่รหัสอย่างเดียว คำเตือนเดิมบอกว่า "รหัสสั้นเกินไป" และพิมพ์รหัสนั้นลง log
    for (const value of ["my-secret-code-2026", "12345678", "a-code,another-code-here"]) {
      const warnings: string[] = [];
      expect(parseAccessCodes(value, (message) => warnings.push(message))).toEqual([]);

      expect(warnings.length).toBeGreaterThan(0);
      for (const warning of warnings) {
        expect(warning).toContain("ชื่อ:รหัส");
        expect(warning).toContain("ไม่มีเครื่องหมาย :");
        expect(warning).not.toMatch(/my-secret-code-2026|12345678|a-code|another-code-here/);
      }
    }
  });

  describe("resolveAccessMode", () => {
    const base = { codesConfigured: false, validUsers: 0, isServerless: false, hasSessionSecret: false };

    it("ไม่ตั้ง ACCESS_CODES คือเปิดให้ใช้โดยไม่ต้องเข้าสู่ระบบ ทั้งตอนพัฒนาและบนโฮสต์จริง", () => {
      expect(resolveAccessMode(base)).toBe("open");
      expect(resolveAccessMode({ ...base, isServerless: true })).toBe("open");
    });

    it("เปิดให้ทุกคนใช้ไม่ต้องมีกุญแจเซสชัน เพราะไม่มีโทเค็นให้ลงลายเซ็น", () => {
      expect(resolveAccessMode({ ...base, isServerless: true, hasSessionSecret: false })).toBe("open");
    });

    it("ตั้ง ACCESS_CODES ไว้แต่ไม่มีรายการใดใช้ได้: ปิดรับคำขอ ไม่เปิดโล่งโดยที่ผู้ดูแลไม่รู้ตัว", () => {
      expect(resolveAccessMode({ ...base, codesConfigured: true })).toBe("invalid-codes");
      expect(resolveAccessMode({ ...base, codesConfigured: true, isServerless: true, hasSessionSecret: true })).toBe("invalid-codes");
    });

    it("มีผู้ใช้ที่ถูกต้อง: ต้องเข้าสู่ระบบ", () => {
      expect(resolveAccessMode({ ...base, codesConfigured: true, validUsers: 2 })).toBe("protected");
      expect(resolveAccessMode({ ...base, codesConfigured: true, validUsers: 1, isServerless: true, hasSessionSecret: true })).toBe("protected");
    });

    it("ต้องเข้าสู่ระบบบนโฮสต์แบบฟังก์ชันแต่ไม่มีกุญแจเซสชัน: ปิดรับการเข้าสู่ระบบพร้อมบอกสาเหตุ", () => {
      expect(resolveAccessMode({ ...base, codesConfigured: true, validUsers: 1, isServerless: true })).toBe("missing-secret");
    });
  });

  it("มีเครื่องหมาย : แต่รหัสสั้นเกินไป: บอกชื่อผู้ใช้ได้ แต่ไม่พิมพ์รหัส", () => {
    const warnings: string[] = [];
    expect(parseAccessCodes("light:abc1234", (message) => warnings.push(message))).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining("light")]);
    expect(warnings[0]).toContain("อย่างน้อย 8 ตัวอักษร");
    expect(warnings[0]).not.toContain("abc1234");
  });
});

describe("readBearerToken", () => {
  it("แกะโทเค็นจาก header", () => {
    expect(readBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(readBearerToken("bearer   abc.def")).toBe("abc.def");
  });

  it("คืน undefined เมื่อรูปแบบไม่ถูกต้อง", () => {
    expect(readBearerToken(undefined)).toBeUndefined();
    expect(readBearerToken("Basic abc")).toBeUndefined();
    expect(readBearerToken("Bearer ")).toBeUndefined();
    expect(readBearerToken("Bearer a b")).toBeUndefined();
  });
});

describe("createAuthenticator", () => {
  it("รหัสที่ถูกต้องได้โทเค็นของผู้ใช้คนนั้น และโทเค็นตรวจผ่าน", () => {
    const { auth, clock } = setup();

    const result = auth.login("test-code-nurse-02");

    expect(result?.session).toEqual({ name: "nurse", expiresAt: clock.now + SESSION_TTL_MS });
    expect(auth.verify(result?.token)).toEqual(result?.session);
  });

  it("ปฏิเสธรหัสที่ไม่ตรงกับผู้ใช้คนใด", () => {
    const { auth } = setup();

    expect(auth.login("wrong-code-000")).toBeNull();
    expect(auth.login("")).toBeNull();
    expect(auth.login("test-code-light-0")).toBeNull();
  });

  it("ปฏิเสธทุกรหัสเมื่อไม่มีผู้ใช้", () => {
    const { auth } = setup([]);
    expect(auth.login("test-code-light-01")).toBeNull();
  });

  it("ปฏิเสธโทเค็นที่หมดอายุ", () => {
    const { auth, clock } = setup();
    const token = auth.login("test-code-light-01")?.token;

    clock.now += SESSION_TTL_MS - 1;
    expect(auth.verify(token)?.name).toBe("light");

    clock.now += 1;
    expect(auth.verify(token)).toBeNull();
  });

  it("ปฏิเสธโทเค็นที่ถูกแก้ไขหรือผิดรูปแบบ", () => {
    const { auth } = setup();
    const token = auth.login("test-code-light-01")?.token ?? "";
    const [payload, signature] = token.split(".");

    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload ?? "", "base64url").toString()), sub: "nurse" })
    ).toString("base64url");

    expect(auth.verify(`${forged}.${signature}`)).toBeNull();
    expect(auth.verify(`${payload}.${"A".repeat(signature?.length ?? 0)}`)).toBeNull();
    expect(auth.verify(payload)).toBeNull();
    expect(auth.verify(`${token}.extra`)).toBeNull();
    expect(auth.verify("")).toBeNull();
    expect(auth.verify(undefined)).toBeNull();
    expect(auth.verify("not-a-token")).toBeNull();
  });

  it("ปฏิเสธโทเค็นที่ลงลายเซ็นด้วยกุญแจอื่น", () => {
    const { auth } = setup();
    const other = createAuthenticator({ users: USERS, secret: "another-secret-for-unit-tests-only!" });

    expect(auth.verify(other.login("test-code-light-01")?.token)).toBeNull();
  });

  it("เพิกถอนโทเค็นทันทีเมื่อรหัสของผู้ใช้ถูกเปลี่ยนหรือผู้ใช้ถูกลบ", () => {
    const token = setup().auth.login("test-code-light-01")?.token;

    const afterChange = setup([{ name: "light", code: "test-code-light-new" }, USERS[1]!]).auth;
    const afterRemoval = setup([USERS[1]!]).auth;

    expect(afterChange.verify(token)).toBeNull();
    expect(afterRemoval.verify(token)).toBeNull();
  });
});
