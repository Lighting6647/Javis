import { Capacitor } from "@capacitor/core";
import { isDesktopApp } from "../browser/browserStore";
import { transcribeAudio } from "../services/transcribeApi";
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
