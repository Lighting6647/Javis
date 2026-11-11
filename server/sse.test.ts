import { describe, expect, it } from "vitest";
import { parseSseChunk } from "./sse.js";

const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

describe("parseSseChunk", () => {
  it("แกะข้อความจากบรรทัดที่ครบแล้วตามลำดับ", () => {
    expect(parseSseChunk(event("สวัสดี") + event("ครับ"))).toEqual({
      deltas: ["สวัสดี", "ครับ"],
      rest: "",
      done: false
    });
  });

  it("เก็บบรรทัดที่ยังมาไม่ครบไว้ต่อกับก้อนถัดไป", () => {
    const full = event("สวัสดีครับ");
    const first = parseSseChunk(full.slice(0, 20));
    expect(first.deltas).toEqual([]);
    expect(first.rest).toBe(full.slice(0, 20));

    const second = parseSseChunk(first.rest + full.slice(20));
    expect(second).toEqual({ deltas: ["สวัสดีครับ"], rest: "", done: false });
  });

  it("หยุดเมื่อพบสัญญาณจบสตรีม", () => {
    expect(parseSseChunk(`${event("จบ")}data: [DONE]\n\n`)).toEqual({
      deltas: ["จบ"],
      rest: "",
      done: true
    });
  });

  it("รองรับการขึ้นบรรทัดแบบ CRLF", () => {
    const line = `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\r\n\r\n`;
    expect(parseSseChunk(line).deltas).toEqual(["ok"]);
  });

  it("ข้ามบรรทัดที่ไม่ใช่ข้อมูล JSON เสีย และเหตุการณ์ที่ไม่มีข้อความ", () => {
    const chunk = [
      ": keep-alive",
      "event: ping",
      "data: {not json",
      `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}`,
      `data: ${JSON.stringify({ choices: [] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 42 } }] })}`,
      ""
    ].join("\n");

    expect(parseSseChunk(chunk)).toEqual({ deltas: [], rest: "", done: false });
  });
});
