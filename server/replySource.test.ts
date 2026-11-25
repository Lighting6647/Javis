import { describe, expect, it } from "vitest";
import { createChatCompletionsTranslator } from "./chatCompletions.js";
import { startHttpReply } from "./replySource.js";

const TEXT = 'data: {"choices":[{"delta":{"content":"สวัสดี"},"index":0}]}\n\n';
const TRAILING_ERROR = '[{\n  "error": {\n    "code": 503,\n    "message": "high demand",\n    "status": "UNAVAILABLE"\n  }\n}\n]';

async function readAll(body: string, chunkSize = 7): Promise<unknown[]> {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += chunkSize) controller.enqueue(bytes.slice(at, at + chunkSize));
      controller.close();
    }
  });
  const reply = await startHttpReply({
    url: "https://example.com",
    headers: {},
    body: {},
    signal: new AbortController().signal,
    translator: createChatCompletionsTranslator(),
    fetchImpl: async () => new Response(stream, { status: 200 })
  });
  if (!reply.ok) throw new Error("rejected");
  const events: unknown[] = [];
  await reply.events.read((event) => {
    events.push(event);
    return false;
  });
  return events;
}

describe("ข้อผิดพลาดดิบที่ต่อท้ายสตรีม", () => {
  it("แจ้งว่าล้มเหลว ไม่นับว่าคำตอบจบปกติ", async () => {
    const events = await readAll(TEXT + TRAILING_ERROR);
    expect(events[0]).toMatchObject({ type: "response.output_text.delta", delta: "สวัสดี" });
    expect(events[1]).toMatchObject({ type: "error", error: { status: "UNAVAILABLE" } });
    expect(events).toHaveLength(2);
  });

  it("สตรีมปกติที่จบโดยไม่บอกเหตุผลยังปิดท้ายให้เหมือนเดิม", async () => {
    const events = await readAll(TEXT);
    expect(events.at(-1)).toMatchObject({ type: "response.completed" });
  });

  it("ข้อความของคำตอบที่หน้าตาเหมือน JSON ไม่ถูกเข้าใจผิด", async () => {
    const events = await readAll('data: {"choices":[{"delta":{"content":"[{\\"error\\":1}]"},"index":0}]}\n\n');
    expect(events.some((event) => (event as { type?: string }).type === "error")).toBe(false);
  });
});
