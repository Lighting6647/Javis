import { describe, expect, it } from "vitest";
import { classifySpeakerProfiles, classifySpeakerVector, cosineSimilarity, extractSpeakerVectorFromPcm } from "./speakerProfile";

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

    const profile = { id: "1", label: "ไลท์", vector: lightVec!, updatedAt: Date.now() };
    expect(classifySpeakerVector(lightVecAgain, profile)).toBe("ไลท์");
    expect(classifySpeakerVector(otherVec, profile)).toBe("คู่สนทนา");
  });

  it("รองรับหลายโปรไฟล์ผู้พูดพร้อมกันและปรับความไว threshold ได้", () => {
    const lightVec = extractSpeakerVectorFromPcm(sineWave(180), 24_000)!;
    const teammateVec = extractSpeakerVectorFromPcm(sineWave(1100), 24_000)!;
    const unknownVec = extractSpeakerVectorFromPcm(sineWave(2800), 24_000)!;

    const profiles = [
      { id: "p1", label: "ไลท์", vector: lightVec, updatedAt: 1 },
      { id: "p2", label: "คุณบี", vector: teammateVec, updatedAt: 2 }
    ];

    expect(classifySpeakerProfiles(extractSpeakerVectorFromPcm(sineWave(185), 24_000), profiles, 0.86)).toBe("ไลท์");
    expect(classifySpeakerProfiles(extractSpeakerVectorFromPcm(sineWave(1120), 24_000), profiles, 0.86)).toBe("คุณบี");
    expect(classifySpeakerProfiles(unknownVec, profiles, 0.86)).toBe("คู่สนทนา");
    // threshold สูงสุด 0.95 ช่วยคัดความคล้ายที่ต่ำกว่าออกอย่างเข้มงวด
    expect(classifySpeakerProfiles(unknownVec, profiles, 0.95)).toBe("คู่สนทนา");
  });

  it("เมื่อยังไม่ได้บันทึกโปรไฟล์เสียง: คืน undefined เพื่อคงรูปแบบบันทึกปกติ", () => {
    expect(classifySpeakerVector([0.1, 0.2], null)).toBeUndefined();
    expect(classifySpeakerProfiles([0.1, 0.2], [])).toBeUndefined();
  });
});
