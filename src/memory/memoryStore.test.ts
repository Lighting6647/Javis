import { beforeEach, describe, expect, it } from "vitest";
import { cleanMemoryText, MAX_MEMORIES, MAX_MEMORY_LENGTH, MEMORY_ID_PATTERN, memoryStore, sanitizeMemories } from "./memoryStore";

describe("cleanMemoryText", () => {
  it("ทำให้เป็นบรรทัดเดียว ตัดช่องว่างหัวท้าย และจำกัดความยาว", () => {
    expect(cleanMemoryText("  ผู้ใช้ชื่อไลท์\n\tทำงานด้านไอที  ")).toBe("ผู้ใช้ชื่อไลท์ ทำงานด้านไอที");
    expect(cleanMemoryText("ก".repeat(500))).toHaveLength(MAX_MEMORY_LENGTH);
  });

  it.each([undefined, null, 42, {}, "   ", "\n\n"])("คืนสตริงว่างเมื่อไม่มีข้อความ (%j)", (value) => {
    expect(cleanMemoryText(value)).toBe("");
  });
});

describe("sanitizeMemories", () => {
  it("รับรายการที่ถูกรูปแบบ", () => {
    expect(sanitizeMemories([{ id: "m1", text: " ชอบคำตอบสั้น ", createdAt: 5 }])).toEqual([
      { id: "m1", text: "ชอบคำตอบสั้น", createdAt: 5 }
    ]);
  });

  it("ทิ้งรายการที่เสียหาย รหัสผิดรูป ซ้ำ หรือว่าง", () => {
    const items = sanitizeMemories([
      { id: "m1", text: "เรียกว่าคุณไลท์" },
      { id: "m1", text: "รหัสซ้ำ" },
      { id: "m2", text: "เรียกว่าคุณไลท์" },
      { id: "x9", text: "รหัสผิดรูป" },
      { id: "m3", text: "   " },
      { id: "m4" },
      null,
      "text"
    ]);

    expect(items).toEqual([{ id: "m1", text: "เรียกว่าคุณไลท์", createdAt: 0 }]);
  });

  it("คืนรายการว่างเมื่อข้อมูลไม่ใช่รายการ และเก็บเฉพาะเรื่องล่าสุดเมื่อเกินเพดาน", () => {
    expect(sanitizeMemories("x")).toEqual([]);
    expect(sanitizeMemories(null)).toEqual([]);

    const many = Array.from({ length: MAX_MEMORIES + 5 }, (_, index) => ({ id: `m${index}`, text: `เรื่องที่ ${index}` }));
    const kept = sanitizeMemories(many);
    expect(kept).toHaveLength(MAX_MEMORIES);
    expect(kept.at(-1)?.text).toBe(`เรื่องที่ ${MAX_MEMORIES + 4}`);
  });
});

describe("memoryStore", () => {
  beforeEach(() => memoryStore.clear());

  it("จำเรื่องใหม่ด้วยรหัสที่ถูกรูปแบบ และแจ้งผู้ติดตาม", () => {
    let notified = 0;
    const unsubscribe = memoryStore.subscribe(() => {
      notified += 1;
    });

    const item = memoryStore.add("  ผู้ใช้ชื่อไลท์  ");

    expect(item?.text).toBe("ผู้ใช้ชื่อไลท์");
    expect(item?.id).toMatch(MEMORY_ID_PATTERN);
    expect(memoryStore.get()).toEqual([item]);
    expect(notified).toBe(1);
    unsubscribe();
  });

  it("ไม่จำเรื่องว่างหรือเรื่องที่มีอยู่แล้ว (ไม่สนตัวพิมพ์)", () => {
    memoryStore.add("Likes short answers");

    expect(memoryStore.add("likes SHORT answers")).toBeNull();
    expect(memoryStore.add("   ")).toBeNull();
    expect(memoryStore.get()).toHaveLength(1);
  });

  it("ลืมเรื่องตามรหัส และคืนเรื่องที่ลบ", () => {
    const first = memoryStore.add("เรื่องแรก");
    memoryStore.add("เรื่องที่สอง");

    expect(memoryStore.remove(first?.id ?? "")).toEqual(first);
    expect(memoryStore.remove("m-missing")).toBeNull();
    expect(memoryStore.get().map((item) => item.text)).toEqual(["เรื่องที่สอง"]);
  });

  it("ไม่นำรหัสของเรื่องที่ลบแล้วกลับมาใช้ ปุ่มยกเลิกเก่าจึงไม่ลบเรื่องใหม่", () => {
    const old = memoryStore.add("เรื่องเก่า");
    memoryStore.remove(old?.id ?? "");
    const fresh = memoryStore.add("เรื่องใหม่");

    expect(fresh?.id).not.toBe(old?.id);
    expect(memoryStore.remove(old?.id ?? "")).toBeNull();
    expect(memoryStore.get()).toEqual([fresh]);
  });

  it("เมื่อเต็มเพดาน เรื่องใหม่แทนที่เรื่องเก่าที่สุด", () => {
    for (let index = 0; index < MAX_MEMORIES + 2; index += 1) memoryStore.add(`เรื่องที่ ${index}`);

    const texts = memoryStore.get().map((item) => item.text);
    expect(texts).toHaveLength(MAX_MEMORIES);
    expect(texts[0]).toBe("เรื่องที่ 2");
    expect(new Set(memoryStore.get().map((item) => item.id)).size).toBe(MAX_MEMORIES);
  });

  it("ลบความจำทั้งหมด", () => {
    memoryStore.add("เรื่องหนึ่ง");
    memoryStore.add("เรื่องสอง");
    memoryStore.clear();
    expect(memoryStore.get()).toEqual([]);
  });
});
