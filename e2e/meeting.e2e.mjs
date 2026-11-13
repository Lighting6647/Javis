// ตรวจโหมดสรุปการประชุมทั้งเส้นทางในเบราว์เซอร์จริง: เริ่มจด จดเงียบ ๆ พัก จบและสรุปครั้งเดียว นำบันทึกออก กู้บันทึกที่ค้าง และหลายแท็บ
// รัน: npm run build แล้ว node e2e/meeting.e2e.mjs · ตรวจเว็บที่ปล่อยแล้ว: TARGET_ORIGIN=https://... (จำลองคำตอบของ AI ที่เบราว์เซอร์ ไม่ใช้โควตา)
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createReporter, describeProblems, launchBrowser, MIC_GRANTED, OUTPUT, sleep, startApp, watchProblems } from "./lib/harness.mjs";
import { MEETING_SUMMARY, MEETING_TAG } from "./lib/meeting-fixture.mjs";
import { voiceStub } from "./lib/voice-stub.mjs";

const { check, finish } = createReporter();
const app = await startApp({ port: 8961 });
const browser = await launchBrowser({ args: MIC_GRANTED });

const DRAFT_KEY = "javis.meetingDraft";
const SUGGESTION = "เริ่มโหมดสรุปการประชุม";
const RATE_LIMITED = "ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
const LINES = ["วันนี้คุยเรื่องเปิดตัวสินค้าใหม่", "สมชายรับไปทำใบเสนอราคา ส่งภายในวันศุกร์"];

/** กรณีที่จะรัน เช่น E2E_ONLY=3,4 ถ้าไม่ตั้งจะรันทุกกรณี */
const ONLY = process.env.E2E_ONLY?.split(",").map(Number) ?? null;
const wanted = (number) => !ONLY || ONLY.includes(number);

/**
 * เปิดหน้าต่างเบราว์เซอร์ใหม่ที่ไม่มีข้อมูลค้างจากกรณีอื่น พร้อมตัวจำลองเรื่องเสียง
 * @param stubAi ตอบแทน AI ที่เบราว์เซอร์ คำขอจึงไม่ถึงเซิร์ฟเวอร์ ใช้กับเว็บที่ปล่อยแล้วเสมอ (ไม่ใช้โควตา AI ของเว็บจริง)
 *   และกับกรณีที่ตรวจเฉพาะหน้าตา ซึ่งขอสรุปหลายครั้งจนเกินที่เซิร์ฟเวอร์ยอมในสิบนาที
 */
