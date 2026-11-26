import type { AudioPlayback, AudioPlayer, PlaybackOutcome } from "./cloudVoice";
import { setOutputAnalyser } from "./outputMeter";

// 44-byte silent 8kHz mono PCM WAV — สร้างเป็น Blob URL เพื่อไม่ให้ชน CSP media-src 'self' blob:
const SILENT_WAV_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
  0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00,
  0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00
]);

const RESUME_TIMEOUT_MS = 1200;

/** ตรวจว่าเสียงยังเดินอยู่ไหมทุกเท่านี้ */
const PROGRESS_CHECK_MS = 250;
/** เสียงหยุดเดินนานเท่านี้ถือว่าถูกขัด (สายเข้า ไมโครโฟนแย่งระบบเสียง หูฟังหลุด) สองช่องทางรวมกันต้องไม่เกิน 3 วินาที */
const STALL_MS = 1200;
/** ตอนเพิ่งสั่งเล่น อุปกรณ์อาจใช้เวลาเปิดลำโพง จึงรอนานกว่าปกติ */
const START_STALL_MS = 2500;
/** เหลือไม่ถึงเท่านี้ (วินาที) ตอนถูกขัด ถือว่าเล่นจบแล้ว */
const TAIL_SECONDS = 0.3;

const pageHidden = (): boolean => typeof document !== "undefined" && document.hidden === true;

/**
 * เฝ้าว่าเสียงเดินต่อ: เบราว์เซอร์มือถือหยุดเสียงกลางคลิปได้โดยไม่แจ้งว่าจบ คำตอบจึงค้างเงียบไปตลอด
 * ระหว่างที่หน้าถูกซ่อน (รับสาย สลับแอป ปิดจอ) ไม่นับเวลา รอให้ผู้ใช้กลับมาก่อนแล้วเล่นต่อ ไม่พูดทับสาย
 * @param position ตำแหน่งที่เล่นถึง คืนค่าเดิมเมื่อเสียงไม่เดิน
 * @param revive ลองให้เสียงกลับมาเดิน เรียกทุกครั้งที่ตรวจพบว่าหยุด
 * @param onStall เสียงหยุดนานเกินกำหนด เรียกครั้งเดียว
 * @param startGraceMs รอให้เสียงเริ่มเดินครั้งแรกได้นานเท่านี้
 * @returns ฟังก์ชันเลิกเฝ้า
 */
function watchProgress(position: () => number, revive: () => void, onStall: () => void, startGraceMs: number): () => void {
  let last = position();
  let moved = false;
  let stalledMs = 0;

  const onVisible = () => {
    if (!pageHidden()) revive();
  };
  const stop = () => {
    clearInterval(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };
  const timer = setInterval(() => {
    const now = position();
    if (now !== last) {
      last = now;
      moved = true;
      stalledMs = 0;
      return;
    }
    if (pageHidden()) {
      stalledMs = 0;
      return;
    }
    revive();
    stalledMs += PROGRESS_CHECK_MS;
    if (stalledMs < (moved ? STALL_MS : startGraceMs)) return;
    stop();
    onStall();
  }, PROGRESS_CHECK_MS);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  return stop;
}

function resumeContextWithTimeout(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === "running") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (running: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(running);
    };
    const timer = setTimeout(() => finish(ctx.state === "running"), RESUME_TIMEOUT_MS);
    void ctx
      .resume()
      .then(() => finish(ctx.state === "running"))
      .catch(() => finish(false));
  });
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/**
 * ตัวเล่นไฟล์เสียงบนเบราว์เซอร์ที่ปลดล็อกเสียงสำหรับ iPhone / iOS Safari ไว้ในจังหวะผู้ใช้แตะหน้าจอ
 * - ใช้ Web AudioContext ที่ปลดล็อกแล้วเป็นหลัก เพื่อเล่นเสียง WAV ต่อเนื่องหลังรอเครือข่ายโดยไม่ติด NotAllowedError
 * - มี HTMLAudioElement ตัวเดียวที่ปลดล็อกไว้สำรองกรณีเบราว์เซอร์ถอดรหัสผ่าน AudioContext ไม่ได้
 */
