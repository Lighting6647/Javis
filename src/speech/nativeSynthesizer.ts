import { TextToSpeech } from "@capacitor-community/text-to-speech";
import {
  DEFAULT_VOICE_SETTINGS,
  SPEECH_LANGUAGE,
  type SpeechSynthesizer,
  type VoiceOption,
  type VoiceSettings
} from "./types";

interface NativeVoice extends VoiceOption {
  /** ตำแหน่งในรายการเสียงทั้งหมดของระบบ ซึ่งปลั๊กอินใช้ระบุเสียงตอนสั่งพูด */
  index: number;
}

/** ตัวพูดบนแอปมือถือ: iOS ใช้ AVSpeechSynthesizer ของ Apple ส่วน Android ใช้ TextToSpeech ของระบบ */
export class NativeSpeechSynthesizer implements SpeechSynthesizer {
  private available: boolean | null = null;
  private voices: NativeVoice[] = [];
  private settings: VoiceSettings = DEFAULT_VOICE_SETTINGS;

  async listVoices(): Promise<VoiceOption[]> {
    try {
      const { voices } = await TextToSpeech.getSupportedVoices();
      this.voices = voices
        .map((voice, index) => ({ id: voice.voiceURI, name: voice.name, index, lang: voice.lang }))
        .filter((voice) => voice.lang.toLowerCase().replace("_", "-").startsWith("th"))
        .map(({ id, name, index }) => ({ id, name, index }));
    } catch {
      this.voices = [];
    }
    return this.voices.map(({ id, name }) => ({ id, name }));
  }

  applySettings(settings: VoiceSettings): void {
    this.settings = settings;
  }

  async prepare(): Promise<boolean> {
    const available = await this.checkAvailable();
    if (available) await this.listVoices();
    return available;
  }

  /** ถามระบบครั้งเดียวว่าพูดภาษาไทยได้ไหม แล้วจำคำตอบไว้ */
  private async checkAvailable(): Promise<boolean> {
    if (this.available === null) {
      try {
        const { supported } = await TextToSpeech.isLanguageSupported({ lang: SPEECH_LANGUAGE });
        this.available = supported;
      } catch {
        this.available = false;
      }
    }
    return this.available;
  }

  async speak(text: string): Promise<void> {
    if (!(await this.checkAvailable())) return;

    // ไม่ได้เลือกเสียง หรือเสียงที่เลือกหายไปแล้ว: ปล่อยให้ระบบใช้เสียงเริ่มต้นของภาษาไทย
    const chosen = this.voices.find((voice) => voice.id === this.settings.voiceId);
    try {
      await TextToSpeech.speak({
        text,
        lang: SPEECH_LANGUAGE,
        rate: this.settings.rate,
        pitch: 1,
        volume: 1,
        category: "playback",
        ...(chosen ? { voice: chosen.index } : {})
      });
    } catch {
      // ถูกสั่งหยุดกลางคัน หรือเครื่องยนต์เสียงขัดข้อง: ข้ามประโยคนี้ไป
    }
  }

  cancel(): void {
    void TextToSpeech.stop().catch(() => undefined);
  }
}
