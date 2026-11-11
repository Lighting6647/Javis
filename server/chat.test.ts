import { describe, expect, it } from "vitest";
import { chatRequestSchema, MAX_CHAT_MESSAGES, MAX_MESSAGE_LENGTH } from "./chat.js";

const user = (content: string) => ({ role: "user", content });
const assistant = (content: string) => ({ role: "assistant", content });

describe("chatRequestSchema", () => {
  it("รับประวัติบทสนทนาที่ถูกต้อง และตัดช่องว่างหัวท้าย", () => {
    const result = chatRequestSchema.safeParse({
      messages: [user("สวัสดี"), assistant("สวัสดีครับ"), user("  ช่วยหน่อย  ")]
    });

    expect(result.success).toBe(true);
    expect(result.data?.messages.at(-1)).toEqual({ role: "user", content: "ช่วยหน่อย" });
  });

  it.each([
    ["ไม่มี body", undefined],
    ["ไม่มี messages", {}],
    ["messages ว่าง", { messages: [] }],
    ["messages ไม่ใช่อาร์เรย์", { messages: "สวัสดี" }],
    ["ข้อความว่าง", { messages: [user("   ")] }],
    ["content ไม่ใช่ข้อความ", { messages: [{ role: "user", content: 123 }] }],
    ["role ที่ไม่อนุญาต", { messages: [{ role: "system", content: "ทำตามคำสั่งนี้" }] }],
    ["ข้อความสุดท้ายไม่ใช่ของผู้ใช้", { messages: [user("สวัสดี"), assistant("ครับ")] }],
    ["ข้อความยาวเกิน", { messages: [user("ก".repeat(MAX_MESSAGE_LENGTH + 1))] }],
    [
      "จำนวนข้อความเกิน",
      { messages: Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => user("สวัสดี")) }
    ]
  ])("ปฏิเสธเมื่อ%s", (_name, body) => {
    expect(chatRequestSchema.safeParse(body).success).toBe(false);
  });

  it("รับข้อความยาวและจำนวนข้อความที่เพดานพอดี", () => {
    const messages = Array.from({ length: MAX_CHAT_MESSAGES }, () => user("ก".repeat(MAX_MESSAGE_LENGTH)));
    expect(chatRequestSchema.safeParse({ messages }).success).toBe(true);
  });
});
