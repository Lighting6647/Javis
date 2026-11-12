import { describe, expect, it } from "vitest";
import { describeAiState, formatHudDate, formatLatency } from "./hudTelemetry";

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
