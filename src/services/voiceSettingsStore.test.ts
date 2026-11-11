import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_SETTINGS, MAX_SPEECH_RATE, MIN_SPEECH_RATE } from "../speech/types";
import { sanitizeVoiceSettings, voiceSettingsStore } from "./voiceSettingsStore";

describe("sanitizeVoiceSettings", () => {
  it("คงค่าที่ถูกต้องไว้", () => {
    expect(sanitizeVoiceSettings({ voiceId: "com.apple.voice.kanya", rate: 1.2 })).toEqual({
      voiceId: "com.apple.voice.kanya",
      rate: 1.2
    });
  });

  it.each([null, undefined, "text", 42, []])("ใช้ค่าเริ่มต้นเมื่อข้อมูลเสียหาย (%j)", (value) => {
    expect(sanitizeVoiceSettings(value)).toEqual(DEFAULT_VOICE_SETTINGS);
  });

  it("บีบความเร็วให้อยู่ในช่วงที่รองรับ และปัดเป็นทศนิยมหนึ่งตำแหน่ง", () => {
    expect(sanitizeVoiceSettings({ rate: 0.1 }).rate).toBe(MIN_SPEECH_RATE);
    expect(sanitizeVoiceSettings({ rate: 9 }).rate).toBe(MAX_SPEECH_RATE);
    expect(sanitizeVoiceSettings({ rate: 1.2400001 }).rate).toBe(1.2);
  });

  it("ใช้ค่าเริ่มต้นเมื่อความเร็วหรือเสียงไม่ใช่ชนิดที่ถูกต้อง", () => {
    expect(sanitizeVoiceSettings({ voiceId: 7, rate: "fast" })).toEqual(DEFAULT_VOICE_SETTINGS);
    expect(sanitizeVoiceSettings({ voiceId: "", rate: Number.NaN })).toEqual(DEFAULT_VOICE_SETTINGS);
  });
});

describe("voiceSettingsStore", () => {
  it("อัปเดตบางส่วน แจ้งผู้ติดตาม และไม่รับค่านอกช่วง", () => {
    let notified = 0;
    const unsubscribe = voiceSettingsStore.subscribe(() => {
      notified += 1;
    });

    voiceSettingsStore.update({ rate: 1.4 });
    voiceSettingsStore.update({ voiceId: "voice-a" });
    expect(voiceSettingsStore.get()).toEqual({ voiceId: "voice-a", rate: 1.4 });

    voiceSettingsStore.update({ rate: 99 });
    expect(voiceSettingsStore.get().rate).toBe(MAX_SPEECH_RATE);
    expect(notified).toBe(3);

    unsubscribe();
    voiceSettingsStore.update(DEFAULT_VOICE_SETTINGS);
    expect(notified).toBe(3);
    expect(voiceSettingsStore.get()).toEqual(DEFAULT_VOICE_SETTINGS);
  });
});
