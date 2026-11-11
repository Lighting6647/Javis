import { describe, expect, it } from "vitest";
import { createSentenceChunker, toSpeakable } from "./sentenceChunker";

function collect(deltas: string[]): string[] {
  const sentences: string[] = [];
  const chunker = createSentenceChunker((sentence) => sentences.push(sentence));
  deltas.forEach((delta) => chunker.push(delta));
  chunker.flush();
  return sentences;
}

describe("toSpeakable", () => {
  it("ลบสัญลักษณ์จัดรูปแบบและช่องว่างซ้ำ", () => {
    expect(toSpeakable("  **สวัสดี**   `ครับ`  ")).toBe("สวัสดี ครับ");
  });

  it("คืนสตริงว่างเมื่อไม่เหลือคำให้อ่าน", () => {
    expect(toSpeakable(" *** --- ")).toBe("");
  });
});

describe("createSentenceChunker", () => {
  it("ส่งประโยคออกทันทีที่เจอจุดจบประโยค แม้ข้อความถูกแบ่งกลางคำ", () => {
    const sentences: string[] = [];
    const chunker = createSentenceChunker((sentence) => sentences.push(sentence));

    chunker.push("Hello wor");
    expect(sentences).toEqual([]);

    chunker.push("ld. How are");
    expect(sentences).toEqual(["Hello world."]);

    chunker.push(" you? I am");
    expect(sentences).toEqual(["Hello world.", "How are you?"]);

    chunker.flush();
    expect(sentences).toEqual(["Hello world.", "How are you?", "I am"]);
  });

  it("ไม่ตัดประโยคที่จุดทศนิยม", () => {
    expect(collect(["ราคา 3.5 บาท"])).toEqual(["ราคา 3.5 บาท"]);
  });

  it("ตัดที่การขึ้นบรรทัดใหม่", () => {
    expect(collect(["สวัสดีครับ\nวันนี้ให้ช่วยอะไรดีครับ"])).toEqual([
      "สวัสดีครับ",
      "วันนี้ให้ช่วยอะไรดีครับ"
    ]);
  });

  it("ตัดข้อความไทยยาวที่ไม่มีจุดจบประโยคตรงช่องว่าง", () => {
    const first = "ก".repeat(50);
    const second = "ข".repeat(40);
    const sentences: string[] = [];
    const chunker = createSentenceChunker((sentence) => sentences.push(sentence));

    chunker.push(`${first} ${second}`);
    expect(sentences).toEqual([first]);

    chunker.flush();
    expect(sentences).toEqual([first, second]);
  });

  it("ตัดส่งข้อความยาวมากที่ไม่มีช่องว่างเลย เพื่อไม่ให้เสียงเงียบนาน", () => {
    const sentences: string[] = [];
    const chunker = createSentenceChunker((sentence) => sentences.push(sentence));

    chunker.push("ก".repeat(230));
    expect(sentences).toEqual(["ก".repeat(230)]);
  });

  it("ไม่ส่งส่วนที่มีแต่สัญลักษณ์", () => {
    expect(collect(["***\n", "- - -\n"])).toEqual([]);
  });
});
