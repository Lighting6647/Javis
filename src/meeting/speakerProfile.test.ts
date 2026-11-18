import { describe, expect, it } from "vitest";
import { classifySpeakerVector, cosineSimilarity, extractSpeakerVectorFromPcm } from "./speakerProfile";

function sineWave(freqHz: number, seconds = 0.6, sampleRate = 24_000): Float32Array {
  const total = Math.round(seconds * sampleRate);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    out[i] = 0.4 * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }
  return out;
}

describe("speakerProfile acoustic speaker recognition", () => {
  it("สกัดเวกเตอร์เสียงจาก PCM และจำแนกเสียงเจ้าของกับเสียงคนอื่นได้อย่างถูกต้อง", () => {
    const lightVoice = sineWave(180);
    const otherVoice = sineWave(1900);

    const lightVec = extractSpeakerVectorFromPcm(lightVoice, 24_000);
    const lightVecAgain = extractSpeakerVectorFromPcm(sineWave(185), 24_000);
    const otherVec = extractSpeakerVectorFromPcm(otherVoice, 24_000);

    expect(lightVec).not.toBeNull();
    expect(otherVec).not.toBeNull();
    expect(cosineSimilarity(lightVec!, lightVecAgain!)).toBeGreaterThan(0.95);

    const profile = { label: "ไลท์", vector: lightVec!, updatedAt: Date.now() };
    expect(classifySpeakerVector(lightVecAgain, profile)).toBe("ไลท์");
    expect(classifySpeakerVector(otherVec, profile)).toBe("คู่สนทนา");
  });

  it("เมื่อยังไม่ได้บันทึกโปรไฟล์เสียง: คืน undefined เพื่อคงรูปแบบบันทึกปกติ", () => {
    expect(classifySpeakerVector([0.1, 0.2], null)).toBeUndefined();
  });
});
