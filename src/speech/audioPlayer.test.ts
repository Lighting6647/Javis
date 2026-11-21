import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserAudioPlayer } from "./audioPlayer";

describe("createBrowserAudioPlayer", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resets volume to 1 when playing via HTMLAudioElement after unlock()", async () => {
    const audioInstances: Array<{
      volume: number;
      muted: boolean;
      src: string;
      paused: boolean;
      playbackRate: number;
      preload: string;
      onended: (() => void) | null;
      onerror: (() => void) | null;
      setAttribute: ReturnType<typeof vi.fn>;
      removeAttribute: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
      load: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
    }> = [];

    class FakeAudio {
      volume = 1;
      muted = false;
      src = "";
      paused = true;
      playbackRate = 1;
      preload = "";
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      setAttribute = vi.fn();
      removeAttribute = vi.fn(() => {
        this.src = "";
      });
      pause = vi.fn();
      load = vi.fn();
      play = vi.fn(() => {
        // ค้าง Promise ของ unlock ไว้ เพื่อจำลองการเรียก play() ก่อน cleanupSilent ทำงาน
        if (this.volume === 0) return new Promise<void>(() => undefined);
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      });

      constructor() {
        audioInstances.push(this);
      }
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake-audio"),
      revokeObjectURL: vi.fn()
    });

    const player = createBrowserAudioPlayer();
    player.unlock?.();
    expect(audioInstances[0]?.volume).toBe(0);

    const playback = player.play(new Blob(["wav"], { type: "audio/wav" }), 1.1);
    const outcome = await playback.finished;

    expect(outcome).toBe("ended");
    expect(audioInstances[0]?.volume).toBe(1);
    expect(audioInstances[0]?.muted).toBe(false);
    expect(audioInstances[0]?.playbackRate).toBe(1.1);
  });

  it("falls back to HTMLAudioElement when AudioContext.resume() hangs", async () => {
    vi.useFakeTimers();

    class HangingAudioContext {
      state: AudioContextState = "suspended";
      resume = vi.fn(() => new Promise<void>(() => undefined));
      decodeAudioData = vi.fn();
      createBuffer = vi.fn();
      createBufferSource = vi.fn();
      destination = {};
    }

    class FakeAudio {
      volume = 1;
      muted = false;
      src = "";
      paused = true;
      playbackRate = 1;
      preload = "";
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      setAttribute = vi.fn();
      removeAttribute = vi.fn();
      pause = vi.fn();
      load = vi.fn();
      play = vi.fn(() => {
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      });
    }

    vi.stubGlobal("window", { AudioContext: HangingAudioContext });
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fallback"),
      revokeObjectURL: vi.fn()
    });

    const player = createBrowserAudioPlayer();
    const playback = player.play(new Blob(["wav"], { type: "audio/wav" }), 1);

    await vi.advanceTimersByTimeAsync(1300);
    const outcome = await playback.finished;
    expect(outcome).toBe("ended");
  });
});
