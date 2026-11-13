import { createSpeechBlock } from "./speechBlock";
import {
  DEFAULT_VOICE_SETTINGS,
  SPEECH_LANGUAGE,
  type SpeechSynthesizer,
  type VoiceOption,
  type VoiceSettings
} from "./types";

const VOICE_LOAD_TIMEOUT_MS = 1500;
/** บางเบราว์เซอร์ไม่แจ้งว่าพูดจบ จึงต้องมีเวลาสำรองตามความยาวข้อความ */
const WATCHDOG_BASE_MS = 5000;
const WATCHDOG_PER_CHARACTER_MS = 250;

function isThai(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.toLowerCase().replace("_", "-").startsWith("th");
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  if (/natural|premium|enhanced|siri/i.test(voice.name)) score += 2;
  if (voice.default) score += 1;
  return score;
}

/** เสียงภาษาไทยเรียงจากคุณภาพดีที่สุด */
function thaiVoices(synthesis: SpeechSynthesis): SpeechSynthesisVoice[] {
  return synthesis
    .getVoices()
    .filter(isThai)
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

function loadThaiVoices(synthesis: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const ready = thaiVoices(synthesis);
  if (ready.length > 0) return Promise.resolve(ready);

  // รายการเสียงมักโหลดตามมาทีหลัง รอสักครู่ก่อนสรุปว่าไม่มีเสียงภาษาไทย
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      synthesis.removeEventListener("voiceschanged", onChange);
      resolve(thaiVoices(synthesis));
    };
    const onChange = () => {
      if (thaiVoices(synthesis).length > 0) finish();
    };
    const timer = window.setTimeout(finish, VOICE_LOAD_TIMEOUT_MS);
    synthesis.addEventListener("voiceschanged", onChange);
  });
}

/** ตัวพูดบนเบราว์เซอร์: ใช้เสียงภาษาไทยที่ติดตั้งในอุปกรณ์ (เช่นเสียงของ Apple บน Safari) */
export class WebSpeechSynthesizer implements SpeechSynthesizer {
  private voices: SpeechSynthesisVoice[] = [];
  private settings: VoiceSettings = DEFAULT_VOICE_SETTINGS;
  /** เก็บอ้างอิงไว้ ไม่เช่นนั้นบางเบราว์เซอร์จะเก็บกวาดก่อนพูดจบ */
  private readonly pending = new Set<SpeechSynthesisUtterance>();
  /** เบราว์เซอร์ยอมให้หน้านี้พูดหรือยัง รู้จากผลของการสั่งพูดแต่ละครั้ง */
  private readonly block = createSpeechBlock();

  isBlocked = (): boolean => this.block.isBlocked();

  onBlockedChange = (listener: () => void): (() => void) => this.block.subscribe(listener);

  private get synthesis(): SpeechSynthesis | null {
    return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  }

  /** เสียงที่ผู้ใช้เลือก หรือเสียงที่ดีที่สุดถ้ายังไม่ได้เลือกหรือเสียงนั้นหายไปแล้ว */
  private get voice(): SpeechSynthesisVoice | null {
    const chosen = this.voices.find((voice) => voice.voiceURI === this.settings.voiceId);
    return chosen ?? this.voices[0] ?? null;
  }

  async listVoices(): Promise<VoiceOption[]> {
    const synthesis = this.synthesis;
    if (!synthesis) return [];

    this.voices = await loadThaiVoices(synthesis);
    return this.voices.map((voice) => ({ id: voice.voiceURI, name: voice.name }));
  }

  applySettings(settings: VoiceSettings): void {
    this.settings = settings;
  }

  prepare(): Promise<boolean> {
    const synthesis = this.synthesis;
    if (!synthesis) return Promise.resolve(false);

    // iOS Safari ยอมให้พูดได้ก็ต่อเมื่อเคยสั่งพูดภายในจังหวะที่ผู้ใช้แตะหน้าจอ
    synthesis.cancel();
    const unlock = new SpeechSynthesisUtterance(" ");
    unlock.volume = 0;
    // ประโยคเงียบนี้บอกด้วยว่าตอนนี้เบราว์เซอร์ยอมให้พูดไหม: ถ้าไม่ยอม ข้อผิดพลาดมาถึงทันทีระหว่างสั่งพูด (วัดใน Chrome 157)
    let refused = false;
    unlock.onerror = (event) => {
      refused = refused || event.error === "not-allowed";
      this.block.failed(event.error);
    };
    synthesis.speak(unlock);
    if (!refused) this.block.started();

    return this.listVoices().then((voices) => voices.length > 0);
  }

  speak(text: string): Promise<void> {
    const synthesis = this.synthesis;
    const voice = this.voice;
    if (!synthesis || !voice) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang || SPEECH_LANGUAGE;
      utterance.rate = this.settings.rate;

      const finish = () => {
        window.clearTimeout(watchdog);
        this.pending.delete(utterance);
        resolve();
      };
      // พูดช้าลงก็ต้องรอนานขึ้นตามสัดส่วน
      const watchdog = window.setTimeout(
        finish,
        (WATCHDOG_BASE_MS + text.length * WATCHDOG_PER_CHARACTER_MS) / this.settings.rate
      );

      utterance.onstart = () => this.block.started();
      utterance.onend = finish;
      utterance.onerror = (event) => {
        this.block.failed(event.error);
        finish();
      };
      this.pending.add(utterance);
      synthesis.speak(utterance);
    });
  }

  cancel(): void {
    this.synthesis?.cancel();
  }
}
