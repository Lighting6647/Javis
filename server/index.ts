import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAiAccount } from "./accountMonitor.js";
import { aiAccount } from "./aiAccount.js";
import { geminiKeyHint } from "./aiProvider.js";
import { createApp } from "./app.js";
import { authStatus } from "./authRoutes.js";
import { config } from "./config.js";

/**
 * จุดเริ่มของเซิร์ฟเวอร์แบบรันค้าง (เครื่องพัฒนา Docker และโฮสต์ที่รัน container)
 * เสิร์ฟหน้าเว็บที่ build แล้วเอง และตรวจบัญชี AI เบื้องหลังเป็นระยะ
 * โฮสต์แบบฟังก์ชัน (Vercel) ใช้ api/index.ts แทน
 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = createApp({ staticDir: path.join(rootDir, "dist") });

function reportAiCheckError(error: unknown): void {
  console.warn("ตรวจบัญชี AI ไม่สำเร็จ", error instanceof Error ? error.message : "unknown");
}

const onListening = () => {
  console.log(`Javis server listening on http://localhost:${config.port}`);
  console.log(`ผู้ให้บริการ AI: ${config.ai.label} (${config.ai.chatModel})`);
  const keyHint = geminiKeyHint(process.env);
  if (keyHint) console.warn(keyHint);
  if (authStatus.misconfigured) {
    console.error(authStatus.misconfiguredLog);
  } else if (!authStatus.required) {
    console.warn(authStatus.openLog);
  }

  if (config.aiStartupCheck) {
    // ตรวจหลังเปิดรับคำขอแล้ว เพื่อให้ผู้ดูแลรู้ปัญหาก่อนผู้ใช้เจอ โดยไม่หน่วงการเริ่มและไม่ทำให้เซิร์ฟเวอร์ล้ม
    checkAiAccount(true).catch(reportAiCheckError);

    // ระหว่างที่ยังมีปัญหา ตรวจซ้ำเป็นระยะ เพื่อให้สถานะกลับมาปกติเองหลังผู้ดูแลแก้ไข
    // ตรวจเฉพาะตอนที่ยังไม่ปกติ จึงไม่มีค่าใช้จ่ายระหว่างใช้งานตามปกติ
    const recheck = setInterval(() => {
      if (aiAccount.snapshot().status !== "ok") checkAiAccount(false).catch(reportAiCheckError);
    }, config.aiRecheckSeconds * 1000);
    // ไม่ให้ตัวจับเวลานี้ค้างกระบวนการไว้ตอนปิดเซิร์ฟเวอร์
    recheck.unref();
  }
};

const listenHost = process.env.HOST?.trim();
if (listenHost) {
  app.listen(config.port, listenHost, onListening);
} else {
  app.listen(config.port, onListening);
}
