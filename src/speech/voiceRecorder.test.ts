import { describe, expect, it } from "vitest";
import { bytesToBase64, encodeWavFromPcm16, floatToPcm16, TARGET_WAV_SAMPLE_RATE, trimSilenceSamples } from "./voiceRecorder";

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

describe("trimSilenceSamples", () => {
  it("ตัดความเงียบและเสียงรบกวนเบาๆ หัว-ท้ายออก พร้อมคงช่วงเผื่อเล็กน้อย", () => {
    const sr = 1000;
    const samples = new Float32Array(3000); // 3 วินาที
    // เติมเสียงรบกวนเบาๆ 0.003 ช่วงต้นและท้าย
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = i % 2 === 0 ? 0.003 : -0.003;
    }
    // ใส่เสียงพูด 0.6s ตรงกลาง (วินาที 1.2 - 1.8)
    for (let i = 1200; i < 1800; i += 1) {
      samples[i] = Math.sin((2 * Math.PI * 180 * i) / sr) * 0.4;
    }

    const trimmed = trimSilenceSamples(samples, sr, { padSeconds: 0.1, minKeepSeconds: 0.3 });
    expect(trimmed.length).toBeLessThan(1200);
    expect(trimmed.length).toBeGreaterThanOrEqual(750);
  });

  it("หากคลิปเงียบสนิททั้งไฟล์ ให้คืนสัญญาณเดิมเพื่อความปลอดภัย", () => {
    const silent = new Float32Array(2000);
    const result = trimSilenceSamples(silent, 1000);
    expect(result.length).toBe(2000);
  });
});
