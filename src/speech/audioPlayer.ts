import type { AudioPlayback, AudioPlayer, PlaybackOutcome } from "./cloudVoice";

const SILENT_WAV_DATA_URI = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

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

  const playWithElement = (audio: Blob, rate: number): AudioPlayback => {
    const element = ensureElement();
    if (!element) {
      return { finished: Promise.resolve("failed"), stop: () => undefined };
    }
    const url = URL.createObjectURL(audio);
    element.onended = null;
    element.onerror = null;
    element.src = url;
    element.playbackRate = rate;

    let settled = false;
    let finish!: (outcome: PlaybackOutcome) => void;
    const finished = new Promise<PlaybackOutcome>((resolve) => {
      finish = resolve;
    });

    const settle = (outcome: PlaybackOutcome) => {
      if (settled) return;
      settled = true;
      element.onended = null;
      element.onerror = null;
      URL.revokeObjectURL(url);
      finish(outcome);
    };

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
      if (element && element.paused && !element.src.startsWith("blob:")) {
        element.src = SILENT_WAV_DATA_URI;
        element.volume = 0;
        void element
          .play()
          .then(() => {
            if (element.src === SILENT_WAV_DATA_URI) {
              element.pause();
              element.volume = 1;
              element.removeAttribute("src");
            }
          })
          .catch(() => {
            element.volume = 1;
          });
      }
    },

    play(audio: Blob, rate: number): AudioPlayback {
      const ctx = ensureContext();
      if (!ctx) return playWithElement(audio, rate);

      let settled = false;
      let stopped = false;
      let activeSource: AudioBufferSourceNode | null = null;
      let fallbackPlayback: AudioPlayback | null = null;
      let finish!: (outcome: PlaybackOutcome) => void;
      const finished = new Promise<PlaybackOutcome>((resolve) => {
        finish = resolve;
      });

      const settle = (outcome: PlaybackOutcome) => {
        if (settled) return;
        settled = true;
        if (activeSource) {
          activeSource.onended = null;
          activeSource = null;
        }
        finish(outcome);
      };

      void (async () => {
        try {
          if (ctx.state === "suspended" || (ctx.state as string) === "interrupted") {
            await ctx.resume();
          }
          const raw = await audio.arrayBuffer();
          if (stopped || settled) return;
          const decoded = await ctx.decodeAudioData(raw.slice(0));
          if (stopped || settled) return;

          const source = ctx.createBufferSource();
          source.buffer = decoded;
          source.playbackRate.value = rate;
          source.connect(ctx.destination);
          activeSource = source;
          source.onended = () => settle("ended");
          source.start(0);
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
