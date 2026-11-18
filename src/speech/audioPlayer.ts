import type { AudioPlayback, AudioPlayer, PlaybackOutcome } from "./cloudVoice";

/**
 * ตัวเล่นไฟล์เสียงจากหน่วยความจำด้วย Blob URL (ต้องได้รับอนุญาต media-src 'self' blob: ใน CSP)
 * คืน URL กลับระบบทันทีเมื่อเล่นจบ ถูกหยุด หรือเล่นไม่สำเร็จ
 */
export function createBrowserAudioPlayer(): AudioPlayer {
  return {
    play(audio: Blob, rate: number): AudioPlayback {
      const url = URL.createObjectURL(audio);
      const element = new Audio(url);
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
    }
  };
}
