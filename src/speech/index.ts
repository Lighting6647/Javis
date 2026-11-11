import { Capacitor } from "@capacitor/core";
import { NativeSpeechRecognizer } from "./nativeRecognizer";
import { NativeSpeechSynthesizer } from "./nativeSynthesizer";
import type { SpeechRecognizer, SpeechSynthesizer } from "./types";
import { WebSpeechRecognizer } from "./webRecognizer";
import { WebSpeechSynthesizer } from "./webSynthesizer";

export interface SpeechServices {
  recognizer: SpeechRecognizer;
  synthesizer: SpeechSynthesizer;
}

/** เลือกระบบเสียงของอุปกรณ์ให้ตรงกับที่แอปกำลังทำงานอยู่ */
export function createSpeechServices(): SpeechServices {
  if (Capacitor.isNativePlatform()) {
    return {
      recognizer: new NativeSpeechRecognizer(),
      synthesizer: new NativeSpeechSynthesizer()
    };
  }
  return {
    recognizer: new WebSpeechRecognizer(),
    synthesizer: new WebSpeechSynthesizer()
  };
}
