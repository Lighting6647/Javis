import { getVoicePersona } from "./cloudVoices";
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

function scoreVoice(voice: SpeechSynthesisVoice, preferredGender: "female" | "male" = "female"): number {
  let score = 0;
  const isFemale = /premwadee|achara|kanya|narisa|google\s*ภาษาไทย|google\s*thai|female|woman|girl/i.test(voice.name);
  const isMale = /niwat|pattara|narong|\bmale\b|\bman\b|\bboy\b/i.test(voice.name);

  if (preferredGender === "male") {
    // โหมด Javis (เสียงสำรองเมื่อเสียงลูน่าขัดข้อง): เลือกเสียงผู้ชายภาษาไทยเป็นอันดับแรกถ้ามีในเครื่อง
    if (isMale) score += 5;
    else if (isFemale) score -= 2;
  } else {
    // โหมดเดลลูน่า: ให้ความสำคัญเสียงผู้หญิงภาษาไทยเป็นค่าเริ่มต้น
    if (isFemale) score += 4;
    else if (isMale) score -= 2;
  }
  if (/natural|premium|enhanced|siri/i.test(voice.name)) score += 2;
  if (voice.default) score += 1;
  return score;
}

/** เสียงภาษาไทยเรียงจากคุณภาพดีที่สุดตามเพศเสียงที่ต้องการ */
function thaiVoices(synthesis: SpeechSynthesis, preferredGender: "female" | "male" = "female"): SpeechSynthesisVoice[] {
  return synthesis
    .getVoices()
    .filter(isThai)
    .sort((a, b) => scoreVoice(b, preferredGender) - scoreVoice(a, preferredGender));
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
  private preferredGender: "female" | "male" = "female";
  /** เก็บอ้างอิงไว้ ไม่เช่นนั้นบางเบราว์เซอร์จะเก็บกวาดก่อนพูดจบ */
  private readonly pending = new Set<SpeechSynthesisUtterance>();
  /** ตัวปิดงานของประโยคที่กำลังรอพูด เพื่อปลด Promise ทันทีเมื่อ cancel() ถูกเรียก */
  private readonly activeFinishes = new Set<() => void>();
  /** เบราว์เซอร์ยอมให้หน้านี้พูดหรือยัง รู้จากผลของการสั่งพูดแต่ละครั้ง */
  private readonly block = createSpeechBlock();

  isBlocked = (): boolean => this.block.isBlocked();

  onBlockedChange = (listener: () => void): (() => void) => this.block.subscribe(listener);

  private get synthesis(): SpeechSynthesis | null {
    return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  }

  /** เสียงที่ผู้ใช้เลือก หรือเสียงที่ดีที่สุดตามโหมดเพศเสียง (เดลลูน่า/จาวิส) */
  private get voice(): SpeechSynthesisVoice | null {
    const chosen = this.voices.find((voice) => voice.voiceURI === this.settings.voiceId);
    if (chosen) return chosen;
    const ranked = [...this.voices].sort((a, b) => scoreVoice(b, this.preferredGender) - scoreVoice(a, this.preferredGender));
    return ranked[0] ?? null;
  }

  setFallbackGender(gender: "female" | "male"): void {
    this.preferredGender = gender;
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
    if (!synthesis) return Promise.resolve();
    if (this.voices.length === 0) {
      this.voices = thaiVoices(synthesis);
    }
    const voice = this.voice;

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || SPEECH_LANGUAGE;
      utterance.rate = this.settings.rate;
      utterance.pitch = this.preferredGender === "male" ? 0.96 : getVoicePersona(this.settings.persona).devicePitch;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        this.pending.delete(utterance);
        this.activeFinishes.delete(finish);
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
      this.activeFinishes.add(finish);
      // กันสถานะ speechSynthesis ค้าง pause ใน Chrome/Edge
      if (synthesis.paused) synthesis.resume();
      synthesis.speak(utterance);
    });
  }

  cancel(): void {
    this.synthesis?.cancel();
    // Chrome/Safari บางรุ่นไม่ยิง onend/onerror เมื่อ cancel() จึงปลด Promise ที่ค้างอยู่ทันที
    for (const finish of [...this.activeFinishes]) {
      finish();
    }
  }
}
