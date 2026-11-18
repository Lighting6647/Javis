import { describe, expect, it } from "vitest";
import { bytesToBase64, encodeWavFromPcm16, floatToPcm16, TARGET_WAV_SAMPLE_RATE } from "./voiceRecorder";

describe("voiceRecorder WAV encoding", () => {
  it("เข้ารหัสเสียง 24kHz โมโน 16-bit WAV ที่มีหัว RIFF/WAVE ถูกต้อง", () => {
    const pcm = floatToPcm16(new Float32Array([0, 0.5, -0.5, 2, -2]));
    const wav = encodeWavFromPcm16(pcm, TARGET_WAV_SAMPLE_RATE);

    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe("WAVE");
    const view = new DataView(wav.buffer);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);
    expect(pcm[3]).toBe(0x7fff);
    expect(pcm[4]).toBe(-0x8000);
    expect(bytesToBase64(wav).startsWith("UklGR")).toBe(true);
  });
});
