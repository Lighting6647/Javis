import { checkAiAccount, createOnDemandCheck } from "../server/accountMonitor.js";
import { aiAccount } from "../server/aiAccount.js";
import { createApp } from "../server/app.js";
import { authStatus } from "../server/authRoutes.js";
import { config } from "../server/config.js";

/**
 * จุดเริ่มของ Javis บน Vercel: แอป Express ทั้งตัวรันเป็นฟังก์ชันเดียว
 * vercel.json ส่งทุกคำขอ /api/... และ /health มาที่นี่ ส่วนไฟล์หน้าเว็บ Vercel เสิร์ฟจาก dist เอง
 *
 * ต่างจากเซิร์ฟเวอร์แบบรันค้าง (server/index.ts) ตรงที่ไม่มีงานเบื้องหลัง
 * การตรวจบัญชี AI จึงทำตอนที่มีคนถามสถานะ แทนการตั้งเวลา
 */
if (authStatus.misconfigured) console.error(authStatus.misconfiguredLog);
else if (!authStatus.required) console.warn(authStatus.openLog);

const app = createApp({
  beforeStatus: config.aiStartupCheck
    ? createOnDemandCheck({
        // เขียนผลลง log เสมอในการตรวจครั้งแรกของ instance รอบถัดไปเขียนเฉพาะเมื่อสถานะเปลี่ยน
        run: () => checkAiAccount(aiAccount.snapshot().checkedAt === null),
        isHealthy: () => aiAccount.snapshot().status === "ok",
        recheckMs: config.aiRecheckSeconds * 1000
      })
    : undefined
});

export default app;
