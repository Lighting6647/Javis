import { describe, expect, it } from "vitest";
import { isFindCommand, MAX_PASSAGE_LENGTH, pickPassage, pointToSource, withTextFragment } from "./sourcePointer.js";

/** ตำแหน่งขอบคำของข้อความ ตามตัวตัดคำเดียวกับที่เบราว์เซอร์ใช้จับคู่ข้อความในหน้าเว็บ */
function wordBoundaries(text: string): Set<number> {
  const boundaries = new Set<number>([0, text.length]);
  for (const { index, segment } of new Intl.Segmenter("th", { granularity: "word" }).segment(text)) {
    boundaries.add(index);
    boundaries.add(index + segment.length);
  }
  return boundaries;
}

/** วลีที่เลือกต้องเป็นข้อความต่อเนื่องในเนื้อหา และเริ่มกับจบที่ขอบคำ ไม่เช่นนั้นเบราว์เซอร์จะหาไม่เจอ */
function expectMatchable(passage: string | null, content: string): asserts passage is string {
  expect(passage).not.toBeNull();
  const start = content.indexOf(passage as string);
  expect(start).toBeGreaterThanOrEqual(0);
  const boundaries = wordBoundaries(content);
  expect(boundaries.has(start)).toBe(true);
  expect(boundaries.has(start + (passage as string).length)).toBe(true);
  expect(passage).toBe((passage as string).trim());
  expect((passage as string).length).toBeLessThanOrEqual(MAX_PASSAGE_LENGTH);
}

describe("isFindCommand", () => {
  it.each([
    "ค้นหาร้านกาแฟใกล้ฉัน",
    "ช่วยหาข้อมูลเรื่องภาษีที่ดินหน่อย",
    "หาร้านอาหารญี่ปุ่นแถวสยามให้หน่อย",
    "หาเบอร์โทรโรงพยาบาลศิริราชให้ที",
    "จาวิส หาข่าววันนี้ให้หน่อยครับ",
    "รบกวนหารีวิวรถยนต์ไฟฟ้าให้ด้วยนะคะ",
    "เสิร์ชหารีวิวรถยนต์ไฟฟ้า",
    "สืบค้นประวัติวัดพระแก้ว",
    "search for electric cars",
    "Look up the weather in Bangkok"
  ])("เป็นคำสั่งให้หา: %s", (text) => {
    expect(isFindCommand(text)).toBe(true);
  });

  it.each([
    "ราคาทองวันนี้เท่าไหร่",
    "พรุ่งนี้ฝนจะตกไหม",
    "ใครเป็นนายกรัฐมนตรีไทยตอนนี้",
    "ข่าวเด่นวันนี้มีอะไรบ้าง",
    "หาแฟนยังไงดี",
    "วันนี้ไปหาหมอมา เหนื่อยจัง",
    "หาไม่เจอ ทำยังไงดี",
    "สวัสดี",
    ""
  ])("เป็นคำถามหรือคำพูดทั่วไป: %s", (text) => {
    expect(isFindCommand(text)).toBe(false);
  });
});

describe("withTextFragment", () => {
  it("ต่อคำสั่งให้เบราว์เซอร์เลื่อนไปยังข้อความและไฮไลต์ ท้ายที่อยู่เว็บ", () => {
    expect(withTextFragment("https://example.com/page", "ทองคำแท่ง ขายออก")).toBe(
      `https://example.com/page#:~:text=${encodeURIComponent("ทองคำแท่ง ขายออก")}`
    );
  });

  it("เข้ารหัสอักขระที่มีความหมายพิเศษในคำสั่ง: ขีด จุลภาค และ &", () => {
    // ขีดคั่นคำนำหน้ากับคำตาม จุลภาคคั่นจุดเริ่มกับจุดจบ และ & คั่นคำสั่งหลายชุด ถ้าไม่เข้ารหัส เบราว์เซอร์จะอ่านเป็นอย่างอื่น
    expect(withTextFragment("https://example.com/", "62,350 บาท - ขาย & ซื้อ")).toBe(
      "https://example.com/#:~:text=62%2C350%20%E0%B8%9A%E0%B8%B2%E0%B8%97%20%2D%20%E0%B8%82%E0%B8%B2%E0%B8%A2%20%26%20%E0%B8%8B%E0%B8%B7%E0%B9%89%E0%B8%AD"
    );
  });

  it("ที่อยู่เว็บที่ชี้ไปยังหัวข้อในหน้าอยู่แล้ว: คงหัวข้อเดิมไว้", () => {
    expect(withTextFragment("https://example.com/page#price", "330 metres")).toBe("https://example.com/page#price:~:text=330%20metres");
  });

  it.each([
    ["ไม่มีวลี", "https://example.com/page", "   "],
    ["มีคำสั่งอยู่แล้ว", "https://example.com/page#:~:text=old", "ใหม่"]
  ])("%s: คืนที่อยู่เดิม", (_name, url, passage) => {
    expect(withTextFragment(url, passage)).toBe(url);
  });
});

