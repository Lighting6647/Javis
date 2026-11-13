// เครื่องมือกลางของชุดตรวจในเบราว์เซอร์จริง: เปิดแอปกับผู้ให้บริการ AI จำลอง เปิดเบราว์เซอร์ และรายงานผล
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

export const PROJECT = path.resolve(import.meta.dirname, "../..");
/** ที่เก็บภาพหน้าจอของการตรวจ ไม่อยู่ใน git */
export const OUTPUT = path.join(PROJECT, "e2e", ".output");
/** ตั้ง TARGET_ORIGIN เพื่อตรวจเว็บที่ปล่อยแล้วแทนแอปในเครื่อง ชุดที่รองรับจะจำลองคำตอบของ AI ที่เบราว์เซอร์ จึงไม่ใช้โควตา AI ของเว็บจริง */
export const LIVE = process.env.TARGET_ORIGIN?.replace(/\/$/, "") || null;

export const INPUT = 'input[aria-label="ข้อความถึง Javis"]';
export const SETTINGS = 'button[aria-label="ตั้งค่า"]';
/** Chrome ใช้ไมโครโฟนจำลอง และถือว่าผู้ใช้อนุญาตไมโครโฟนให้ทุกเว็บแล้ว */
export const MIC_GRANTED = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
/** Chrome ใช้ไมโครโฟนจำลอง แต่ผู้ใช้ยังไม่ได้อนุญาต (สถานะสิทธิ์เป็น "prompt") */
export const MIC_NOT_GRANTED = ["--use-fake-device-for-media-stream"];

/** ตัวแปรของเครื่องนักพัฒนาที่ต้องไม่หลุดเข้าเซิร์ฟเวอร์ทดสอบ: กุญแจจริง และการตั้งค่าที่เปลี่ยนพฤติกรรม */
const DEVELOPER_SETTINGS = /^(ANTHROPIC_|OPENAI_|GEMINI_|TAVILY_|AI_|WEB_SEARCH|WEB_FRAMES|ACCESS_CODES|SESSION_SECRET|DIAGNOSTIC_)/;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** จดผลของแต่ละข้อตรวจ พิมพ์ทีละบรรทัด และจบโปรเซสด้วยรหัสที่บอกว่าผ่านทั้งหมดไหม */
export function createReporter() {
  const results = [];
  return {
    check(name, pass, detail = "") {
      results.push(Boolean(pass));
      console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
    },
    finish() {
      const passed = results.filter(Boolean).length;
      console.log(`\n${passed}/${results.length} passed`);
      process.exit(results.length > 0 && passed === results.length ? 0 : 1);
    }
  };
}

/**
 * เปิดแอป Javis (เซิร์ฟเวอร์จริงกับหน้าเว็บที่ build แล้ว) ต่อกับผู้ให้บริการ AI จำลอง จึงไม่ใช้กุญแจจริงและไม่มีค่าใช้จ่าย
 * เมื่อตั้ง TARGET_ORIGIN จะไม่เปิดอะไร และคืนที่อยู่ของเว็บที่ปล่อยแล้วแทน
 * @param port พอร์ตของเซิร์ฟเวอร์ แต่ละชุดใช้พอร์ตของตัวเอง
 * @param env การตั้งค่าของเซิร์ฟเวอร์ที่ชุดนั้นต้องการเพิ่ม
 */
export async function startApp({ port, env = {} }) {
  if (LIVE) return { origin: LIVE, provider: null, live: true, stop: () => undefined };

  mkdirSync(OUTPUT, { recursive: true });
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !DEVELOPER_SETTINGS.test(name)));
  const providerPort = port + 1000;
  const provider = spawn(process.execPath, [path.join(import.meta.dirname, "mock-provider.mjs")], {
    env: { ...cleanEnv, MOCK_PORT: String(providerPort) },
    stdio: "ignore"
  });
  // รันจากโฟลเดอร์ที่ไม่มี .env.local เซิร์ฟเวอร์จึงไม่โหลดกุญแจจริงของนักพัฒนา ส่วนไฟล์หน้าเว็บ เซิร์ฟเวอร์หาเองจากตำแหน่งของโค้ด (dist)
  const server = spawn(process.execPath, [path.join(PROJECT, "node_modules/tsx/dist/cli.mjs"), path.join(PROJECT, "server/index.ts")], {
    cwd: OUTPUT,
    env: {
      ...cleanEnv,
      PORT: String(port),
      GEMINI_API_KEY: "test-gemini-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${providerPort}`,
      WEB_SEARCH_ENABLED: "true",
      AI_RECHECK_SECONDS: "5",
      ...env
    },
    stdio: "ignore"
  });
  const stop = () => {
    provider.kill();
    server.kill();
  };

  const origin = `http://localhost:${port}`;
  /** ที่อยู่ของผู้ให้บริการ AI จำลอง ใช้ถามว่าแอปส่งคำขออะไรไปบ้าง (/__requests) */
  const providerOrigin = `http://127.0.0.1:${providerPort}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${origin}/health`)).ok) return { origin, provider: providerOrigin, live: false, stop };
    } catch {
      // ยังไม่พร้อม
    }
    await sleep(500);
  }
  stop();
  throw new Error(`แอปทดสอบไม่ขึ้นที่ ${origin} ภายใน 40 วินาที (ต้องรัน npm run build ก่อน)`);
}

/**
 * เปิด Chrome จริงของเครื่อง (หรือ Edge ถ้าไม่มี Chrome) แบบไม่มีหน้าต่าง เลือกเองได้ด้วย E2E_BROWSER=chrome|msedge
 * @param args ตัวเลือกของเบราว์เซอร์ เช่น MIC_GRANTED
 * @param realPopupBlocker ให้ตัวกันป๊อปอัปและการคืนหน้าเดิมตอนกดย้อนกลับทำงานเหมือนเบราว์เซอร์ของผู้ใช้ (เครื่องมือทดสอบปิดสองอย่างนี้ไว้เป็นค่าเริ่มต้น)
 */
export async function launchBrowser({ args = [], realPopupBlocker = false } = {}) {
  const channels = process.env.E2E_BROWSER ? [process.env.E2E_BROWSER] : ["chrome", "msedge"];
  let failure = null;
  for (const channel of channels) {
    try {
      const browser = await chromium.launch({
        channel,
        headless: true,
        args,
        ...(realPopupBlocker ? { ignoreDefaultArgs: ["--disable-popup-blocking", "--disable-back-forward-cache"] } : {})
      });
      console.log(`browser: ${channel} ${browser.version()}`);
      return browser;
    } catch (error) {
      failure = error;
    }
  }
  throw new Error(`เปิดเบราว์เซอร์ไม่ได้ (ลอง ${channels.join(", ")}): ${String(failure?.message ?? failure).split("\n")[0]}`);
}

/**
 * เก็บข้อผิดพลาดและคำเตือนในคอนโซลของหน้า แอปต้องไม่มีเลย
 * @param expected ข้อความที่คาดไว้ในกรณีนั้น (เช่นเบราว์เซอร์รายงานว่ากันหน้าในกรอบไม่ให้พาแท็บไป) ซึ่งจะไม่นับ
 */
export function watchProblems(page, { expected = [] } = {}) {
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (!expected.some((part) => text.includes(part))) problems.push(`${message.type()}: ${text}`);
  });
  return problems;
}

/** คำอธิบายสั้นของปัญหาในคอนโซล สำหรับใส่ท้ายบรรทัดผลตรวจ */
export const describeProblems = (problems) => problems.join(" || ").slice(0, 300);
