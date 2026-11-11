export interface SseParseResult {
  /** เหตุการณ์ JSON ที่แกะได้จากบรรทัดที่ครบแล้ว เรียงตามลำดับ */
  events: unknown[];
  /** ส่วนท้ายที่ยังไม่ครบบรรทัด ต้องนำไปต่อกับข้อมูลก้อนถัดไป */
  rest: string;
}

/** แกะเหตุการณ์ JSON ออกจากสตรีม SSE บรรทัดที่ไม่ใช่ข้อมูลหรือไม่ใช่ JSON จะถูกข้าม */
export function parseSseChunk(buffer: string): SseParseResult {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  const events: unknown[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;

    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") continue;

    try {
      events.push(JSON.parse(payload));
    } catch {
      // บรรทัดเสียหาย: ข้ามไป ไม่ให้ทั้งคำตอบล้ม
    }
  }

  return { events, rest };
}
