import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

// ตั้งค่าของเซิร์ฟเวอร์ก่อนโหลดโค้ด ให้ผลไม่ขึ้นกับไฟล์ตั้งค่าของเครื่องที่รันการทดสอบ:
// เปิดให้ใช้โดยไม่ต้องเข้าสู่ระบบ และไม่มีกุญแจของผู้ให้บริการ AI รายใด จึงไม่มีทางที่คำขอจะออกไปข้างนอก
vi.hoisted(() => {
  for (const name of ["ACCESS_CODES", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY"]) process.env[name] = "";
});

/**
 * ขนาดเนื้อหาที่แต่ละเส้นทางรับ: /api/chat รับได้ใหญ่กว่าเส้นทางอื่น เพราะบันทึกการประชุมยาวกว่าข้อความสนทนามาก
 * คำขอในชุดนี้ตั้งใจให้ผิดรูป จึงถูกปฏิเสธก่อนถึงผู้ให้บริการ AI เสมอ ไม่มีคำขอใดออกไปข้างนอก
 */
describe("ขนาดเนื้อหาของคำขอ", () => {
  let origin = "";
  let close: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterAll(() => close());

  /** ส่งคำขอที่ผิดรูปแต่มีขนาดตามที่กำหนด */
  const post = (path: string, kilobytes: number) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [], padding: "x".repeat(kilobytes * 1024) })
    });

  it("/api/chat รับเนื้อหาขนาดเท่าบันทึกการประชุมยาว ๆ ได้ (ไม่ถูกตัดเพราะขนาด)", async () => {
    const response = await post("/api/chat", 300);

    expect(response.status).not.toBe(413);
    // ผ่านด่านขนาดแล้วจึงถูกปฏิเสธด้วยเหตุอื่น: ยังไม่เข้าสู่ระบบ ยังไม่ตั้งกุญแจ หรือเนื้อหาผิดรูป
    expect([400, 401, 503]).toContain(response.status);
  });

  it("/api/chat ยังมีเพดาน: เนื้อหาที่ใหญ่เกินบันทึกการประชุมที่ยาวที่สุดถูกปฏิเสธ", async () => {
    expect((await post("/api/chat", 700)).status).toBe(413);
  });

  it("เส้นทางอื่นยังรับได้เท่าเดิม: เนื้อหา 300 กิโลไบต์ถูกปฏิเสธ", async () => {
    expect((await post("/api/auth/login", 300)).status).toBe(413);
  });

  it("เส้นทางอื่นรับเนื้อหาขนาดปกติได้", async () => {
    expect((await post("/api/auth/login", 1)).status).not.toBe(413);
  });
});
