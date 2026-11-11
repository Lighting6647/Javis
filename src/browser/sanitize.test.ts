import { describe, expect, it } from "vitest";
import { sanitizeFillResult, sanitizePageContext } from "./sanitize";

describe("sanitizePageContext", () => {
  it("รับข้อมูลหน้าเว็บที่ถูกรูปแบบ", () => {
    const context = sanitizePageContext({
      url: "https://clinic.example.com/register",
      title: "  ลงทะเบียนผู้ป่วยใหม่  ",
      fields: [
        { id: "f1", label: " ชื่อ-นามสกุล ", type: "text" },
        { id: "f2", label: "จังหวัด", type: "select", options: ["กรุงเทพมหานคร", "เชียงใหม่", "", 7] }
      ]
    });

    expect(context).toEqual({
      url: "https://clinic.example.com/register",
      title: "ลงทะเบียนผู้ป่วยใหม่",
      fields: [
        { id: "f1", label: "ชื่อ-นามสกุล", type: "text" },
        { id: "f2", label: "จังหวัด", type: "select", options: ["กรุงเทพมหานคร", "เชียงใหม่"] }
      ]
    });
  });

  it.each([
    ["ไม่ใช่ออบเจกต์", "text"],
    ["ที่อยู่ไม่ใช่ http", { url: "file:///C:/secret.html", title: "", fields: [] }],
    ["ไม่มีรายการช่อง", { url: "https://example.com/", title: "" }]
  ])("คืน null เมื่อ%s", (_name, value) => {
    expect(sanitizePageContext(value)).toBeNull();
  });

  it("ทิ้งช่องที่รหัสผิดรูป ซ้ำ ไม่มีชื่อ และตัดส่วนเกิน", () => {
    const context = sanitizePageContext({
      url: "https://example.com/",
      title: "ก".repeat(500),
      fields: [
        { id: "f1", label: "ก".repeat(300), type: "t".repeat(100) },
        { id: "f1", label: "ซ้ำ", type: "text" },
        { id: "'; drop", label: "รหัสแปลก", type: "text" },
        { id: "f2", label: "   ", type: "text" },
        { id: "f3", label: "ไม่มีชนิด" },
        null,
        ...Array.from({ length: 60 }, (_, index) => ({ id: `f${index + 10}`, label: `ช่อง ${index}`, type: "text" }))
      ]
    });

    expect(context?.title).toHaveLength(120);
    expect(context?.fields).toHaveLength(40);
    expect(context?.fields[0]).toEqual({ id: "f1", label: "ก".repeat(80), type: "t".repeat(20) });
    expect(context?.fields[1]).toEqual({ id: "f3", label: "ไม่มีชนิด", type: "text" });
  });
});

describe("sanitizeFillResult", () => {
  const ids = ["f1", "f2", "f3"];

  it("รับผลที่ถูกรูปแบบ", () => {
    expect(sanitizeFillResult({ filled: 2, missing: ["f3"] }, ids)).toEqual({ filled: 2, missing: ["f3"] });
  });

  it("ไม่เชื่อตัวเลขเกินจริงหรือรหัสที่ไม่ได้ขอจากหน้าเว็บ", () => {
    expect(sanitizeFillResult({ filled: 999, missing: ["f9", "f2", 5] }, ids)).toEqual({ filled: 3, missing: ["f2"] });
    expect(sanitizeFillResult({ filled: -4, missing: "x" }, ids)).toEqual({ filled: 0, missing: [] });
  });

  it("รายงานว่าหน้าเปลี่ยนไป และถือว่าไม่ได้กรอกอะไร", () => {
    expect(sanitizeFillResult({ filled: 3, missing: [], failure: "page-changed" }, ids)).toEqual({
      filled: 0,
      missing: ids,
      failure: "page-changed"
    });
  });

  it("ถือว่าใช้งานไม่ได้เมื่อผลไม่ใช่ออบเจกต์", () => {
    expect(sanitizeFillResult(undefined, ids)).toEqual({ filled: 0, missing: ids, failure: "unavailable" });
  });
});
