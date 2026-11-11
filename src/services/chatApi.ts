import { ChatError, type StreamChat } from "../conversation/types";
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

/** ส่งประวัติบทสนทนาไปที่ backend และรับคำตอบแบบสตรีมทีละส่วน */
export const streamChatReply: StreamChat = async (messages, { signal, onDelta }) => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionStore.authHeaders() },
      body: JSON.stringify({ messages }),
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
  if (!response.ok) throw new ChatError(await readErrorMessage(response));

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body || !contentType.startsWith("text/plain")) {
    throw new ChatError("เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่รองรับ กรุณาตรวจการตั้งค่าที่อยู่ของ backend");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let reply = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const delta = decoder.decode(value, { stream: true });
      if (!delta) continue;
      reply += delta;
      onDelta(delta);
    }
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new ChatError("การเชื่อมต่อขาดระหว่างรับคำตอบ กรุณาลองใหม่อีกครั้ง");
  }

  return reply;
};