describe("pickPassage", () => {
  const GOLD = "สมาคมค้าทองคำประกาศราคาทองคำประจำวัน ทองคำแท่ง ขายออก 62,350 บาท รับซื้อ 62,250 บาท ทองรูปพรรณ ขายออก 63,150 บาท รับซื้อ 61,180 บาท";

  it("เลือกช่วงของเนื้อหาที่ตรงกับคำตอบที่สุด", () => {
    const passage = pickPassage("ทองคำแท่งขายออกบาทละ 62,350 บาทครับ", GOLD);

    expectMatchable(passage, GOLD);
    expect(passage).toContain("62,350");
    // ราคาของทองรูปพรรณไม่ใช่สิ่งที่ตอบ
    expect(passage).not.toContain("63,150");
  });

  it("ข้อความไทยที่ยาวติดกันไม่มีวรรค: ตัดที่ขอบคำ ไม่ตัดกลางคำ", () => {
    const content = "ภาษีที่ดินและสิ่งปลูกสร้างจัดเก็บจากมูลค่าของที่ดินและสิ่งปลูกสร้างตามราคาประเมินทุนทรัพย์โดยองค์กรปกครองส่วนท้องถิ่นเป็นผู้จัดเก็บปีละครั้ง";
    const passage = pickPassage("องค์กรปกครองส่วนท้องถิ่นเป็นผู้จัดเก็บภาษีที่ดินครับ", content);

    expectMatchable(passage, content);
    expect(passage).toContain("องค์กรปกครองส่วนท้องถิ่น");
  });

  it("ข้อความภาษาอังกฤษ: ได้วลีเต็มคำ", () => {
    const content = "The Eiffel Tower is a wrought-iron lattice tower in Paris. It is 330 metres (1,083 ft) tall, about the same height as an 81-storey building.";
    const passage = pickPassage("The Eiffel Tower is 330 metres tall.", content);

    expectMatchable(passage, content);
    expect(passage).toContain("330 metres");
  });

  it("ไม่ข้ามตัวคั่นระหว่างท่อนของเนื้อหา เพราะท่อนที่ต่อกันอาจมาจากคนละส่วนของหน้าเว็บ", () => {
    const content = "ราคาทองวันนี้ปรับขึ้น 100 บาท ... อ่านข่าวอื่น | ทองคำแท่งขายออก 62,350 บาท";
    const passage = pickPassage("ทองคำแท่งขายออก 62,350 บาท", content);

    expectMatchable(passage, content);
    expect(passage).toBe("ทองคำแท่งขายออก 62,350 บาท");
  });

  it("เนื้อหาที่ถูกตัดท้ายเพราะยาวเกิน: ไม่ใช้คำสุดท้ายซึ่งอาจถูกตัดกลางคำ", () => {
    const content = `${"ก".repeat(3)} ${"ข้อความนำ ".repeat(68)}ทองคำแท่งขายออก 62,350 บา`.slice(0, 700);
    expect(content).toHaveLength(700);

    const passage = pickPassage("ทองคำแท่งขายออก 62,350 บาท", content);
    if (passage !== null) expect(content.endsWith(passage)).toBe(false);
  });

  it.each([
    ["คำตอบไม่มีอะไรตรงกับเนื้อหา", "วันนี้อากาศดีมากครับ", GOLD],
    ["เนื้อหาว่าง", "ทองคำแท่งขายออก 62,350 บาท", ""],
    ["คำตอบว่าง", "", GOLD]
  ])("%s: ไม่เลือกวลี แทนการชี้ผิดที่", (_name, answer, content) => {
    expect(pickPassage(answer, content)).toBeNull();
  });
});

describe("pointToSource", () => {
  const results = [
    { title: "ราคาทองวันนี้ล่าสุด", url: "https://www.thairath.co.th/money/gold", content: "ราคาทองคำเปิดตลาดปรับขึ้น 100 บาท จากวันก่อนหน้า" },
    { title: "ราคาทองคำวันนี้ | สมาคมค้าทองคำ", url: "https://www.goldtraders.or.th/", content: "ทองคำแท่ง ขายออก 62,350 บาท รับซื้อ 62,250 บาท" }
  ];

  it("เลือกแหล่งที่เนื้อหาตรงกับคำตอบที่สุด ไม่ใช่อันดับแรกเสมอ และชี้ไปยังข้อความที่ตรง", () => {
    const pointer = pointToSource("ทองคำแท่งขายออกบาทละ 62,350 บาทครับ", results);

    expect(pointer?.title).toBe("ราคาทองคำวันนี้ | สมาคมค้าทองคำ");
    expect(pointer?.url.startsWith("https://www.goldtraders.or.th/#:~:text=")).toBe(true);
    expect(decodeURIComponent(pointer?.url ?? "")).toContain("62,350");
  });

  it("ไม่มีแหล่งใดตรงกับคำตอบ: ใช้แหล่งอันดับแรกของผลค้น โดยไม่ชี้ข้อความ", () => {
    expect(pointToSource("ผมค้นแล้วแต่ไม่พบข้อมูลเรื่องนี้ครับ", results)).toEqual({ title: "ราคาทองวันนี้ล่าสุด", url: "https://www.thairath.co.th/money/gold" });
  });

  it("ตรงเท่ากัน: ใช้แหล่งที่อันดับดีกว่า", () => {
    const twins = [
      { title: "หนึ่ง", url: "https://one.example/", content: "ทองคำแท่ง ขายออก 62,350 บาท" },
      { title: "สอง", url: "https://two.example/", content: "ทองคำแท่ง ขายออก 62,350 บาท" }
    ];
    expect(pointToSource("ทองคำแท่งขายออก 62,350 บาท", twins)?.title).toBe("หนึ่ง");
  });

  it("ไม่มีผลค้น: ไม่มีหน้าให้เปิด", () => {
    expect(pointToSource("อะไรก็ได้", [])).toBeNull();
  });
});
