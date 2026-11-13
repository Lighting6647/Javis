/**
 * โค้ดที่ใส่เข้าไปในหน้าเว็บก่อนแอปเริ่มทำงาน (ผ่าน addInitScript) เพื่อให้การตรวจควบคุมเรื่องเสียงได้
 * ฟังก์ชันนี้ถูกแปลงเป็นข้อความแล้วรันในหน้าเว็บ จึงต้องไม่อ้างถึงอะไรนอกตัวเอง
 *
 * - ระบบฟัง: ตัวจำลองที่การตรวจสั่งให้ "ได้ยิน" ได้ เพราะระบบฟังจริงของ Chrome ไม่คืนข้อความในการทดสอบอัตโนมัติ
 * - ไมโครโฟน: ของ Chrome จริง (ไมโครโฟนจำลองของ Chrome) และนับว่าแอปเปิดกี่ครั้ง ด้วยตัวเลือกใด และปิดแล้วหรือยัง
 * - การพูด: ของ Chrome จริงแต่ปิดเสียงไว้ เครื่องที่รันการตรวจจึงไม่ส่งเสียง และจดว่าเบราว์เซอร์ยอมให้พูดหรือปฏิเสธ
 *
 * สิ่งที่การตรวจใช้ได้จากหน้าเว็บ: window.__voice (say, partial, silence, fail), window.__mic, window.__tts
 *
 * ตัวเดินขั้นตอน (options.runs): การเรียก page.evaluate หรือการถ่ายภาพหน้าจอทำให้หน้าได้สถานะ "ผู้ใช้แตะแล้ว"
 * ซึ่งทำให้เบราว์เซอร์ยอมให้พูดทันที กรณีที่ต้องพิสูจน์ว่าไม่มีการแตะจึงให้ขั้นตอนเดินเองในหน้าเว็บด้วยตัวจับเวลา
 * แล้วรายงานสภาพของหน้าออกมาทางคอนโซล (บรรทัดที่ขึ้นต้นด้วย "E2E:") โดยไม่มีการเรียกเข้ามาระหว่างทาง
 *
 * @param {{ theme?: string | null, thaiVoice?: boolean, runs?: Array<Array<Record<string, unknown>>> }} options
 *   theme: ธีมที่ตั้งไว้ก่อนเปิดแอป · thaiVoice: ให้เสียงจริงเสียงหนึ่งของเครื่องปรากฏเป็นเสียงไทย เพื่อให้แอปสั่งพูดผ่านเบราว์เซอร์จริง
 *   runs: ขั้นตอนของการโหลดหน้าแต่ละรอบ (รอบแรก รอบหลังโหลดใหม่ ...)
 */
