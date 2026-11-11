export interface SilenceDetectorOptions {
  /** ระดับเสียง (RMS 0..1) ที่ถือว่าเป็นเสียงพูด */
  speechLevel: number;
  /** เงียบนานเท่านี้หลังเริ่มพูด ถือว่าพูดจบ */
  endSilenceMs: number;
  /** ไม่ได้ยินเสียงพูดเลยนานเท่านี้ ถือว่าไม่มีคำพูด */
  noSpeechMs: number;
  /** อัดนานสุดเท่านี้ */
  maxDurationMs: number;
}

export type SilenceVerdict = "continue" | "end-of-speech" | "no-speech" | "max-duration";

export interface SilenceDetector {
  /** ป้อนระดับเสียงล่าสุดพร้อมเวลาที่ผ่านไปตั้งแต่เริ่มอัด คืนคำตัดสินว่าควรอัดต่อหรือหยุด */
  feed(level: number, elapsedMs: number): SilenceVerdict;
  /** ได้ยินเสียงพูดแล้วอย่างน้อยหนึ่งครั้ง */
  readonly heardSpeech: boolean;
}

export const DEFAULT_SILENCE_OPTIONS: SilenceDetectorOptions = {
  speechLevel: 0.02,
  endSilenceMs: 1300,
  noSpeechMs: 8000,
  maxDurationMs: 60_000
};

/**
 * ตัดสินจากระดับเสียงว่าผู้ใช้พูดจบหรือยัง สำหรับที่ที่ระบบรู้จำเสียงของอุปกรณ์ใช้ไม่ได้
 * และต้องอัดเสียงเองแล้วส่งไปแปลงเป็นข้อความ
 */
export function createSilenceDetector(options: SilenceDetectorOptions = DEFAULT_SILENCE_OPTIONS): SilenceDetector {
  let heardSpeech = false;
  let lastSpeechAt = 0;

  return {
    feed(level, elapsedMs) {
      if (level >= options.speechLevel) {
        heardSpeech = true;
        lastSpeechAt = elapsedMs;
      }

      if (elapsedMs >= options.maxDurationMs) return "max-duration";
      if (!heardSpeech) return elapsedMs >= options.noSpeechMs ? "no-speech" : "continue";
      return elapsedMs - lastSpeechAt >= options.endSilenceMs ? "end-of-speech" : "continue";
    },
    get heardSpeech() {
      return heardSpeech;
    }
  };
}

/** ระดับเสียงแบบ RMS จากตัวอย่างคลื่นเสียงชนิด 8 บิต (128 คือเงียบ) */
export function rmsLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / samples.length);
}
