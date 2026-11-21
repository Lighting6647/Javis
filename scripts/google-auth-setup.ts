/**
 * สคริปต์ช่วยเชื่อมต่อ Google OAuth 2.0 (Gmail + Google Calendar + Google Tasks)
 * สำหรับบัญชี Lighting6647@gmail.com ครั้งเดียวเพื่อรับ GOOGLE_REFRESH_TOKEN
 *
 * วิธีใช้:
 *   1) ตั้งค่า GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ใน .env.local
 *   2) รัน: npx.cmd tsx scripts/google-auth-setup.ts
 *   3) เปิดลิงก์ที่แสดง อนุญาตบัญชี Lighting6647@gmail.com แล้วคัดลอก URL ทั้งเส้นจากแถบที่อยู่
 *      (หน้า localhost:8787/oauth2callback?code=...) มาวางในหน้าต่างเดิมที่สคริปต์รออยู่ แล้วกด Enter
 *      หรือส่งเป็นอาร์กิวเมนต์ก็ได้: npx.cmd tsx scripts/google-auth-setup.ts --code="<CODE หรือ URL>"
 */
import dotenv from "dotenv";
import path from "node:path";
import { createInterface } from "node:readline/promises";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const REDIRECT_URI = "http://localhost:8787/oauth2callback";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  // ส่งอีเมลที่ผู้ใช้กดยืนยันในการ์ดแล้ว (ส่งได้อย่างเดียว ไม่ลบหรือแก้อีเมลเดิม)
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/tasks"
];

const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
const accountEmail = process.env.GOOGLE_ACCOUNT_EMAIL?.trim() || "Lighting6647@gmail.com";

if (!clientId || !clientSecret) {
  console.error("กรุณาตั้งค่า GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ใน .env.local ก่อนรันสคริปต์นี้");
  process.exit(1);
}

/**
 * อ่านค่า code จากสิ่งที่ผู้ใช้วาง: URL ทั้งเส้นของหน้า oauth2callback หรือค่า code อย่างเดียว
 * รับ URL ได้ทั้งเส้น เพราะการตัดเฉพาะ code ในหน้าต่างคำสั่งของ Windows พลาดง่าย (เครื่องหมาย & ตัดคำสั่ง)
 */
function readAuthCode(input: string): string {
  const text = input.trim().replace(/^["']|["']$/g, "");
  if (/^https?:\/\//i.test(text) && URL.canParse(text)) return new URL(text).searchParams.get("code")?.trim() ?? "";
  const match = /(?:^|[?&])code=([^&\s]+)/.exec(text);
  return decodeURIComponent(match?.[1] ?? text);
}

let codeArg = process.argv.find((arg) => arg.startsWith("--code="))?.slice("--code=".length).trim();

if (!codeArg) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    login_hint: accountEmail,
    scope: SCOPES.join(" ")
  });
  process.stdout.write(`\n1) เปิดลิงก์นี้ในเบราว์เซอร์และเลือกบัญชี ${accountEmail}\n`);
  process.stdout.write(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}\n\n`);
  process.stdout.write("2) หลังกดอนุญาต เบราว์เซอร์จะไปหน้า localhost:8787/oauth2callback?code=... (ขึ้นว่าไม่พบหน้าก็ไม่เป็นไร)\n");
  process.stdout.write("   คัดลอก URL ทั้งเส้นจากแถบที่อยู่ แล้ววางที่นี่ จากนั้นกด Enter\n\n");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const pasted = await prompt.question("วาง URL หรือ code ตรงนี้: ");
  prompt.close();
  codeArg = pasted;
}

codeArg = readAuthCode(codeArg);
if (!codeArg) {
  console.error("ไม่พบค่า code ในข้อความที่วาง กรุณารันใหม่แล้ววาง URL ทั้งเส้นจากหน้า oauth2callback");
  process.exit(1);
}

const body = new URLSearchParams({
  code: codeArg,
  client_id: clientId,
  client_secret: clientSecret,
  redirect_uri: REDIRECT_URI,
  grant_type: "authorization_code"
});

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: body.toString()
});

const data = (await response.json()) as { refresh_token?: string; error?: string; error_description?: string };
if (!response.ok || !data.refresh_token) {
  console.error("แลก Refresh Token ไม่สำเร็จ:", data.error ?? response.status, data.error_description ?? "");
  process.exit(1);
}

process.stdout.write("\nเชื่อมต่อสำเร็จ! เพิ่มบรรทัดด้านล่างลงใน .env.local ของคุณ:\n\n");
process.stdout.write(`GOOGLE_ACCOUNT_EMAIL=${accountEmail}\n`);
process.stdout.write(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}\n\n`);
