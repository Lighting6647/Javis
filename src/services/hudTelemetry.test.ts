import { describe, expect, it } from "vitest";
import { describeAiState, describeCacheUse, describeCloudVoiceState, describeSearchMonth, formatHudDate, formatLatency } from "./hudTelemetry";

describe("formatLatency", () => {
  it.each([
    [null, "ยังไม่มี"],
    [0, "0.0 วิ"],
    [840, "0.8 วิ"],
    [1449, "1.4 วิ"],
    [12_300, "12.3 วิ"],
    [66_300, "66 วิ"],
    [99_949, "100 วิ"]
  ])("%j มิลลิวินาที แสดงเป็น %j", (ms, text) => {
    expect(formatLatency(ms)).toBe(text);
  });

  it("เกินสองนาที: บอกเป็นนาที ไม่ปล่อยให้ตัวเลขยาวจนล้นช่อง", () => {
    expect(formatLatency(125_000)).toBe("2 นาที+");
  });

  it.each([Number.NaN, -5, Number.POSITIVE_INFINITY])("ค่าที่ไม่ใช่เวลา (%j): ถือว่ายังไม่มี", (ms) => {
    expect(formatLatency(ms)).toBe("ยังไม่มี");
  });
});

describe("formatHudDate", () => {
  it("แสดงวัน เดือน และปีพุทธศักราชแบบย่อ ตามเวลาของอุปกรณ์", () => {
    const text = formatHudDate(new Date(2026, 10, 12, 22, 39));

    expect(text).toContain("12");
    expect(text).toContain("พ.ย.");
    expect(text).toContain("2569");
  });
});

describe("describeAiState", () => {
  it.each([
    [null, "กำลังตรวจ", "wait"],
    ["unchecked", "กำลังตรวจ", "wait"],
    ["ok", "ปกติ", "ok"],
    ["unreachable", "ติดต่อไม่ได้", "bad"],
    ["quota", "โควตาเต็ม", "bad"],
    ["auth", "กุญแจใช้ไม่ได้", "bad"],
    ["model", "โมเดลใช้ไม่ได้", "bad"],
    ["unsupported", "ไม่รองรับ", "bad"]
  ] as const)("สถานะ %j แสดงเป็น %j", (state, text, tone) => {
    expect(describeAiState(state)).toEqual({ text, tone });
  });
});

describe("describeCloudVoiceState", () => {
  it("แสดงชื่อเสียง Gemini เมื่อพร้อมใช้งาน", () => {
    expect(describeCloudVoiceState({ mode: "active" }, null)).toEqual({ text: "Gemini", tone: "ok" });
    expect(describeCloudVoiceState({ mode: "active" }, "Zephyr")).toEqual({ text: "Gemini · Zephyr", tone: "ok" });
  });

  it("แสดงสถานะพักชั่วคราวเมื่อโควตาหรือการเชื่อมต่อสะดุด", () => {
    expect(describeCloudVoiceState({ mode: "paused", reason: "quota", until: 1000 }, "Zephyr")).toEqual({
      text: "พักชั่วคราว",
      tone: "wait"
    });
  });

  it("แสดงว่าใช้เสียงในอุปกรณ์เมื่อปิดหรือเซิร์ฟเวอร์ไม่รองรับ", () => {
    expect(describeCloudVoiceState(null, null)).toEqual({ text: "ในอุปกรณ์" });
    expect(describeCloudVoiceState({ mode: "off" }, "Zephyr")).toEqual({ text: "ในอุปกรณ์" });
    expect(describeCloudVoiceState({ mode: "unavailable" }, null)).toEqual({ text: "ในอุปกรณ์" });
  });
});

describe("describeSearchMonth", () => {
  it("ยอดเทียบโควตา: ปกติ ใกล้เต็ม (75%) และเกือบเต็มหรือเต็ม (90%) ใช้สีต่างกัน", () => {
    expect(describeSearchMonth({ used: 123, limit: 1000 })).toEqual({ text: "123 / 1,000", tone: "ok" });
    expect(describeSearchMonth({ used: 750, limit: 1000 })).toEqual({ text: "750 / 1,000", tone: "wait" });
    expect(describeSearchMonth({ used: 900, limit: 1000 })).toEqual({ text: "900 / 1,000", tone: "bad" });
    expect(describeSearchMonth({ used: 1200, limit: 1000 }).tone).toBe("bad");
  });

  it("ไม่รู้เพดาน: แสดงเฉพาะจำนวนครั้ง ไม่รู้ยอด: ยังไม่มี", () => {
    expect(describeSearchMonth({ used: 42, limit: null })).toEqual({ text: "42 ครั้ง" });
    expect(describeSearchMonth(null)).toEqual({ text: "ยังไม่มี" });
  });
});

describe("describeCacheUse", () => {
  it("บอกว่าใช้ผลค้นที่จำไว้กี่ครั้งจากการค้นทั้งหมด พร้อมเปอร์เซ็นต์", () => {
    expect(describeCacheUse({ hits: 5, misses: 15 })).toEqual({ text: "5 จาก 20 (25%)" });
    expect(describeCacheUse({ hits: 0, misses: 3 })).toEqual({ text: "0 จาก 3 (0%)" });
  });

  it("ยังไม่มีการค้น หรือไม่รู้ค่า: ยังไม่มี ไม่หารด้วยศูนย์", () => {
    expect(describeCacheUse({ hits: 0, misses: 0 })).toEqual({ text: "ยังไม่มี" });
    expect(describeCacheUse(null)).toEqual({ text: "ยังไม่มี" });
  });
});
