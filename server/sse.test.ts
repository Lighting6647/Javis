import { describe, expect, it } from "vitest";
import { parseSseChunk } from "./sse.js";

const line = (event: unknown) => `event: message\ndata: ${JSON.stringify(event)}\n\n`;

describe("parseSseChunk", () => {
  it("แกะเหตุการณ์จากบรรทัดที่ครบแล้วตามลำดับ", () => {
    expect(parseSseChunk(line({ type: "a", n: 1 }) + line({ type: "b", n: 2 }))).toEqual({
      events: [{ type: "a", n: 1 }, { type: "b", n: 2 }],
      rest: ""
    });
  });

  it("เก็บบรรทัดที่ยังมาไม่ครบไว้ต่อกับก้อนถัดไป", () => {
    const full = line({ type: "response.output_text.delta", delta: "สวัสดีครับ" });
    const first = parseSseChunk(full.slice(0, 40));
    expect(first.events).toEqual([]);

    const second = parseSseChunk(first.rest + full.slice(40));
    expect(second).toEqual({
      events: [{ type: "response.output_text.delta", delta: "สวัสดีครับ" }],
      rest: ""
    });
  });

  it("รองรับการขึ้นบรรทัดแบบ CRLF", () => {
    expect(parseSseChunk(`data: {"ok":true}\r\n\r\n`).events).toEqual([{ ok: true }]);
  });

  it("ข้ามบรรทัดที่ไม่ใช่ข้อมูล สัญญาณจบสตรีม และ JSON เสีย", () => {
    const chunk = [": keep-alive", "event: ping", "data: {not json", "data: [DONE]", "data:", ""].join("\n");
    expect(parseSseChunk(chunk)).toEqual({ events: [], rest: "" });
  });
});
