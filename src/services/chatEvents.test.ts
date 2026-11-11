import { describe, expect, it } from "vitest";
import { parseChatEventLine } from "./chatEvents";

const line = (value: unknown) => JSON.stringify(value);

describe("parseChatEventLine", () => {
  it("รับเหตุการณ์ทุกชนิดที่ backend ส่ง", () => {
    expect(parseChatEventLine(line({ type: "delta", text: "สวัสดี" }))).toEqual({ type: "delta", text: "สวัสดี" });
    expect(parseChatEventLine(line({ type: "status", status: "searching" }))).toEqual({
      type: "status",
      status: "searching"
    });
    expect(
      parseChatEventLine(line({ type: "sources", sources: [{ title: "ข่าว", url: "https://news.example.com/a" }] }))
    ).toEqual({ type: "sources", sources: [{ title: "ข่าว", url: "https://news.example.com/a" }] });
    expect(
      parseChatEventLine(line({ type: "open", url: "https://example.com/", title: "ตัวอย่าง", auto: true }))
    ).toEqual({ type: "open", url: "https://example.com/", title: "ตัวอย่าง", auto: true });
  });

  it.each([
    ["บรรทัดว่าง", "   "],
    ["JSON เสีย", "{not json"],
    ["ไม่ใช่ออบเจกต์", "[1,2]"],
    ["ชนิดที่ไม่รู้จัก", line({ type: "run_script", code: "alert(1)" })],
    ["delta ไม่มีข้อความ", line({ type: "delta", text: "" })],
    ["สถานะที่ไม่รู้จัก", line({ type: "status", status: "hacking" })],
    ["เปิดลิงก์ javascript", line({ type: "open", url: "javascript:alert(1)", title: "x", auto: true })],
    ["แหล่งที่มาไม่ใช่รายการ", line({ type: "sources", sources: "x" })],
    ["แหล่งที่มาไม่มีลิงก์ที่ใช้ได้", line({ type: "sources", sources: [{ url: "file:///etc/passwd" }, null] })]
  ])("คืน null เมื่อ%s", (_name, raw) => {
    expect(parseChatEventLine(raw)).toBeNull();
  });

  it("รับรายการเสนอกรอกฟอร์ม และทิ้งรายการที่ผิดรูป ซ้ำ หรือยาวเกิน", () => {
    const event = parseChatEventLine(
      line({
        type: "fill",
        fields: [
          { id: "f1", label: "ชื่อ-นามสกุล", value: "สมชาย ใจดี" },
          { id: "f1", label: "ซ้ำ", value: "อีกค่า" },
          { id: "name", label: "รหัสผิดรูป", value: "x" },
          { id: "f2", label: "ว่าง", value: "" },
          { id: "f3", label: "ยาวเกิน", value: "ก".repeat(501) },
          { id: "f4", value: "ไม่มีชื่อช่อง" },
          null
        ]
      })
    );

    expect(event).toEqual({
      type: "fill",
      fields: [
        { id: "f1", label: "ชื่อ-นามสกุล", value: "สมชาย ใจดี" },
        { id: "f4", label: "f4", value: "ไม่มีชื่อช่อง" }
      ]
    });
  });

  it("คืน null เมื่อรายการเสนอกรอกไม่เหลือช่องที่ใช้ได้", () => {
    expect(parseChatEventLine(line({ type: "fill", fields: [{ id: "x", value: "y" }] }))).toBeNull();
    expect(parseChatEventLine(line({ type: "fill", fields: "ทั้งหมด" }))).toBeNull();
  });

  it("รับเหตุการณ์ความจำ และทิ้งรายการที่ผิดรูป", () => {
    const event = parseChatEventLine(
      line({ type: "memory", added: ["  ผู้ใช้ชื่อไลท์\n", "", 42, "ชอบคำตอบสั้น"], removed: ["m1", "x1", 7, "mlq1x2ab3"] })
    );

    expect(event).toEqual({
      type: "memory",
      added: ["ผู้ใช้ชื่อไลท์", "ชอบคำตอบสั้น"],
      removed: ["m1", "mlq1x2ab3"]
    });
  });

  it("คืน null เมื่อเหตุการณ์ความจำไม่มีอะไรให้ทำ", () => {
    expect(parseChatEventLine(line({ type: "memory", added: [], removed: [] }))).toBeNull();
    expect(parseChatEventLine(line({ type: "memory", added: "ทั้งหมด", removed: ["bad id"] }))).toBeNull();
  });

  it("เปิดอัตโนมัติเฉพาะเมื่อ auto เป็น true จริง ๆ", () => {
    const event = parseChatEventLine(line({ type: "open", url: "https://example.com/", auto: "yes" }));
    expect(event).toEqual({ type: "open", url: "https://example.com/", title: "https://example.com/", auto: false });
  });

  it("กรองแหล่งที่มาที่ไม่ปลอดภัยออก และจำกัดจำนวน", () => {
    const sources = [
      { title: "ร้าย", url: "javascript:alert(1)" },
      ...Array.from({ length: 9 }, (_, index) => ({ title: `เว็บ ${index}`, url: `https://s${index}.example.com/` }))
    ];
    const event = parseChatEventLine(line({ type: "sources", sources }));

    expect(event?.type === "sources" && event.sources).toHaveLength(6);
    expect(JSON.stringify(event)).not.toContain("javascript");
  });
});
