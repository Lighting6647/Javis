import { Capacitor } from "@capacitor/core";
import { isDesktopApp } from "../browser/browserStore";
import { cloudVoiceStore } from "../services/aiStatusStore";
import { fetchCloudSpeech } from "../services/speechApi";
import { transcribeAudio } from "../services/transcribeApi";
import { createBrowserAudioPlayer } from "./audioPlayer";
import { CloudVoiceSynthesizer } from "./cloudVoice";
import { isHandheld } from "./device";
import { canListenHandsFree } from "./handsFree";
import { NativeSpeechRecognizer } from "./nativeRecognizer";
import { NativeSpeechSynthesizer } from "./nativeSynthesizer";
import { RecorderSpeechRecognizer } from "./recorderRecognizer";
import type { SpeechRecognizer, SpeechSynthesizer } from "./types";
import { WebSpeechRecognizer } from "./webRecognizer";
import { WebSpeechSynthesizer } from "./webSynthesizer";

export interface SpeechServices {
  recognizer: SpeechRecognizer;
  synthesizer: SpeechSynthesizer;
}

/** กำลังใช้งานบนมือถือหรือแท็บเล็ต ทั้งแอปที่ติดตั้งและเว็บ */
export function isMobileDevice(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return typeof navigator !== "undefined" && isHandheld(navigator.userAgent, navigator.maxTouchPoints);
}

/** ที่นี่ฟังตลอดเวลาได้ไหม (เปิดหน้าแล้วพูดได้เลย) ดูเงื่อนไขใน src/speech/handsFree.ts */
export function handsFreeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };

  return canListenHandsFree({
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints,
    recognition: Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition),
    native: Capacitor.isNativePlatform(),
    desktopApp: isDesktopApp()
  });
}

/**
 * ระบบฟังสำหรับจดคำพูดต่อเนื่องของโหมดสรุปการประชุม ซึ่งใช้ได้เฉพาะที่ที่ฟังตลอดเวลาได้ (handsFreeAvailable)
 * เป็นคนละตัวกับระบบฟังของบทสนทนา เพื่อให้การหยุดบทสนทนาตอนสลับโหมดไม่ไปยกเลิกการจดที่เพิ่งเริ่ม
 */
export function createDictationRecognizer(): SpeechRecognizer {
  return new WebSpeechRecognizer();
}

/** เลือกระบบเสียงให้ตรงกับที่แอปกำลังทำงานอยู่ และครอบด้วยเสียงของ Gemini พร้อมสลับกลับเสียงอุปกรณ์อัตโนมัติ */
export function createSpeechServices(): SpeechServices {
  const wrapCloud = (fallback: SpeechSynthesizer): SpeechSynthesizer =>
    new CloudVoiceSynthesizer({
      fallback,
      fetchSpeech: fetchCloudSpeech,
      player: createBrowserAudioPlayer(),
      available: cloudVoiceStore.get
    });

  if (Capacitor.isNativePlatform()) {
    return {
      recognizer: new NativeSpeechRecognizer(),
      synthesizer: wrapCloud(new NativeSpeechSynthesizer())
    };
  }
  if (isDesktopApp()) {
    // แอปเดสก์ท็อปไม่มีระบบรู้จำเสียงของเบราว์เซอร์ให้ใช้ จึงอัดเสียงแล้วส่งไปแปลงเป็นข้อความแทน
    return {
      recognizer: new RecorderSpeechRecognizer(transcribeAudio),
      synthesizer: wrapCloud(new WebSpeechSynthesizer())
    };
  }
  return {
    recognizer: new WebSpeechRecognizer(),
    synthesizer: wrapCloud(new WebSpeechSynthesizer())
  };
}
