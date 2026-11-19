import { describe, expect, it } from "vitest";
import { createDatabase, SCHEMA_STATEMENTS, type SqlQuery } from "./db.js";
import {
  clampDays,
  createMemoryUserStore,
  createPostgresUserStore,
  ownerOf,
  redactFreeText,
  sanitizeStoredMemories,
  summarizeFeedback
} from "./userStore.js";

describe("sanitizeStoredMemories (กฎความจำเดิม)", () => {
  it("เก็บไม่เกิน 50 เรื่อง โดยเก็บเรื่องล่าสุด", () => {
    const items = Array.from({ length: 60 }, (_, index) => ({ id: `m${index.toString(36)}a`, text: `เรื่องที่ ${index}`, createdAt: index }));
    const { memories } = sanitizeStoredMemories(items);
    expect(memories).toHaveLength(50);
    expect(memories[0]?.text).toBe("เรื่องที่ 10");
    expect(memories.at(-1)?.text).toBe("เรื่องที่ 59");
  });

  it("ตัดข้อความเหลือ 200 ตัวอักษร และตัดอักขระควบคุม", () => {
    const { memories } = sanitizeStoredMemories([{ id: "m1", text: `ก\u0007${"ข".repeat(300)}` }]);
    expect(memories[0]?.text.length).toBe(200);
    expect(memories[0]?.text.startsWith("ก ข")).toBe(true);
  });

  it("ไม่จำรหัสผ่าน OTP และเลขตั้งแต่ 13 หลัก พร้อมนับจำนวนที่ปฏิเสธ", () => {
    const result = sanitizeStoredMemories([
      { id: "m1", text: "รหัสผ่านอีเมลคือ abc123" },
      { id: "m2", text: "OTP ล่าสุด 445566" },
      { id: "m3", text: "เลขบัตรประชาชน 1-2345-67890-12-3" },
      { id: "m4", text: "ผู้ใช้ชอบกาแฟดำ" }
    ]);
    expect(result.memories.map((item) => item.text)).toEqual(["ผู้ใช้ชอบกาแฟดำ"]);
    expect(result.rejected).toBe(3);
  });

  it("ข้ามรหัสผิดรูปแบบ รหัสซ้ำ และข้อความซ้ำ", () => {
    const { memories } = sanitizeStoredMemories([
      { id: "bad", text: "ก" },
      { id: "m1", text: "ชอบแมว" },
      { id: "m1", text: "ชอบหมา" },
      { id: "m2", text: "ชอบแมว" },
      null,
      "x"
    ]);
    expect(memories).toEqual([{ id: "m1", text: "ชอบแมว", createdAt: 0 }]);
  });

  it("ข้อมูลที่ไม่ใช่รายการคืนรายการว่าง", () => {
    expect(sanitizeStoredMemories({ a: 1 })).toEqual({ memories: [], rejected: 0 });
  });
});

describe("ownerOf", () => {
  it("ใช้ชื่อผู้ใช้ที่เข้าสู่ระบบ หรือช่องร่วม _", () => {
    expect(ownerOf("light")).toBe("light");
    expect(ownerOf(undefined)).toBe("_");
    expect(ownerOf("")).toBe("_");
  });
});

describe("redactFreeText", () => {
  it("ปิดบังอีเมล เบอร์โทร เลขยาว และกุญแจ API", () => {
    const text = redactFreeText("ติดต่อ a@b.co โทร 0812345678 บัตร 1234 5678 9012 3456 key sk-abcdefghijk", 500);
    expect(text).toBe("ติดต่อ [email] โทร [phone] บัตร [number] key [secret]");
  });
  it("ตัดความยาวและรับเฉพาะสตริง", () => {
    expect(redactFreeText("ก".repeat(20), 5)).toBe("กกกกก");
    expect(redactFreeText(42, 5)).toBe("");
  });
});

describe("clampDays", () => {
  it("ค่าเริ่มต้น 7 วัน และไม่เกิน 90 วัน", () => {
    expect(clampDays(undefined)).toBe(7);
    expect(clampDays("abc")).toBe(7);
    expect(clampDays("0")).toBe(7);
    expect(clampDays("30")).toBe(30);
    expect(clampDays(500)).toBe(90);
  });
});

describe("summarizeFeedback", () => {
  it("นับ 👍/👎 รายวันตามเวลาไทย และเรียงหมายเหตุ 👎 ล่าสุดก่อน", () => {
    const base = Date.UTC(2026, 10, 18, 18, 0, 0); // 19 พ.ย. 01:00 เวลาไทย
    const summary = summarizeFeedback(
      [
        { user: "a", rating: "up", note: "", reply: "", createdAt: base },
        { user: "a", rating: "down", note: "ยาวไป", reply: "", createdAt: base + 1000 },
        { user: "a", rating: "down", note: "", reply: "", createdAt: base - 2 * 60 * 60 * 1000 }
      ],
      7
    );
    expect(summary).toMatchObject({ total: 3, up: 1, down: 2, upRatio: 0.333 });
    expect(summary.byDay).toEqual([
      { date: "2026-11-18", up: 0, down: 1 },
      { date: "2026-11-19", up: 1, down: 1 }
    ]);
    expect(summary.recentDownNotes).toEqual([{ note: "ยาวไป", createdAt: base + 1000 }]);
  });

  it("ยังไม่มีคำติชม upRatio เป็น null", () => {
    expect(summarizeFeedback([], 7).upRatio).toBeNull();
  });
});

