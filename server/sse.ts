export interface SseParseResult {
  /** ข้อความคำตอบที่แกะได้จากบรรทัดที่ครบแล้ว เรียงตามลำดับ */
  deltas: string[];
  /** ส่วนท้ายที่ยังไม่ครบบรรทัด ต้องนำไปต่อกับข้อมูลก้อนถัดไป */
  rest: string;
  /** พบสัญญาณจบสตรีม `[DONE]` แล้ว */
  done: boolean;
}

function readDelta(payload: string): string {
  try {
    const event = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: unknown } }>;
    };
    const content = event.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}

/** แกะข้อความคำตอบออกจากสตรีม SSE ของ Chat Completions */
export function parseSseChunk(buffer: string): SseParseResult {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const deltas: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;

    const payload = line.slice("data:".length).trim();
    if (payload === "[DONE]") return { deltas, rest: "", done: true };

    const delta = readDelta(payload);
    if (delta) deltas.push(delta);
  }

  return { deltas, rest, done: false };
}
