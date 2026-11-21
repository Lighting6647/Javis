/**
 * เสียงเอฟเฟกต์ (SFX) ฝั่ง UI ด้วย Web Audio API — ไม่ต้องโหลดไฟล์เพิ่ม และไม่ทำงานถ้าผู้ใช้ปิดเสียง
 */
let audioCtx: AudioContext | null = null;
let sfxMuted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined" || sfxMuted) return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => undefined);
  }
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", gainPeak = 0.08, delay = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  } catch {
    // ข้ามถ้าเบราว์เซอร์ยังไม่ปลดล็อกเสียง
  }
}

export const sfx = {
  setMuted(muted: boolean) {
    sfxMuted = muted;
  },
  isMuted(): boolean {
    return sfxMuted;
  },
  click() {
    playTone(880, 0.06, "triangle", 0.045);
  },
  wake() {
    playTone(523.25, 0.09, "sine", 0.07, 0);
    playTone(783.99, 0.14, "sine", 0.08, 0.08);
  },
  listenStart() {
    playTone(659.25, 0.08, "sine", 0.06, 0);
    playTone(987.77, 0.12, "sine", 0.06, 0.07);
  },
  done() {
    playTone(698.46, 0.1, "sine", 0.05, 0);
    playTone(1046.5, 0.14, "sine", 0.06, 0.07);
  },
  effect() {
    playTone(440, 0.12, "sawtooth", 0.035, 0);
    playTone(880, 0.16, "sine", 0.05, 0.05);
  }
};

/** มีไฟล์เพลงตอนเปิดระบบในเครื่องนี้ไหม ไฟล์อยู่นอก git จึงอาจไม่มี (ดู vite.config.ts) */
const bootMusicAvailable = typeof __BOOT_MUSIC__ !== "undefined" && __BOOT_MUSIC__;

/** เปิดเพลงตอนเปิดระบบ ถ้าไม่มีไฟล์ ไม่ทำอะไรเลยและไม่ขอไฟล์ จึงไม่มีข้อผิดพลาดในคอนโซล */
export function playBootMusic(): () => void {
  if (typeof window === "undefined" || sfxMuted || !bootMusicAvailable) return () => undefined;
  const audio = new Audio("/audio/boot-music.mp3");
  audio.volume = 0.42;
  audio.addEventListener("error", () => undefined);
  void audio.play().catch(() => undefined);
  return () => {
    audio.pause();
    audio.currentTime = 0;
  };
}