describe("createMemoryUserStore", () => {
  it("แยกความจำตามผู้ใช้", async () => {
    const store = createMemoryUserStore();
    await store.putMemories("light", [{ id: "m1", text: "ชื่อไลท์" }]);
    await store.putMemories("nurse", [{ id: "m2", text: "ทำงานกะดึก" }]);
    expect((await store.getMemories("light")).map((item) => item.text)).toEqual(["ชื่อไลท์"]);
    expect((await store.getMemories("nurse")).map((item) => item.text)).toEqual(["ทำงานกะดึก"]);
    expect(await store.getMemories("_")).toEqual([]);
  });

  it("กรองคำติชมตามช่วงวัน ผู้ใช้ และชนิด", async () => {
    let clock = Date.UTC(2026, 0, 1);
    const store = createMemoryUserStore(() => clock);
    await store.addFeedback("light", { rating: "down", note: "เก่า" });
    clock += 10 * 24 * 60 * 60 * 1000;
    await store.addFeedback("light", { rating: "up" });
    await store.addFeedback("nurse", { rating: "down", note: "ช้า" });
    expect(await store.listFeedback({ user: "light", days: 7 })).toHaveLength(1);
    expect(await store.listFeedback({ user: null, days: 7, rating: "down" })).toMatchObject([{ user: "nurse", note: "ช้า" }]);
    expect(await store.listFeedback({ user: null, days: 30 })).toHaveLength(3);
  });
});

/** ฐานข้อมูลจำลองที่จดคำสั่ง SQL ไว้ และคืนแถวตามที่กำหนด */
function fakeSql(respond: (text: string, params: unknown[]) => Record<string, unknown>[] = () => []) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const run: SqlQuery = async (text, params = []) => {
    calls.push({ text, params });
    return respond(text, params);
  };
  return { calls, run };
}

describe("createDatabase", () => {
  it("สร้างตารางครั้งเดียวก่อนคำสั่งแรก", async () => {
    const sql = fakeSql();
    const db = createDatabase(sql.run);
    await db.query("SELECT 1");
    await db.query("SELECT 2");
    expect(sql.calls.map((call) => call.text)).toEqual([...SCHEMA_STATEMENTS, "SELECT 1", "SELECT 2"]);
  });

  it("สร้างตารางไม่สำเร็จ ครั้งถัดไปลองใหม่", async () => {
    let fail = true;
    const sql = fakeSql(() => {
      if (fail) throw new Error("down");
      return [];
    });
    const db = createDatabase(sql.run);
    await expect(db.query("SELECT 1")).rejects.toThrow("down");
    fail = false;
    await expect(db.query("SELECT 1")).resolves.toEqual([]);
  });
});

describe("createPostgresUserStore", () => {
  it("บันทึกความจำที่ผ่านการกรองแล้วเป็น JSON ของผู้ใช้คนนั้น", async () => {
    const sql = fakeSql();
    const store = createPostgresUserStore({ query: sql.run });
    const result = await store.putMemories("light", [
      { id: "m1", text: "ชอบชาเขียว" },
      { id: "m2", text: "รหัสผ่าน 1234" }
    ]);
    expect(result.rejected).toBe(1);
    const insert = sql.calls.find((call) => call.text.includes("INSERT INTO user_documents"));
    expect(insert?.params.slice(0, 2)).toEqual(["light", "memories"]);
    expect(JSON.parse(String(insert?.params[2]))).toEqual([{ id: "m1", text: "ชอบชาเขียว", createdAt: 0 }]);
  });

  it("อ่านความจำและกรองซ้ำ (ข้อมูลในฐานข้อมูลอาจถูกแก้ตรง)", async () => {
    const sql = fakeSql(() => [{ data: [{ id: "m1", text: "ชอบชา" }, { id: "m2", text: "OTP 5555" }] }]);
    const store = createPostgresUserStore({ query: sql.run });
    expect(await store.getMemories("light")).toEqual([{ id: "m1", text: "ชอบชา", createdAt: 0 }]);
  });

  it("ยังไม่มีข้อมูลคืนรายการว่าง", async () => {
    const store = createPostgresUserStore({ query: fakeSql().run });
    expect(await store.getMemories("light")).toEqual([]);
  });

  it("บันทึกและอ่านคำติชม", async () => {
    const now = Date.UTC(2026, 10, 19);
    const sql = fakeSql((text) =>
      text.startsWith("SELECT")
        ? [{ user_name: "light", rating: "down", note: "ยาวไป", reply: "คำตอบ", created_at: new Date(now) }]
        : []
    );
    const store = createPostgresUserStore({ query: sql.run }, () => now);
    await store.addFeedback("light", { rating: "down", note: "ยาวไป 0812345678" });
    expect(sql.calls[0]?.params.slice(0, 3)).toEqual(["light", "down", "ยาวไป [phone]"]);
    const records = await store.listFeedback({ user: null, days: 7, rating: "down" });
    expect(records).toEqual([{ user: "light", rating: "down", note: "ยาวไป", reply: "คำตอบ", createdAt: now }]);
    expect(sql.calls[1]?.params.slice(1)).toEqual([null, "down"]);
  });
});
