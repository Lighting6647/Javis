import { describe, expect, it } from "vitest";
import { createSilenceDetector, rmsLevel, type SilenceDetectorOptions } from "./silenceDetector";

const OPTIONS: SilenceDetectorOptions = { speechLevel: 0.02, endSilenceMs: 1000, noSpeechMs: 5000, maxDurationMs: 20_000 };
const QUIET = 0.001;
const LOUD = 0.2;

describe("createSilenceDetector", () => {
  it("อัดต่อระหว่างที่ผู้ใช้พูด และตัดจบเมื่อเงียบนานพอหลังพูด", () => {
    const detector = createSilenceDetector(OPTIONS);

    expect(detector.feed(QUIET, 200)).toBe("continue");
    expect(detector.feed(LOUD, 600)).toBe("continue");
    expect(detector.feed(LOUD, 1500)).toBe("continue");
    expect(detector.feed(QUIET, 2400)).toBe("continue");
    expect(detector.feed(QUIET, 2500)).toBe("end-of-speech");
    expect(detector.heardSpeech).toBe(true);
  });

  it("การเว้นจังหวะสั้น ๆ กลางประโยคไม่ถูกตัดจบ", () => {
    const detector = createSilenceDetector(OPTIONS);

    detector.feed(LOUD, 500);
    expect(detector.feed(QUIET, 1300)).toBe("continue");
    expect(detector.feed(LOUD, 1400)).toBe("continue");
    expect(detector.feed(QUIET, 2300)).toBe("continue");
    expect(detector.feed(QUIET, 2400)).toBe("end-of-speech");
  });

  it("แจ้งว่าไม่มีคำพูดเมื่อเงียบตั้งแต่ต้นจนครบเวลา", () => {
    const detector = createSilenceDetector(OPTIONS);

    expect(detector.feed(QUIET, 4900)).toBe("continue");
    expect(detector.feed(QUIET, 5000)).toBe("no-speech");
    expect(detector.heardSpeech).toBe(false);
  });

  it("หยุดเมื่อครบเวลาอัดสูงสุด แม้ยังพูดอยู่", () => {
    const detector = createSilenceDetector(OPTIONS);

    detector.feed(LOUD, 1000);
    expect(detector.feed(LOUD, 19_900)).toBe("continue");
    expect(detector.feed(LOUD, 20_000)).toBe("max-duration");
  });
});

describe("rmsLevel", () => {
  it("ความเงียบมีระดับเป็นศูนย์", () => {
    expect(rmsLevel(new Uint8Array(256).fill(128))).toBe(0);
    expect(rmsLevel(new Uint8Array(0))).toBe(0);
  });

  it("เสียงดังขึ้นมีระดับสูงขึ้น", () => {
    const soft = rmsLevel(Uint8Array.from([126, 130, 127, 129]));
    const loud = rmsLevel(Uint8Array.from([60, 196, 70, 190]));
    expect(soft).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(soft * 10);
    expect(rmsLevel(Uint8Array.from([0, 255, 0, 255]))).toBeCloseTo(1, 1);
  });
});
