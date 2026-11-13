import { Capacitor } from "@capacitor/core";
import { isDesktopApp } from "../browser/browserStore";
import { transcribeAudio } from "../services/transcribeApi";
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

/** เลือกระบบเสียงให้ตรงกับที่แอปกำลังทำงานอยู่ */
export function createSpeechServices(): SpeechServices {
  if (Capacitor.isNativePlatform()) {
    return {
      recognizer: new NativeSpeechRecognizer(),
      synthesizer: new NativeSpeechSynthesizer()
    };
  }
  if (isDesktopApp()) {
    // แอปเดสก์ท็อปไม่มีระบบรู้จำเสียงของเบราว์เซอร์ให้ใช้ จึงอัดเสียงแล้วส่งไปแปลงเป็นข้อความแทน
    return {
      recognizer: new RecorderSpeechRecognizer(transcribeAudio),
      synthesizer: new WebSpeechSynthesizer()
    };
  }
  return {
    recognizer: new WebSpeechRecognizer(),
    synthesizer: new WebSpeechSynthesizer()
  };
}
