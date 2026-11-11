import { describe, expect, it } from "vitest";
import { hostOf, safeHttpUrl, splitLinks, stripLinks } from "./richText";
import { toSpeakable } from "./sentenceChunker";

describe("splitLinks", () => {
  it("แยกลิงก์อ้างอิงออกจากข้อความ", () => {
    expect(splitLinks("ฝนตกครับ ([ข่าวสด](https://news.example.com/a)) พรุ่งนี้แดดออก")).toEqual([
      { type: "text", text: "ฝนตกครับ (" },
      { type: "link", label: "ข่าวสด", url: "https://news.example.com/a" },
      { type: "text", text: ") พรุ่งนี้แดดออก" }
    ]);
  });

  it("คืนข้อความเดิมเมื่อไม่มีลิงก์", () => {
    expect(splitLinks("สวัสดีครับ")).toEqual([{ type: "text", text: "สวัสดีครับ" }]);
    expect(splitLinks("")).toEqual([]);
  });

  it("ไม่แปลงลิงก์ที่ไม่ใช่ http หรือฝังรหัสผ่าน ให้กดได้", () => {
    const text = "[กดตรงนี้](javascript:alert(1)) และ [อีกอัน](https://a:b@example.com/)";
    expect(splitLinks(text)).toEqual([{ type: "text", text }]);
  });
});

describe("stripLinks / toSpeakable", () => {
  it("ตัดลิงก์อ้างอิงในวงเล็บออกทั้งก้อน", () => {
    expect(stripLinks("ฝนตกครับ ([ข่าวสด](https://news.example.com/a))")).toBe("ฝนตกครับ");
  });

  it("เหลือเฉพาะชื่อเมื่อลิงก์อยู่ในประโยค และตัดที่อยู่เว็บเปล่า ๆ ออก", () => {
    expect(toSpeakable("อ่านต่อที่ [กรมอุตุฯ](https://www.tmd.go.th/) หรือ https://example.com/x ครับ")).toBe(
      "อ่านต่อที่ กรมอุตุฯ หรือ ครับ"
    );
  });

  it("ไม่อ่านวงเล็บเปล่าหรือเศษวงเล็บเหลี่ยมที่เหลือจากลิงก์ที่มาไม่ครบ", () => {
    expect(toSpeakable("ราคาทอง () วันนี้ [ทองคำ")).toBe("ราคาทอง วันนี้ ทองคำ");
  });
});

describe("hostOf / safeHttpUrl", () => {
  it("แสดงชื่อเว็บแบบสั้น", () => {
    expect(hostOf("https://www.tmd.go.th/forecast")).toBe("tmd.go.th");
    expect(hostOf("ไม่ใช่ลิงก์")).toBe("ไม่ใช่ลิงก์");
  });

  it("รับเฉพาะ http และ https", () => {
    expect(safeHttpUrl("https://example.com")).toBe("https://example.com/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});
