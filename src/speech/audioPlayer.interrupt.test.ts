import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserAudioPlayer } from "./audioPlayer";

/** ระบบเสียงจำลอง: นาฬิกาเดินเฉพาะตอน running และแหล่งเสียงจบเมื่อเล่นครบความยาว เหมือนเบราว์เซอร์จริง */
class FakeAudioContext {
  static current: FakeAudioContext;
  static created = 0;
  state: AudioContextState | "interrupted" = "running";
  currentTime = 0;
  destination = {};
  /** ระบบปฏิบัติการยอมให้กลับมาเล่นต่อไหม */
  resumable = true;
  /** สถานะบอกว่าเล่นอยู่ แต่นาฬิกาไม่เดิน */
  frozen = false;
  duration = 2;
  source: { onended: (() => void) | null; stop: ReturnType<typeof vi.fn>; stopped: boolean } | null = null;
  private listeners = new Set<() => void>();
  private played = 0;

  constructor() {
    FakeAudioContext.current = this;
    FakeAudioContext.created += 1;
    setInterval(() => this.tick(0.05), 50);
  }
  private tick(seconds: number) {
    if (this.state !== "running" || this.frozen) return;
    this.currentTime += seconds;
    const source = this.source;
    if (!source || source.stopped) return;
    this.played += seconds;
    if (this.played >= this.duration) {
      this.source = null;
      source.onended?.();
    }
  }
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }
  listenerCount() {
    return this.listeners.size;
  }
  setState(state: AudioContextState | "interrupted") {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  resume = vi.fn(async () => {
    if (this.resumable && this.state !== "running") this.setState("running");
  });
  close = vi.fn(async () => this.setState("closed"));
  decodeAudioData = vi.fn(async () => ({ duration: this.duration }));
  createAnalyser() {
    return { fftSize: 0, connect: vi.fn() };
  }
  createBufferSource() {
    this.played = 0;
    const source = {
      buffer: null,
      playbackRate: { value: 1 },
      onended: null as (() => void) | null,
      stopped: false,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(() => {
        source.stopped = true;
      })
    };
    this.source = source;
    return source;
  }
}

const elements: FakeAudio[] = [];
class FakeAudio {
  /** ตัวเล่นสำรอง: ends เล่นจบ, stuck เริ่มแล้วไม่ขยับ, blocked เบราว์เซอร์ไม่ยอม */
  static mode: "ends" | "stuck" | "blocked" = "ends";
  volume = 1;
  muted = false;
  src = "";
  paused = true;
  playbackRate = 1;
  preload = "";
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  setAttribute = vi.fn();
  removeAttribute = vi.fn();
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn(async () => {
    if (FakeAudio.mode === "blocked") throw Object.assign(new Error("no"), { name: "NotAllowedError" });
    if (FakeAudio.mode === "ends") setTimeout(() => this.onended?.(), 100);
  });
  constructor() {
    elements.push(this);
  }
}

const visibility = { hidden: false, listeners: new Set<() => void>() };

async function start(configure?: (ctx: FakeAudioContext) => void) {
  const player = createBrowserAudioPlayer();
  const playback = player.play(new Blob(["wav"], { type: "audio/wav" }), 1);
  configure?.(FakeAudioContext.current);
  let outcome: string | null = null;
  void playback.finished.then((value) => {
    outcome = value;
  });
  await vi.advanceTimersByTimeAsync(800);
  return { player, playback, ctx: FakeAudioContext.current, outcome: () => outcome };
}

describe("เสียงถูกขัดกลางคลิป", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    elements.length = 0;
    FakeAudio.mode = "ends";
    FakeAudioContext.created = 0;
    visibility.hidden = false;
    visibility.listeners.clear();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    vi.stubGlobal("document", {
      get hidden() {
        return visibility.hidden;
      },
      addEventListener: (_type: string, listener: () => void) => visibility.listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => visibility.listeners.delete(listener)
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("เล่นปกติไม่ถูกแทรกแซง", async () => {
    const { ctx, outcome } = await start();
    await vi.advanceTimersByTimeAsync(1500);
    expect(outcome()).toBe("ended");
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(elements).toHaveLength(0);
  });

  it("ระบบพักเสียงแล้วยอมให้กลับมา: เล่นต่อจากจุดเดิมจนจบเอง", async () => {
    const { ctx, outcome } = await start();
    ctx.setState("suspended");
    await vi.advanceTimersByTimeAsync(1600);
    expect(outcome()).toBe("ended");
    expect(elements).toHaveLength(0);
  });

  it("ระบบไม่ยอมให้กลับมา: เล่นส่วนที่เหลือด้วยตัวเล่นสำรอง ไม่เริ่มใหม่ตั้งแต่ต้น", async () => {
    const { ctx, outcome } = await start((c) => (c.resumable = false));
    const source = ctx.source;
    ctx.setState("interrupted");
    await vi.advanceTimersByTimeAsync(3000);
    expect(outcome()).toBe("ended");
    expect(elements[0]?.currentTime).toBeGreaterThan(0.5);
    expect(elements[0]?.currentTime).toBeLessThan(1);
    expect(source?.stop).toHaveBeenCalled();
  });

  it.each([["stuck"], ["blocked"]] as const)("ตัวเล่นสำรองก็ใช้ไม่ได้ (%s): จบภายใน 3 วินาที ไม่ค้าง", async (mode) => {
    FakeAudio.mode = mode;
    const { ctx, outcome } = await start((c) => (c.resumable = false));
    ctx.setState("suspended");
    await vi.advanceTimersByTimeAsync(3000);
    expect(outcome()).toBe(mode === "stuck" ? "failed" : "blocked");
  });

  it("สถานะบอกว่าเล่นอยู่แต่เสียงไม่เดิน: ใช้ตัวเล่นสำรอง และรอบถัดไปเปิดระบบเสียงใหม่", async () => {
    const { player, ctx, outcome } = await start();
    ctx.frozen = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(outcome()).toBe("ended");
    expect(ctx.close).toHaveBeenCalled();
    player.play(new Blob(["wav"]), 1);
    expect(FakeAudioContext.created).toBe(2);
  });

  it("ผู้ใช้สลับไปแอปอื่นหรือรับสาย: รอจนกลับมาแล้วเล่นต่อ ไม่พูดทับ", async () => {
    const { ctx, outcome } = await start((c) => (c.resumable = false));
    visibility.hidden = true;
    ctx.setState("interrupted");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(outcome()).toBeNull();
    expect(elements).toHaveLength(0);

    ctx.resumable = true;
    visibility.hidden = false;
    visibility.listeners.forEach((listener) => listener());
    await vi.advanceTimersByTimeAsync(1600);
    expect(outcome()).toBe("ended");
  });

  it("สั่งหยุดระหว่างถูกขัด: จบทันทีและไม่เหลือตัวเฝ้า", async () => {
    const { playback, ctx, outcome } = await start((c) => (c.resumable = false));
    ctx.setState("suspended");
    playback.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(outcome()).toBe("stopped");
    expect(elements).toHaveLength(0);
    expect(ctx.listenerCount()).toBe(0);
    expect(visibility.listeners.size).toBe(0);
  });
});
