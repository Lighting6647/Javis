import { ChatError, type StreamChat } from "../conversation/types";
import { meetingHistoryStore } from "../meeting/meetingHistory";
import { aiStatusStore } from "./aiStatusStore";
import { parseChatEventLine } from "./chatEvents";
import { API_BASE } from "./http";
import { sessionStore } from "./sessionStore";

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error) return payload.error;
  } catch {
    // เซิร์ฟเวอร์ไม่ได้ตอบเป็น JSON ใช้ข้อความกลางแทน
  }
  return "ขอคำตอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

/** ส่งประวัติบทสนทนาไปที่ backend และรับคำตอบแบบสตรีมทีละเหตุการณ์ */
export const streamChatReply: StreamChat = async (messages, { signal, onEvent, page, screen, image, memories, frames, meeting, identity }) => {
  const savedMeetings = meeting
    ? []
    : meetingHistoryStore
        .get()
        .slice(0, 10)
        .map((item) => ({
          id: item.id,
          startedAt: item.startedAt,
          minutes: item.minutes,
          summary: item.summary.slice(0, 1500),
          transcript: item.transcript.slice(0, 2500)
        }));

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
      body: JSON.stringify({
        messages,
        ...(page ? { page } : {}),
        ...(screen ? { screen } : {}),
        ...(image ? { image } : {}),
        ...(memories && memories.length > 0 ? { memories } : {}),
        ...(frames ? { frames: true } : {}),
        ...(meeting ? { meeting } : {}),
        ...(identity ? { identity } : {}),
        ...(savedMeetings.length > 0 ? { meetingHistory: savedMeetings } : {})
      }),
      signal
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new ChatError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่");
  }

  if (response.status === 401) {
    // โทเค็นหมดอายุหรือถูกเพิกถอน: ล้างทิ้งเพื่อให้หน้าเข้าสู่ระบบกลับมา
    sessionStore.clear();
    throw new ChatError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
  }
  if (!response.ok) {
    // อาจเป็นปัญหาของบัญชี AI: ให้แถบแจ้งเตือนอัปเดตทันที
    aiStatusStore.noteRequest(false);
    throw new ChatError(await readErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body || !contentType.startsWith("application/x-ndjson")) {
    throw new ChatError("เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่รองรับ กรุณาตรวจการตั้งค่าที่อยู่ของ backend");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";

  const handleLine = (line: string) => {
    const event = parseChatEventLine(line);
    if (!event) return;
    if (event.type === "delta") reply += event.text;
    onEvent(event);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = (buffer + decoder.decode(value, { stream: true })).split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    }
    handleLine(buffer);
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new ChatError("การเชื่อมต่อขาดระหว่างรับคำตอบ กรุณาลองใหม่อีกครั้ง");
  }

  aiStatusStore.noteRequest(true);
  return reply;
};
