/**
 * สคริปต์ช่วยเชื่อมต่อ Google OAuth 2.0 (Gmail + Google Calendar + Google Tasks)
 * สำหรับบัญชี Lighting6647@gmail.com ครั้งเดียวเพื่อรับ GOOGLE_REFRESH_TOKEN
 *
 * วิธีใช้:
 *   1) ตั้งค่า GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ใน .env.local
 *   2) รัน: npx.cmd tsx scripts/google-auth-setup.ts
 *   3) เปิดลิงก์ที่แสดง, อนุญาตบัญชี Lighting6647@gmail.com แล้วนำ code มาวางต่อท้ายคำสั่ง:
 *      npx.cmd tsx scripts/google-auth-setup.ts --code="<AUTHORIZATION_CODE>"
 */
import dotenv from "dotenv";
import path from "node:path";

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

const codeArg = process.argv.find((arg) => arg.startsWith("--code="))?.slice("--code=".length).trim();

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
  process.stdout.write('2) หลังกดอนุญาต คัดลอกค่า ?code=... จากแถบ URL แล้วรัน:\n');
  process.stdout.write('   npx.cmd tsx scripts/google-auth-setup.ts --code="<CODE_ที่คัดลอกมา>"\n\n');
  process.exit(0);
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