async function openContext({ viewport = { width: 1280, height: 800 }, theme = null, thaiVoice = false, stubAi = false } = {}) {
  // การให้สิทธิ์รายการหนึ่งทำให้เบราว์เซอร์ปฏิเสธสิทธิ์ที่ไม่อยู่ในรายการ จึงต้องให้ไมโครโฟนไว้ด้วย
  const context = await browser.newContext({ viewport, acceptDownloads: true, permissions: ["microphone", "clipboard-read", "clipboard-write"] });
  await context.addInitScript(voiceStub, { theme, thaiVoice });
  if (app.live || stubAi) {
    await context.route("**/api/chat", (route) => {
      const text = route.request().postDataJSON()?.meeting ? MEETING_SUMMARY : "สวัสดีครับ ผม Javis ยินดีช่วยครับ";
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${JSON.stringify({ type: "delta", text })}\n` });
    });
  }
  return context;
}

/** เปิดหน้า Javis และรอจนฟังตลอดเวลาเริ่มทำงาน (หรือจนหน้าพร้อม เมื่อคาดว่าไม่ได้ฟัง) */
async function openPage(context, { expectListening = true, expected = [] } = {}) {
  const page = await context.newPage();
  const problems = watchProblems(page, { expected });
  const chat = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") chat.push(request.postDataJSON());
  });
  await page.goto(app.origin);
  await page.waitForSelector(".status-pill");
  if (expectListening) await page.waitForFunction(() => window.__voice.listening() && document.querySelector(".stage")?.dataset.phase === "listening");
  return { page, problems, chat };
}

const voice = (page, method, ...args) => page.evaluate(([name, list]) => window.__voice[name](...list), [method, args]);
const pill = (page) => page.locator(".status-pill .status-text").textContent();
const stagePhase = (page) => page.evaluate(() => document.querySelector(".stage")?.dataset.phase ?? null);
const lines = (page) => page.locator(".meeting-lines li:not(.partial) p").allTextContents();
const draft = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), DRAFT_KEY);
const button = (page, name) => page.locator(".meeting").getByRole("button", { name, exact: true });
const recording = (page) => page.waitForFunction(() => document.querySelector(".meeting.recording") && window.__voice.continuous());
const listeningAgain = (page) =>
  page.waitForFunction(() => window.__voice.listening() && !window.__voice.continuous() && document.querySelector(".stage")?.dataset.phase === "listening");
const overflow = (page) =>
  page.evaluate(() => {
    const header = document.querySelector(".app-header");
    const right = Math.max(0, ...[...document.querySelectorAll(".meeting button, .app-header button")].map((node) => node.getBoundingClientRect().right));
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      header: header ? header.scrollWidth - header.clientWidth : 0,
      buttonsPast: Math.round(right - window.innerWidth)
    };
  });
const shot = (page, name) => page.screenshot({ path: path.join(OUTPUT, `meeting-${name}.png`) });

try {
  // ---------- 1. เริ่มด้วยปุ่ม จดเงียบ ๆ พัก จบและสรุป นำบันทึกออก และสั่งด้วยเสียง ----------
  if (wanted(1)) {
    // เครื่องนี้ "มีเสียงพูดภาษาไทย": คำตอบปกติจึงถูกอ่านออกเสียง ซึ่งทำให้พิสูจน์ได้ว่าระหว่างประชุมและคำสรุปไม่ถูกอ่าน
    const context = await openContext({ thaiVoice: true });
    const { page, problems, chat } = await openPage(context);

    check("ทางเข้า: ปุ่มบนแถบบนมีชื่อกำกับ", (await page.locator(".meeting-entry").innerText()).trim() === "ประชุม");
    check("ทางเข้า: หน้าเริ่มต้นมีคำสั่งเริ่มโหมดประชุมให้เลือก", (await page.locator(".suggestions button").allInnerTexts()).some((text) => text.includes(SUGGESTION)));

    const roundsBefore = await voice(page, "rounds");
    await page.locator(".meeting-entry").click();
    await recording(page);
    check("เริ่มจด: แผงการประชุมขึ้นในสถานะกำลังจด", (await page.locator(".meeting-badge").innerText()).trim() === "กำลังจด");
    check("เริ่มจด: แถบบนบอกว่ากำลังจดการประชุม", (await pill(page)) === "กำลังจดการประชุม");
    check("เริ่มจด: แกนกลางอยู่ในจังหวะฟัง", (await stagePhase(page)) === "listening");
    check("เริ่มจด: เปิดระบบฟังแบบจดต่อเนื่องหนึ่งรอบ", (await voice(page, "rounds")) === roundsBefore + 1);
    check(
      "เริ่มจด: ปุ่มไมโครโฟน ตั้งค่า และทางเข้าโหมดประชุมหายไประหว่างประชุม",
      (await page.locator(".mic-toggle, button[aria-label='ตั้งค่า'], .meeting-entry").count()) === 0
    );
    check("เริ่มจด: ไม่มีแถบล่างและช่องพิมพ์", (await page.locator("footer.dock").count()) === 0);
    check("เริ่มจด: บอกว่ากำลังฟังและยังไม่มีคำพูด", (await page.locator(".meeting-empty strong").innerText()).includes("กำลังฟังอยู่"));

    await voice(page, "partial", "วันนี้คุย");
    check("คำที่กำลังได้ยินขึ้นให้เห็นทันที", (await page.locator(".meeting-lines li.partial p").innerText()) === "วันนี้คุย");
    await voice(page, "say", LINES[0]);
    await voice(page, "say", LINES[1]);
    check("จดคำพูดทีละช่วง", JSON.stringify(await lines(page)) === JSON.stringify(LINES), JSON.stringify(await lines(page)));
    check("แต่ละช่วงมีเวลาที่พูด", (await page.locator(".meeting-lines li time").allInnerTexts()).every((text) => /^\d{2}:\d{2}$/.test(text)));
    check("คำที่กำลังได้ยินหายไปเมื่อช่วงนั้นจบ", (await page.locator(".meeting-lines li.partial").count()) === 0);
    check("บอกจำนวนช่วงที่จดได้", (await page.locator(".meeting-count").innerText()) === "จดแล้ว 2 ช่วงคำพูด");

    await voice(page, "say", "เปิดเว็บกรมอุตุนิยมวิทยาให้หน่อย");
    await sleep(600);
    check("คำพูดที่ฟังเหมือนคำสั่ง: ถูกจดเป็นคำพูด ไม่ถูกทำตาม", (await lines(page)).at(-1) === "เปิดเว็บกรมอุตุนิยมวิทยาให้หน่อย");
    check("ระหว่างจดไม่มีคำขอไปหา AI เลย", chat.length === 0, `คำขอ ${chat.length}`);
    check("ระหว่างจด Javis ไม่พูดอะไร", (await page.evaluate(() => window.__tts.calls.length)) === 0);
    check("ระหว่างจดไม่มีข้อความเข้าบทสนทนา", (await page.locator(".thread .message").count()) === 0);

    const clockBefore = await page.locator(".meeting-clock").innerText();
    await sleep(1300);
    check("นาฬิกาการประชุมเดิน", (await page.locator(".meeting-clock").innerText()) !== clockBefore && /^\d{2}:\d{2}$/.test(clockBefore), clockBefore);
    await page.waitForSelector(".arc-bars.live", { timeout: 5000 }).catch(() => null);
    const meter = await page.evaluate(() => ({
      live: window.__mic.tracks.filter((track) => track.readyState === "live").length,
      bars: Boolean(document.querySelector(".arc-bars")?.classList.contains("live"))
    }));
    check("วงคลื่นเสียงขยับตามเสียงไมโครโฟนจริงระหว่างจด", meter.live === 1 && meter.bars, JSON.stringify(meter));
    const saved = await draft(page);
    check("เก็บบันทึกลงเครื่องทุกช่วงที่จด", saved?.entries?.length === 3 && saved.owner === null, JSON.stringify(saved)?.slice(0, 120));

    // ระบบฟังจบรอบเองเมื่อเงียบ และสะดุดชั่วคราว: แอปเปิดฟังใหม่เอง
    const roundsRecording = await voice(page, "rounds");
    await voice(page, "silence");
    await page.waitForFunction((count) => window.__voice.rounds() === count + 1 && window.__voice.continuous(), roundsRecording);
    await voice(page, "say", "ช่วงหลังเงียบ");
    check("ระบบฟังจบรอบเองเมื่อเงียบ: เปิดฟังใหม่เองและจดต่อ", (await lines(page)).at(-1) === "ช่วงหลังเงียบ");
    await voice(page, "fail", "network");
    await page.waitForSelector(".meeting > .toast");
    check("ระบบฟังสะดุด: บอกว่ากำลังลองใหม่และสิ่งที่จดไว้ยังอยู่", (await page.locator(".meeting > .toast").innerText()).includes("กำลังลองใหม่"));
    await page.waitForFunction((count) => window.__voice.rounds() === count + 2 && window.__voice.continuous(), roundsRecording, { timeout: 5000 });
    check("ระบบฟังสะดุด: กลับมาจดเองและข้อความแจ้งหายไป", (await page.locator(".meeting > .toast").count()) === 0 && (await lines(page)).length === 4);

    // พักและจดต่อ
    await button(page, "พัก").click();
    await page.waitForSelector(".meeting.paused");
    const paused = await page.evaluate(() => ({
      listening: window.__voice.listening(),
      live: window.__mic.tracks.filter((track) => track.readyState === "live").length,
      phase: document.querySelector(".stage")?.dataset.phase
    }));
    check("พัก: ปิดระบบฟังและไมโครโฟน", !paused.listening && paused.live === 0, JSON.stringify(paused));
    check("พัก: แถบบนและแกนกลางบอกว่าพักการจด", (await pill(page)) === "พักการจด" && paused.phase === "idle");
    check("พัก: สิ่งที่จดไว้ยังอยู่ครบ", (await lines(page)).length === 4);
    await button(page, "จดต่อ").click();
    await recording(page);
    await voice(page, "say", "กลับมาประชุมต่อ");
    check("จดต่อ: กลับมาฟังและจดต่อจากเดิม", (await lines(page)).length === 5);

    // รายการยาว: เลื่อนตามคำพูดล่าสุด เว้นแต่ผู้ใช้เลื่อนขึ้นไปอ่านเอง
    await page.evaluate(() => {
      for (let index = 1; index <= 40; index += 1) window.__voice.say(`ประเด็นที่ ${index} ของการประชุมวันนี้ ซึ่งยาวพอให้รายการต้องเลื่อน`);
    });
    await sleep(300);
    const atEnd = await page.evaluate(() => {
      const body = document.querySelector(".meeting-body");
      return { gap: Math.round(body.scrollHeight - body.scrollTop - body.clientHeight), scrollable: body.scrollHeight > body.clientHeight };
    });
    check("รายการยาว: เลื่อนตามคำพูดล่าสุด", atEnd.scrollable && atEnd.gap <= 2, JSON.stringify(atEnd));
    await page.evaluate(() => {
      document.querySelector(".meeting-body").scrollTop = 0;
    });
    await sleep(250);
    await voice(page, "say", "คำพูดใหม่ระหว่างที่ผู้ใช้เลื่อนขึ้นไปอ่าน");
    await sleep(250);
    check("ผู้ใช้เลื่อนขึ้นไปอ่าน: ไม่ถูกดึงกลับลงมา", (await page.evaluate(() => document.querySelector(".meeting-body").scrollTop)) <= 2);
    check("พื้นที่หลักไม่ถูกเลื่อนตาม", (await page.evaluate(() => document.querySelector(".app-main").scrollTop + document.documentElement.scrollTop)) === 0);
    await shot(page, "recording-1280");

    // จบและสรุป: คำขอเดียว
    await page.route(
      "**/api/chat",
      async (route) => {
        await sleep(1200);
        await route.fallback();
      },
      { times: 1 }
    );
    const ttsBefore = await page.evaluate(() => window.__tts.calls.length);
    await button(page, "จบและสรุป").click();
    await page.waitForSelector(".meeting.summarizing");
    check("กำลังสรุป: แถบบนและแกนกลางบอกว่ากำลังสรุป", (await pill(page)) === "กำลังสรุปการประชุม" && (await stagePhase(page)) === "thinking");
    check("กำลังสรุป: ปิดระบบฟังแล้ว", !(await voice(page, "listening")));
    check("กำลังสรุป: มีที่รอคำสรุปและปุ่มยกเลิกการสรุป", (await page.locator(".meeting-summary").count()) === 1 && (await button(page, "ยกเลิกการสรุป").count()) === 1);
    await shot(page, "summarizing-1280");
    await page.waitForSelector(".thread .message.assistant .meeting-export", { timeout: 20000 });
    check("สรุปเสร็จ: แผงการประชุมปิด", (await page.locator(".meeting").count()) === 0);
    check("ขอ AI ครั้งเดียวต่อการประชุม", chat.length === 1, `คำขอ ${chat.length}`);
    const sent = chat[0]?.meeting?.transcript?.split("\n") ?? [];
    check("ส่งบันทึกทั้งหมด บรรทัดละช่วง พร้อมเวลา", sent.length === 46 && /^\[\d{2}:\d{2}\] วันนี้คุยเรื่องเปิดตัวสินค้าใหม่$/.test(sent[0] ?? ""), `${sent.length} บรรทัด | ${sent[0]}`);
    check("ส่งความยาวการประชุมเป็นนาที และไม่ส่งประวัติบทสนทนา", Number.isInteger(chat[0]?.meeting?.minutes) && chat[0]?.messages?.length === 1);
    const messages = await page.locator(".thread .message").evaluateAll((nodes) => nodes.map((node) => ({ role: node.classList.contains("user") ? "user" : "assistant", text: node.querySelector("p")?.textContent ?? "" })));
    check("คำสรุปเข้าบทสนทนา พร้อมคำขอของผู้ใช้", messages.length === 2 && /^สรุปการประชุม \(.+\)$/.test(messages[0].text) && messages[1].text === MEETING_SUMMARY, JSON.stringify(messages[0]));
    check("คำสรุปไม่ถูกอ่านออกเสียง", (await page.evaluate(() => window.__tts.calls.length)) === ttsBefore);
    check("บันทึกที่ค้างในเครื่องถูกล้างหลังสรุป", (await draft(page)) === null);
    await listeningAgain(page);
    check("หลังสรุป: กลับไปฟังคำสั่งตามปกติ", (await pill(page)) === "กำลังฟัง");
    check("ตลอดเส้นทาง แถบสั่งงานไม่โผล่มาแวบเดียว", !(await page.evaluate(() => window.__seen.composer())));
    await shot(page, "summary-1280");

    if (app.provider) {
      const asked = (await (await fetch(`${app.provider}/__requests`)).json()).filter((request) => request.lastUser?.includes(MEETING_TAG));
      check("เซิร์ฟเวอร์ถาม AI ครั้งเดียว ด้วยบันทึกทั้งหมด", asked.length === 1 && asked[0].lastUser.includes(sent.at(-1)), `คำขอ ${asked.length}`);
      check("คำขอสรุป: ใช้คำสั่งของการสรุป ไม่ให้เครื่องมือใด และตอบได้ยาว", asked[0]?.tools.length === 0 && asked[0]?.instructions.includes("สรุปการประชุม") && asked[0]?.maxTokens === 4000, JSON.stringify({ tools: asked[0]?.tools, maxTokens: asked[0]?.maxTokens }));
    }

    // นำบันทึกออก
    const exportButton = (name) => page.locator(".thread .meeting-export button", { hasText: name });
    await page.bringToFront();
    // Windows เก็บข้อความในคลิปบอร์ดด้วยการขึ้นบรรทัดแบบ CRLF จึงเทียบโดยไม่สนรูปแบบการขึ้นบรรทัด
    const clipboard = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
    await exportButton("คัดลอกคำสรุป").click();
    await page.waitForSelector(".thread .meeting-export button.done");
    const copiedSummary = await clipboard();
    check("คัดลอกคำสรุป: ได้คำสรุปในคลิปบอร์ด และปุ่มบอกว่าคัดลอกแล้ว", copiedSummary === MEETING_SUMMARY, JSON.stringify(copiedSummary.slice(0, 80)));
    await exportButton("คัดลอกบันทึกคำพูด").click();
    await sleep(200);
    const copiedTranscript = await clipboard();
    check("คัดลอกบันทึกคำพูด: ได้บันทึกทั้งหมดในคลิปบอร์ด", copiedTranscript === chat[0]?.meeting?.transcript, JSON.stringify(copiedTranscript.slice(0, 80)));
    const [download] = await Promise.all([page.waitForEvent("download"), exportButton("ดาวน์โหลดเป็นไฟล์").click()]);
    const file = readFileSync(await download.path());
    const text = file.toString("utf8");
    check("ดาวน์โหลด: ชื่อไฟล์บอกวันและเวลา", /^javis-meeting-\d{8}-\d{4}\.txt$/.test(download.suggestedFilename()), download.suggestedFilename());
    check("ดาวน์โหลด: มีเครื่องหมาย UTF-8 คำสรุป และบันทึกคำพูด", file[0] === 0xef && file[1] === 0xbb && file[2] === 0xbf && text.includes("\r\nคำสรุป\r\n") && text.includes("- สมชายทำใบเสนอราคา กำหนดเสร็จวันศุกร์\r\n") && text.includes(`\r\n${sent[0]}\r\n`));
    await page.waitForFunction(() => !document.querySelector(".thread .meeting-export button.done"), null, { timeout: 5000 });
    check("ปุ่มคัดลอกกลับเป็นปกติเอง", (await exportButton("คัดลอกคำสรุป").count()) === 1);

    // ถามต่อจากคำสรุป
    await voice(page, "say", "งานของสมชายคืออะไร");
    await page.waitForFunction(() => document.querySelectorAll(".thread .message").length === 4 && document.querySelector(".thread article.message:last-of-type p:not(.typing)"));
    const followUp = chat[1];
    check(
      "ถามต่อ: AI เห็นคำสรุปเป็นประวัติ และคำขอนี้ไม่ใช่คำขอสรุป",
      chat.length === 2 && followUp?.meeting === undefined && followUp?.messages?.length === 3 && followUp.messages[1].content.includes("ภาพรวม"),
      JSON.stringify(followUp?.messages?.map((message) => message.role))
    );
    await page.waitForFunction((count) => window.__tts.calls.length > count, ttsBefore, { timeout: 8000 }).catch(() => null);
    check("ถามต่อ: คำตอบปกติถูกอ่านออกเสียง (ตัวตรวจการพูดทำงาน)", (await page.evaluate(() => window.__tts.calls.length)) > ttsBefore);

    // สั่งด้วยเสียง
    await listeningAgain(page);
    const before = { tts: await page.evaluate(() => window.__tts.calls.length), messages: await page.locator(".thread .message").count() };
    await voice(page, "say", "จาวิส เริ่มโหมดประชุม");
    await recording(page);
    await sleep(500);
    check("สั่งด้วยเสียงว่าเริ่มโหมดประชุม: เริ่มจดทันที", (await pill(page)) === "กำลังจดการประชุม");
    check("สั่งด้วยเสียง: ไม่ถาม AI ไม่เพิ่มข้อความ และไม่พูดตอบ", chat.length === 2 && (await page.locator(".thread .message").count()) === before.messages && (await page.evaluate(() => window.__tts.calls.length)) === before.tts);
    await page.evaluate(() => window.__seen.reset());
    await button(page, "ยกเลิก").click();
    await listeningAgain(page);
    check("ยกเลิกตอนยังไม่ได้จดอะไร: ออกทันทีไม่ต้องยืนยัน และกลับไปฟังคำสั่ง", (await page.locator(".meeting").count()) === 0 && (await page.locator(".thread .message").count()) === before.messages);
    check("ออกจากโหมดประชุม: แถบสั่งงานไม่โผล่มาแวบเดียว", !(await page.evaluate(() => window.__seen.composer())));
    check("กรณีที่ 1: คอนโซลไม่มีข้อผิดพลาดหรือคำเตือน", problems.length === 0, describeProblems(problems));
    await context.close();
  }

  // ---------- 2. เริ่มจากคำสั่งที่เลือก ยกเลิกแบบยืนยัน สรุปไม่สำเร็จ และกู้บันทึกหลังโหลดหน้าใหม่ ----------
  if (wanted(2)) {
    const context = await openContext();
    const { page, problems, chat } = await openPage(context, { expected: ["status of 429"] });

    await page.locator(".suggestions button", { hasText: SUGGESTION }).click();
    await recording(page);
    check("เลือกคำสั่งจากหน้าเริ่มต้น: เริ่มจดทันทีโดยไม่ถาม AI", chat.length === 0 && (await page.locator(".thread .message").count()) === 0);

    await voice(page, "say", LINES[0]);
    await voice(page, "say", LINES[1]);
    await button(page, "ยกเลิก").click();
    check("ยกเลิกตอนมีบันทึก: ถามยืนยันก่อน", (await page.locator(".meeting-confirm").innerText()).includes("ทิ้งบันทึกทั้งหมด") && (await lines(page)).length === 2);
    await button(page, "เก็บไว้").click();
    check("เก็บไว้: บันทึกยังอยู่ และยังจดอยู่", (await lines(page)).length === 2 && (await voice(page, "continuous")) && (await button(page, "จบและสรุป").count()) === 1);
    await button(page, "ยกเลิก").click();
    await button(page, "ทิ้งบันทึก").click();
    await listeningAgain(page);
    check("ทิ้งบันทึก: ออกจากโหมด ล้างบันทึกในเครื่อง และไม่มีอะไรเข้าบทสนทนา", (await page.locator(".meeting").count()) === 0 && (await draft(page)) === null && (await page.locator(".thread .message").count()) === 0 && chat.length === 0);

    // สรุปไม่สำเร็จ: บันทึกยังอยู่ และสรุปซ้ำได้
    await page.locator(".meeting-entry").click();
    await recording(page);
    await voice(page, "say", LINES[0]);
    await page.route("**/api/chat", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: RATE_LIMITED }) }), { times: 1 });
    await button(page, "จบและสรุป").click();
    await page.waitForSelector(".meeting.paused .toast.error");
    const failure = await page.locator(".meeting > .toast.error").innerText();
    check("สรุปไม่สำเร็จ: บอกสาเหตุ และบอกว่าบันทึกยังอยู่", failure.includes(RATE_LIMITED) && failure.includes("บันทึกที่จดไว้ยังอยู่ครบ"), failure);
    check("สรุปไม่สำเร็จ: บันทึกยังอยู่บนจอและในเครื่อง", (await lines(page)).length === 1 && (await draft(page))?.entries?.length === 1);
    check("สรุปไม่สำเร็จ: ยังนำบันทึกคำพูดออกได้", (await page.locator(".meeting-foot .meeting-export button").count()) === 2);
    await shot(page, "failed-1280");
    await button(page, "จบและสรุป").click();
    await page.waitForSelector(".thread .message.assistant .meeting-export", { timeout: 20000 });
    check("กดสรุปซ้ำ: ได้คำสรุป", (await page.locator(".thread .message.assistant p").first().textContent()) === MEETING_SUMMARY);
    await listeningAgain(page);

    // หน้าเว็บถูกโหลดใหม่กลางประชุม
    await page.locator(".meeting-entry").click();
    await recording(page);
    await voice(page, "say", LINES[0]);
    await voice(page, "say", LINES[1]);
    await page.reload();
    await page.waitForSelector(".meeting.paused");
    await sleep(1500);
    check("โหลดหน้าใหม่กลางประชุม: บันทึกกลับมาในสภาพพักการจด", JSON.stringify(await lines(page)) === JSON.stringify(LINES) && (await pill(page)) === "พักการจด");
    check("โหลดหน้าใหม่กลางประชุม: บอกผู้ใช้ว่าพบบันทึกค้าง", (await page.locator(".meeting > .toast").innerText()).includes("พบบันทึกการประชุมที่ยังไม่ได้สรุป"));
    check("โหลดหน้าใหม่กลางประชุม: ไม่เริ่มฟังเองจนกว่าผู้ใช้จะเลือก", !(await voice(page, "listening")) && !(await page.evaluate(() => window.__seen.composer())));
    await shot(page, "restored-1280");
    await button(page, "จดต่อ").click();
    await recording(page);
    await voice(page, "say", "ประชุมต่อหลังโหลดหน้าใหม่");
    const requestsBefore = chat.length;
    await button(page, "จบและสรุป").click();
    await page.waitForSelector(".thread .message.assistant .meeting-export", { timeout: 20000 });
    check("บันทึกที่กลับมา: จดต่อและสรุปได้ครบทุกช่วง", chat.length === requestsBefore + 1 && chat.at(-1)?.meeting?.transcript?.split("\n").length === 3);
    check("กรณีที่ 2: คอนโซลไม่มีข้อผิดพลาดหรือคำเตือนอื่น", problems.length === 0, describeProblems(problems));
    await context.close();
  }

  // ---------- 3. หลายแท็บ ----------
  if (wanted(3)) {
    const context = await openContext();
    const first = await openPage(context);
    await first.page.locator(".meeting-entry").click();
    await recording(first.page);
    await voice(first.page, "say", LINES[0]);

    const second = await openPage(context, { expectListening: false });
    await sleep(2500);
    check("แท็บที่สองระหว่างที่แท็บแรกประชุมอยู่: ไม่นำบันทึกของแท็บแรกมาแสดงว่าค้าง", (await second.page.locator(".meeting").count()) === 0);
    check("แท็บที่สอง: ไม่เริ่มฟังเองมาแย่งไมโครโฟน และบอกว่าอีกแท็บฟังอยู่", !(await voice(second.page, "listening")) && (await second.page.locator(".toast").allInnerTexts()).some((text) => text.includes("อีกแท็บหนึ่ง")));
    check("แท็บแรก: ยังจดอยู่ตามเดิม", (await voice(first.page, "continuous")) && (await lines(first.page)).length === 1);

    await second.page.locator(".mic-toggle").click();
    await first.page.waitForSelector(".meeting.paused");
    check("ผู้ใช้เปิดไมโครโฟนที่แท็บที่สองเอง: แท็บแรกพักการจดและบอกเหตุผล", (await first.page.locator(".meeting > .toast").innerText()).includes("ย้ายไปที่นั่น") && (await lines(first.page)).length === 1);
    await second.page.close();
    await button(first.page, "จดต่อ").click();
    await recording(first.page);
    await voice(first.page, "say", LINES[1]);
    check("กลับมาจดต่อที่แท็บแรกได้", (await lines(first.page)).length === 2);

    // แท็บที่ประชุมอยู่ถูกปิด: แท็บที่เปิดใหม่นำบันทึกกลับมา
    await first.page.close();
    const third = await openPage(context, { expectListening: false });
    await third.page.waitForSelector(".meeting.paused");
    check("แท็บที่ประชุมอยู่ถูกปิดกลางคัน: เปิดใหม่แล้วบันทึกกลับมาให้สรุป", JSON.stringify(await lines(third.page)) === JSON.stringify(LINES));
    await button(third.page, "ยกเลิก").click();
    await button(third.page, "ทิ้งบันทึก").click();
    await listeningAgain(third.page);
    const problems = [...first.problems, ...second.problems, ...third.problems];
    check("กรณีที่ 3: คอนโซลไม่มีข้อผิดพลาดหรือคำเตือน", problems.length === 0, describeProblems(problems));
    await context.close();
  }

  // ---------- 5. เซิร์ฟเวอร์ที่บังคับเข้าสู่ระบบ: ออกจากระบบกลางประชุม และบันทึกกลับไปหาเจ้าของเท่านั้น ----------
  if (wanted(5) && !app.live) {
    // รหัสทดสอบสุ่มใหม่ทุกครั้งที่รัน ใช้กับเซิร์ฟเวอร์ทดสอบในเครื่องนี้เท่านั้น
    const codes = { somchai: randomBytes(9).toString("hex"), somying: randomBytes(9).toString("hex") };
    const secured = await startApp({
      port: 8962,
      env: { ACCESS_CODES: `somchai:${codes.somchai},somying:${codes.somying}`, SESSION_SECRET: randomBytes(32).toString("hex") }
    });
    try {
      const context = await openContext();
      const page = await context.newPage();
      const problems = watchProblems(page);
      const signIn = async (name) => {
        await page.getByLabel("รหัสเข้าใช้งาน").fill(codes[name]);
        await page.locator(".panel button[type='submit']").click();
        await page.waitForSelector(".user-chip");
      };
      const signOut = async () => {
        await page.locator(".user-chip button").click();
        await page.getByLabel("รหัสเข้าใช้งาน").waitFor();
      };

      await page.goto(secured.origin);
      await page.getByLabel("รหัสเข้าใช้งาน").waitFor();
      await signIn("somchai");
      await page.waitForFunction(() => window.__voice.listening());
      await page.locator(".meeting-entry").click();
      await recording(page);
      await voice(page, "say", LINES[0]);
      await voice(page, "say", LINES[1]);

      await signOut();
      const after = await page.evaluate(() => ({
        panel: Boolean(document.querySelector(".meeting")),
        listening: window.__voice.listening(),
        live: window.__mic.tracks.filter((track) => track.readyState === "live").length
      }));
      check("ออกจากระบบกลางประชุม: ปิดไมโครโฟน และบันทึกไม่ค้างบนจอ", !after.panel && !after.listening && after.live === 0, JSON.stringify(after));
      const kept = await draft(page);
      check("ออกจากระบบกลางประชุม: บันทึกยังอยู่ในเครื่อง ผูกกับเจ้าของ", kept?.owner === "somchai" && kept?.entries?.length === 2, JSON.stringify(kept)?.slice(0, 100));

      await signIn("somying");
      await page.waitForFunction(() => window.__voice.listening());
      await sleep(1500);
      check("ผู้ใช้อีกคนเข้าสู่ระบบที่เครื่องเดียวกัน: ไม่เห็นบันทึกของคนก่อน และใช้งานได้ตามปกติ", (await page.locator(".meeting").count()) === 0 && (await pill(page)) === "กำลังฟัง");
      check("บันทึกของคนก่อนไม่ถูกลบ", (await draft(page))?.owner === "somchai");

      await signOut();
      await signIn("somchai");
      await page.waitForSelector(".meeting.paused");
      check("เจ้าของกลับมาเข้าสู่ระบบ: บันทึกกลับมาให้สรุปต่อ", JSON.stringify(await lines(page)) === JSON.stringify(LINES));
      await button(page, "ยกเลิก").click();
      await button(page, "ทิ้งบันทึก").click();
      await page.waitForFunction(() => !document.querySelector(".meeting") && window.__voice.listening());
      check("กรณีที่ 5: คอนโซลไม่มีข้อผิดพลาดหรือคำเตือน", problems.length === 0, describeProblems(problems));
      await context.close();
    } finally {
      secured.stop();
    }
  }

  // ---------- 4. จอทุกขนาดและทั้งสองธีม ----------
  for (const theme of wanted(4) ? ["holo", "plain"] : []) {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 }
    ]) {
      const context = await openContext({ viewport, theme, stubAi: true });
      // ธีมเรียบไม่มีแผงสถานะ จึงรอจากระบบฟังอย่างเดียว
      const { page, problems } = await openPage(context, { expectListening: false });
      await page.waitForFunction(() => window.__voice.listening());
      await page.locator(".meeting-entry").click();
      await recording(page);
      await voice(page, "say", "ฝ่ายขายรายงานยอดไตรมาสสามว่าโตขึ้นสิบสองเปอร์เซ็นต์เมื่อเทียบกับปีก่อนและขอเพิ่มงบการตลาดสำหรับไตรมาสสี่");
      await voice(page, "say", "ลิงก์เอกสารอยู่ที่ https://docs.example.com/meetings/2026/q4-budget-review-and-launch-plan-final-version-approved");
      await voice(page, "partial", "ส่วนเรื่องถัดไป");
      const label = `${theme} ${viewport.width}px`;
      const recordingSize = await overflow(page);
      check(`${label} กำลังจด: ไม่ล้นจอแนวนอน และปุ่มอยู่ในจอ`, recordingSize.page <= 0 && recordingSize.header <= 0 && recordingSize.buttonsPast <= 0, JSON.stringify(recordingSize));
      await shot(page, `recording-${theme}-${viewport.width}`);
      await button(page, "ยกเลิก").click();
      const confirmSize = await overflow(page);
      check(`${label} ยืนยันการทิ้ง: ไม่ล้นจอแนวนอน และปุ่มอยู่ในจอ`, confirmSize.page <= 0 && confirmSize.buttonsPast <= 0, JSON.stringify(confirmSize));
      await button(page, "เก็บไว้").click();
      await button(page, "จบและสรุป").click();
      await page.waitForSelector(".thread .message.assistant .meeting-export", { timeout: 20000 });
      const summarySize = await overflow(page);
      check(`${label} คำสรุปในบทสนทนา: ไม่ล้นจอแนวนอน`, summarySize.page <= 0 && summarySize.header <= 0, JSON.stringify(summarySize));
      await shot(page, `summary-${theme}-${viewport.width}`);
      check(`${label}: คอนโซลไม่มีข้อผิดพลาดหรือคำเตือน`, problems.length === 0, describeProblems(problems));
      await context.close();
    }
  }
} catch (error) {
  check("ชุดตรวจเดินจนจบ", false, String(error?.stack ?? error).split("\n").slice(0, 4).join(" | "));
} finally {
  await browser.close();
  app.stop();
}

finish();