export function createBrowserAudioPlayer(): AudioPlayer {
  let sharedCtx: AudioContext | null = null;
  let sharedElement: HTMLAudioElement | null = null;

  const ensureContext = (): AudioContext | null => {
    if (sharedCtx && sharedCtx.state !== "closed") return sharedCtx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      sharedCtx = new Ctor();
      return sharedCtx;
    } catch {
      return null;
    }
  };

  const ensureElement = (): HTMLAudioElement | null => {
    if (sharedElement) return sharedElement;
    if (typeof Audio === "undefined") return null;
    const element = new Audio();
    element.setAttribute("playsinline", "");
    element.preload = "auto";
    sharedElement = element;
    return element;
  };

  /** @param offset เริ่มเล่นจากวินาทีที่เท่านี้ ใช้ตอนเล่นต่อจากช่องทางหลักที่ถูกขัด */
  const playWithElement = (audio: Blob, rate: number, offset = 0): AudioPlayback => {
    const element = ensureElement();
    if (!element) {
      return { finished: Promise.resolve("failed"), stop: () => undefined };
    }
    const url = URL.createObjectURL(audio);
    element.onended = null;
    element.onerror = null;
    // รีเซ็ตระดับเสียงเสมอ ป้องกันกรณี unlock() เพิ่งตั้ง volume = 0 ค้างไว้ก่อนเล่นเสียงจริง
    element.muted = false;
    element.volume = 1;
    element.src = url;
    element.playbackRate = rate;
    if (offset > 0) element.currentTime = offset;

    let settled = false;
    let finish!: (outcome: PlaybackOutcome) => void;
    const finished = new Promise<PlaybackOutcome>((resolve) => {
      finish = resolve;
    });

    const settle = (outcome: PlaybackOutcome) => {
      if (settled) return;
      settled = true;
      stopWatching();
      element.onended = null;
      element.onerror = null;
      URL.revokeObjectURL(url);
      finish(outcome);
    };

    const stopWatching = watchProgress(
      () => element.currentTime,
      () => {
        if (element.paused) void element.play().catch(() => undefined);
      },
      () => {
        element.pause();
        settle("failed");
      },
      STALL_MS
    );

    element.onended = () => settle("ended");
    element.onerror = () => settle("failed");

    void element.play().catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
      settle(name === "NotAllowedError" ? "blocked" : "failed");
    });

    return {
      finished,
      stop() {
        element.pause();
        element.removeAttribute("src");
        element.load();
        settle("stopped");
      }
    };
  };

  return {
    unlock(): void {
      const ctx = ensureContext();
      if (ctx) {
        if (ctx.state === "suspended" || (ctx.state as string) === "interrupted") {
          void ctx.resume().catch(() => undefined);
        }
        try {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
        } catch {
          // ข้ามได้หากอุปกรณ์ยังไม่พร้อมเล่น buffer
        }
      }

      const element = ensureElement();
      if (element && element.paused && !element.src) {
        const silentUrl = URL.createObjectURL(new Blob([SILENT_WAV_BYTES], { type: "audio/wav" }));
        element.src = silentUrl;
        element.volume = 0;
        const cleanupSilent = () => {
          if (element.src === silentUrl) {
            element.pause();
            element.volume = 1;
            element.removeAttribute("src");
          }
          URL.revokeObjectURL(silentUrl);
        };
        void element.play().then(cleanupSilent).catch(() => {
          element.volume = 1;
          cleanupSilent();
        });
      }
    },

    play(audio: Blob, rate: number): AudioPlayback {
      const ctx = ensureContext();
      if (!ctx) return playWithElement(audio, rate);

      let settled = false;
      let stopped = false;
      let activeSource: AudioBufferSourceNode | null = null;
      let meter: AnalyserNode | null = null;
      let fallbackPlayback: AudioPlayback | null = null;
      let stopWatching: () => void = () => undefined;
      let finish!: (outcome: PlaybackOutcome) => void;
      const finished = new Promise<PlaybackOutcome>((resolve) => {
        finish = resolve;
      });

      const settle = (outcome: PlaybackOutcome) => {
        if (settled) return;
        settled = true;
        stopWatching();
        if (activeSource) {
          activeSource.onended = null;
          activeSource = null;
        }
        if (meter) {
          setOutputAnalyser(null);
          meter = null;
        }
        finish(outcome);
      };

      /** ช่องทางหลักถูกขัดและกลับมาไม่ได้: เล่นส่วนที่เหลือด้วยตัวเล่นสำรอง ผู้ใช้จึงไม่ต้องฟังซ้ำตั้งแต่ต้น */
      const continueWithElement = async (source: AudioBufferSourceNode, startedAt: number, duration: number) => {
        if (stopped || settled) return;
        stopWatching();
        const offset = (ctx.currentTime - startedAt) * rate;
        // ไม่ให้เสียงเดิมโผล่มาซ้อนเมื่อระบบเสียงกลับมาทีหลัง
        source.onended = null;
        activeSource = null;
        try {
          source.stop();
        } catch {
          // หยุดไปแล้ว
        }
        // บอกว่าเล่นอยู่แต่ไม่เดิน: ระบบเสียงตัวนี้เสียแล้ว รอบถัดไปเปิดตัวใหม่
        if (ctx.state === "running" && sharedCtx === ctx) {
          sharedCtx = null;
          void ctx.close().catch(() => undefined);
        }
        if (duration - offset <= TAIL_SECONDS) {
          settle("ended");
          return;
        }
        fallbackPlayback = playWithElement(audio, rate, offset);
        settle(await fallbackPlayback.finished);
      };

      void (async () => {
        try {
          if (ctx.state === "suspended" || (ctx.state as string) === "interrupted") {
            const running = await resumeContextWithTimeout(ctx);
            if (!running) throw new Error("audio-context-suspended");
          }
          if (stopped || settled) return;
          const raw = await audio.arrayBuffer();
          if (stopped || settled) return;
          const decoded = await ctx.decodeAudioData(raw.slice(0));
          if (stopped || settled) return;

          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.playbackRate.value = rate;
          // ต่อผ่านตัววัดความดัง ให้วงขีดรอบลูกแก้วขยับตามเสียงพูดจริง ถ้าสร้างไม่ได้ก็ต่อตรงเหมือนเดิม
          try {
            meter = ctx.createAnalyser();
            meter.fftSize = 512;
            source.connect(meter);
            meter.connect(ctx.destination);
            setOutputAnalyser(meter);
          } catch {
            meter = null;
            source.connect(ctx.destination);
          }
          activeSource = source;
          source.onended = () => settle("ended");
          source.start(0);

          const startedAt = ctx.currentTime;
          const revive = () => {
            if (stopped || settled || pageHidden() || ctx.state === "running" || ctx.state === "closed") return;
            void ctx.resume().catch(() => undefined);
          };
          const stopProgress = watchProgress(
            () => ctx.currentTime,
            revive,
            () => void continueWithElement(source, startedAt, decoded.duration),
            START_STALL_MS
          );
          ctx.addEventListener("statechange", revive);
          stopWatching = () => {
            stopProgress();
            ctx.removeEventListener("statechange", revive);
          };
        } catch {
          if (stopped || settled) return;
          fallbackPlayback = playWithElement(audio, rate);
          const outcome = await fallbackPlayback.finished;
          settle(outcome);
        }
      })();

      return {
        finished,
        stop() {
          stopped = true;
          if (activeSource) {
            activeSource.onended = null;
            try {
              activeSource.stop();
            } catch {
              // เสียงหยุดไปแล้ว
            }
            activeSource = null;
          }
          fallbackPlayback?.stop();
          settle("stopped");
        }
      };
    }
  };
}