export function voiceStub(options) {
  if (options.theme) localStorage.setItem("javis.theme", options.theme);

  // จดว่าแถบสั่งงานเคยโผล่ขึ้นมาบนจอไหม แม้เพียงแวบเดียวระหว่างเปิดหน้า
  let composerSeen = false;
  new MutationObserver(() => {
    if (document.querySelector(".composer")) composerSeen = true;
  }).observe(document, { childList: true, subtree: true });
  window.__seen = {
    composer: () => composerSeen,
    /** เริ่มจับตาใหม่ สำหรับตรวจช่วงถัดไปของกรณีเดียวกัน */
    reset: () => {
      composerSeen = false;
    }
  };

  const rec = { instances: [], current: null };
  class FakeRecognition {
    constructor() {
      rec.instances.push(this);
      this.ended = false;
      this.started = false;
      /** แอปตั้งเป็น true เมื่อจดคำพูดต่อเนื่อง (โหมดสรุปการประชุม): พูดจบหนึ่งช่วงแล้วการฟังยังไม่จบ */
      this.continuous = false;
      /** ช่วงคำพูดที่จบแล้วของรอบนี้ ซึ่งเบราว์เซอร์จริงส่งซ้ำมาในทุกเหตุการณ์ของรอบเดียวกัน */
      this.finals = [];
    }
    start() {
      // เบราว์เซอร์จริงฟังได้ทีละรอบ: รอบใหม่ทำให้รอบที่ยังค้างอยู่ถูกยกเลิก
      const previous = rec.current;
      if (previous && previous !== this && previous.started && !previous.ended) {
        previous.onerror?.({ error: "aborted" });
        previous.finish();
      }
      this.started = true;
      rec.current = this;
    }
    stop() {
      this.finish();
    }
    abort() {
      this.finish();
    }
    finish() {
      if (this.ended) return;
      this.ended = true;
      this.onend?.();
    }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;

  /** ส่งเหตุการณ์ให้การฟังรอบปัจจุบัน คืน false ถ้าระบบฟังไม่ได้เปิดอยู่ */
  const hear = (deliver) => {
    const current = rec.current;
    if (!current || current.ended) return false;
    deliver(current);
    return true;
  };
  /**
   * เหตุการณ์ผลการฟังแบบที่ Chrome ส่ง: รายการผลของทั้งรอบ โดยช่วงที่จบแล้วอยู่ข้างหน้า
   * และ resultIndex ชี้ผลแรกที่เปลี่ยนในเหตุการณ์นี้
   */
  const resultEvent = (current, text, isFinal) => {
    const results = current.finals.map((transcript) => Object.assign([{ transcript }], { isFinal: true }));
    const resultIndex = results.length;
    results.push(Object.assign([{ transcript: text }], { isFinal }));
    if (isFinal && current.continuous) current.finals.push(text);
    return { resultIndex, results };
  };
  window.__voice = {
    rounds: () => rec.instances.filter((instance) => instance.started).length,
    listening: () => Boolean(rec.current && !rec.current.ended),
    /** การฟังรอบปัจจุบันเป็นแบบจดต่อเนื่องไหม */
    continuous: () => Boolean(rec.current && !rec.current.ended && rec.current.continuous),
    /** ผู้ใช้กำลังพูด: ข้อความที่ได้ยินระหว่างทาง */
    partial: (text) => hear((current) => current.onresult?.(resultEvent(current, text, false))),
    /** ผู้ใช้พูดจบหนึ่งช่วง: การฟังทีละประโยคจบรอบ ส่วนการจดต่อเนื่องฟังต่อ */
    say: (text) =>
      hear((current) => {
        current.onresult?.(resultEvent(current, text, true));
        if (!current.continuous) current.finish();
      }),
    /** ไม่มีใครพูดจนระบบฟังจบเอง */
    silence: () =>
      hear((current) => {
        current.onerror?.({ error: "no-speech" });
        current.finish();
      }),
    /** ระบบฟังล้มเหลวด้วยรหัสของ Web Speech API เช่น "network" */
    fail: (error) =>
      hear((current) => {
        current.onerror?.({ error });
        current.finish();
      })
  };

  const mic = { calls: 0, constraints: [], tracks: [] };
  window.__mic = mic;
  if (navigator.mediaDevices?.getUserMedia) {
    const openMicrophone = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      mic.calls += 1;
      mic.constraints.push(JSON.stringify(constraints));
      const stream = await openMicrophone(constraints);
      mic.tracks.push(...stream.getTracks());
      return stream;
    };
  }

  const tts = { calls: [], started: [], errors: [] };
  window.__tts = tts;
  const speak = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = (utterance) => {
    utterance.volume = 0;
    // ประโยคว่างคือการลองสิทธิ์ของแอปเอง ไม่ใช่คำตอบ จึงไม่จด
    if (utterance.text.trim()) {
      tts.calls.push(utterance.text);
      utterance.addEventListener("start", () => tts.started.push(utterance.text));
      utterance.addEventListener("error", (event) => tts.errors.push(`${event.error}:${utterance.text}`));
    }
    speak(utterance);
  };
  if (options.thaiVoice) {
    const listVoices = speechSynthesis.getVoices.bind(speechSynthesis);
    speechSynthesis.getVoices = () =>
      listVoices()
        .slice(0, 1)
        .map((voice) => ({ name: "Thai test voice", lang: "th-TH", voiceURI: "thai-test", default: true, localService: true, real: voice }));
    const voiceProperty = Object.getOwnPropertyDescriptor(SpeechSynthesisUtterance.prototype, "voice");
    Object.defineProperty(SpeechSynthesisUtterance.prototype, "voice", {
      configurable: true,
      get() {
        return voiceProperty.get.call(this);
      },
      set(value) {
        voiceProperty.set.call(this, value?.real ?? value);
      }
    });
  }

  if (!options.runs) return;

  const runIndex = Number(sessionStorage.getItem("__e2eRun") ?? "0");
  sessionStorage.setItem("__e2eRun", String(runIndex + 1));
  const steps = options.runs[runIndex] ?? [];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (test, timeout = 15000) => {
    const started = performance.now();
    while (!test()) {
      if (performance.now() - started > timeout) return false;
      await sleep(40);
    }
    return true;
  };
  const phase = () => document.querySelector(".stage")?.dataset.phase ?? null;
  const messageCount = () => document.querySelectorAll(".thread .message").length;

  /** รายงานสภาพของหน้าในจังหวะนี้ออกทางคอนโซล */
  const snapshot = (label) => {
    const bars = [...document.querySelectorAll(".arc-bars rect")];
    const header = document.querySelector(".app-header");
    console.debug(
      "E2E:" +
        JSON.stringify({
          label,
          phase: phase(),
          status: document.querySelector(".status-pill")?.textContent ?? null,
          activated: navigator.userActivation.hasBeenActive,
          composer: Boolean(document.querySelector(".composer input")),
          composerSeen,
          orb: Boolean(document.querySelector(".dock .orb")),
          caption: document.querySelector(".dock .caption")?.textContent ?? null,
          footer: Boolean(document.querySelector("footer.dock")),
          heard: document.querySelector(".heard-line")?.textContent ?? null,
          toasts: [...document.querySelectorAll(".toast")].map((node) => node.textContent),
          kicker: document.querySelector(".welcome-kicker")?.textContent ?? null,
          privacy: document.querySelector(".welcome small")?.textContent ?? null,
          messages: [...document.querySelectorAll(".thread .message")].map((node) => node.querySelector("p")?.textContent ?? ""),
          micToggle: document.querySelector(".mic-toggle")?.getAttribute("aria-pressed") ?? null,
          stopButton: Boolean(document.querySelector(".stop-reply")),
          recCount: rec.instances.length,
          recListening: window.__voice.listening(),
          micCalls: mic.calls,
          micStates: mic.tracks.map((track) => track.readyState),
          barsLive: Boolean(document.querySelector(".arc-bars")?.classList.contains("live")),
          tts: { calls: [...tts.calls], started: [...tts.started], errors: [...tts.errors] },
          stored: localStorage.getItem("javis.handsFree"),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          headerOverflow: header ? header.scrollWidth - header.clientWidth : 0,
          barPeak: Math.max(0, ...bars.map((rect) => Number(/scaleY\(([\d.]+)\)/.exec(rect.style.transform)?.[1] ?? "0")))
        })
    );
  };

  const run = async () => {
    for (const step of steps) {
      if (step.waitPhase) {
        if (!(await until(() => phase() === step.waitPhase, step.timeout))) snapshot(`TIMEOUT:phase=${step.waitPhase}`);
      } else if (step.waitMessages) {
        // รอจนคำตอบมาครบและแอปกลับไปยังจังหวะที่คาด (ปกติคือกลับมาฟัง)
        const settled = () => messageCount() >= step.waitMessages && phase() === (step.thenPhase ?? "listening");
        if (!(await until(settled, 20000))) snapshot(`TIMEOUT:messages=${step.waitMessages}`);
      } else if (step.waitActivated) {
        await until(() => navigator.userActivation.hasBeenActive, 30000);
      } else if (step.waitSpoken) {
        // รอให้เบราว์เซอร์เริ่มพูด (หรือปฏิเสธ) ครบจำนวนประโยคก่อนเดินต่อ
        await until(() => tts.started.length + tts.errors.length >= step.waitSpoken, 8000);
      } else if (step.sleep) {
        await sleep(step.sleep);
      } else if (step.partial) {
        if (!window.__voice.partial(step.partial)) snapshot("ERROR:ระบบฟังไม่ได้เปิดอยู่");
      } else if (step.say) {
        if (!window.__voice.say(step.say)) snapshot("ERROR:ระบบฟังไม่ได้เปิดอยู่");
      } else if (step.silence) {
        if (!window.__voice.silence()) snapshot("ERROR:ระบบฟังไม่ได้เปิดอยู่");
      } else if (step.fail) {
        if (!window.__voice.fail(step.fail)) snapshot("ERROR:ระบบฟังไม่ได้เปิดอยู่");
      } else if (step.click) {
        // การคลิกจากโค้ดไม่นับเป็นการแตะของผู้ใช้ จึงใช้สั่งปุ่มได้โดยไม่ทำให้หน้าได้สถานะ "ผู้ใช้แตะแล้ว"
        document.querySelector(step.click)?.click();
      } else if (step.key) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: step.key, bubbles: true }));
      } else if (step.snap) {
        snapshot(step.snap);
      }
    }
    snapshot(`done:${runIndex}`);
  };
  window.addEventListener("load", () => void run());
}

/**
 * รับรายงานที่ตัวเดินขั้นตอนในหน้าเว็บส่งออกมาทางคอนโซล และเก็บปัญหาในคอนโซลของแอปเอง
 * @param page หน้าของ Playwright
 */
export function observeRuns(page) {
  const seen = new Map();
  const waiting = new Map();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (text.startsWith("E2E:")) {
      const entry = JSON.parse(text.slice(4));
      seen.set(entry.label, entry);
      waiting.get(entry.label)?.(entry);
      if (/^(TIMEOUT|ERROR)/.test(entry.label)) problems.push(entry.label);
    } else if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${message.type()}: ${text}`);
    }
  });
  return {
    problems,
    /** รอรายงานที่มีป้ายนี้ */
    wait: (label, timeout = 45000) =>
      seen.has(label)
        ? Promise.resolve(seen.get(label))
        : new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`ไม่ได้รับรายงาน "${label}" ภายใน ${timeout} ms`)), timeout);
            waiting.set(label, (entry) => {
              clearTimeout(timer);
              resolve(entry);
            });
          })
  };
}
