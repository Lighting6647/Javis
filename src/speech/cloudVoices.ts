import type { VoicePersonaId } from "./types";

export interface GeminiVoiceOption {
  id: string;
  label: string;
  hint?: string;
}

export interface VoicePersonaOption {
  id: VoicePersonaId;
  label: string;
  hint: string;
  recommendedCloudVoice: string | null;
  devicePitch: number;
  sampleText: string;
}

/**
 * บุคลิกและลีลาการพูดของ Javis ที่ผู้ใช้เลือกสลับได้ทันทีจากหน้าตั้งค่า
 */
export const VOICE_PERSONAS: readonly VoicePersonaOption[] = [
  {
    id: "genz-girl",
    label: "สาวน้อย Gen Z สดใส (เสียงหลัก)",
    hint: "เสียงเด็กสาว Leda + ลีลาสดใส ร่าเริง เป็นกันเอง",
    recommendedCloudVoice: "Leda",
    devicePitch: 1.24,
    sampleText: "ฮายยย~ หวัดดีค่า! วันนี้มีอะไรให้เค้าช่วยเช็กหรือสรุปให้ บอกมาได้เลยน้า!"
  },
  {
    id: "assistant",
    label: "ผู้ช่วยสาวสุภาพ (เดลลูน่า)",
    hint: "เสียงผู้หญิง Kore คมชัด สุภาพ เป็นธรรมชาติ เหมาะกับการทำงานทั่วไป",
    recommendedCloudVoice: "Kore",
    devicePitch: 1.12,
    sampleText: "สวัสดีค่ะ ดิฉันคือ เดลลูน่า ผู้ช่วยของคุณค่ะ วันนี้ให้ช่วยเรื่องอะไรดีคะ"
  },
  {
    id: "upbeat-buddy",
    label: "สาวสายลุยกระฉับกระเฉง",
    hint: "เสียงผู้หญิง Zephyr + จังหวะคล่องตัว กระตือรือร้น สั่งงานไว",
    recommendedCloudVoice: "Zephyr",
    devicePitch: 1.15,
    sampleText: "พร้อมลุยแล้วค่ะ! มีงานด่วนหรือข้อมูลไหนให้ช่วยเช็ก สั่งมาได้เลยนะคะ!"
  },
  {
    id: "calm-soft",
    label: "สาวเสียงนุ่ม ผ่อนคลาย",
    hint: "เสียงผู้หญิง Aoede + น้ำเสียงละมุน ฟังสบาย เหมาะอ่านข่าวหรือบทความยาว ๆ",
    recommendedCloudVoice: "Aoede",
    devicePitch: 1.05,
    sampleText: "สวัสดีค่ะ ผ่อนคลายได้เลยนะคะ เดี๋ยวช่วยอ่านและสรุปเรื่องสำคัญให้ฟังแบบสบาย ๆ ค่ะ"
  }
];

const PERSONA_BY_ID = new Map(VOICE_PERSONAS.map((persona) => [persona.id, persona]));

export function getVoicePersona(id: VoicePersonaId | undefined): VoicePersonaOption {
  return (id ? PERSONA_BY_ID.get(id) : undefined) ?? VOICE_PERSONAS[0];
}

export function isVoicePersonaId(value: string): value is VoicePersonaId {
  return PERSONA_BY_ID.has(value as VoicePersonaId);
}

/**
 * รายชื่อเสียงพูดของ Gemini ที่รองรับใน server/speech.ts
 * จัดกลุ่มเสียงยอดนิยมพร้อมคำอธิบายภาษาไทยไว้ด้านบน เพื่อให้ผู้ใช้เลือกทดลองฟังได้ง่าย
 */
export const GEMINI_TTS_VOICES: readonly GeminiVoiceOption[] = [
  { id: "Leda", label: "Leda (หญิง · วัยรุ่นสดใส · เสียงหลัก)", hint: "เสียงเด็กสาว Gen Z ร่าเริง เป็นกันเอง (เสียงหลักของระบบ)" },
  { id: "Kore", label: "Kore (หญิง · คมชัด สุภาพ)", hint: "เสียงผู้หญิงคมชัด ชัดถ้อยชัดคำ อ่านภาษาไทยเป็นธรรมชาติ" },
  { id: "Aoede", label: "Aoede (หญิง · นุ่มนวล อบอุ่น)", hint: "เสียงผู้หญิงละมุน ฟังสบาย อ่อนโยน" },
  { id: "Zephyr", label: "Zephyr (หญิง · สดใส กระฉับกระเฉง)", hint: "เสียงผู้หญิงสว่าง กระตือรือร้น คล่องตัว" },
  { id: "Sulafat", label: "Sulafat (หญิง · อบอุ่น)", hint: "เสียงผู้หญิงโทนอบอุ่น น่าฟัง" },
  { id: "Achernar", label: "Achernar (หญิง · นุ่มละมุน)", hint: "เสียงผู้หญิงนุ่มนวล เบาสบาย" },
  { id: "Despina", label: "Despina (หญิง · ราบรื่น)", hint: "เสียงผู้หญิงลื่นไหล ชวนฟัง" },
  { id: "Callirrhoe", label: "Callirrhoe (หญิง · สบาย ๆ)", hint: "เสียงผู้หญิงเป็นกันเอง สบาย ๆ" },
  { id: "Autonoe", label: "Autonoe (หญิง · สว่าง)", hint: "เสียงผู้หญิงสดใส ชัดเจน" },
  { id: "Erinome", label: "Erinome (หญิง · ชัดเจน)", hint: "เสียงผู้หญิงใส ชัดถ้อยชัดคำ" },
  { id: "Laomedeia", label: "Laomedeia (หญิง · ร่าเริง)", hint: "เสียงผู้หญิงกระตือรือร้น มีชีวิตชีวา" },
  { id: "Pulcherrima", label: "Pulcherrima (หญิง · มีพลัง)", hint: "เสียงผู้หญิงชัดเจน ฉะฉาน" },
  { id: "Vindemiatrix", label: "Vindemiatrix (หญิง · อ่อนโยน)", hint: "เสียงผู้หญิงสุภาพ อ่อนโยน" },
  { id: "Gacrux", label: "Gacrux (หญิง · สุขุม)", hint: "เสียงผู้หญิงมีวุฒิภาวะ น่าเชื่อถือ" },
  { id: "Iapetus", label: "Iapetus (ชาย)", hint: "เสียงผู้ชายคมชัด สุภาพ" },
  { id: "Puck", label: "Puck (ชาย)", hint: "เสียงผู้ชายร่าเริง เป็นกันเอง" },
  { id: "Charon", label: "Charon (ชาย)", hint: "เสียงผู้ชายทุ้ม สุขุม" },
  { id: "Fenrir", label: "Fenrir (ชาย)", hint: "เสียงผู้ชายกระชับ หนักแน่น" },
  { id: "Orus", label: "Orus (ชาย)" },
  { id: "Enceladus", label: "Enceladus (ชาย)" },
  { id: "Umbriel", label: "Umbriel (ชาย)" },
  { id: "Algieba", label: "Algieba (ชาย)" },
  { id: "Algenib", label: "Algenib (ชาย)" },
  { id: "Rasalgethi", label: "Rasalgethi (ชาย)" },
  { id: "Alnilam", label: "Alnilam (ชาย)" },
  { id: "Schedar", label: "Schedar (ชาย)" },
  { id: "Achird", label: "Achird (ชาย)" },
  { id: "Zubenelgenubi", label: "Zubenelgenubi (ชาย)" },
  { id: "Sadachbia", label: "Sadachbia (ชาย)" },
  { id: "Sadaltager", label: "Sadaltager (ชาย)" }
];

const VALID_GEMINI_VOICE_IDS = new Set(GEMINI_TTS_VOICES.map((voice) => voice.id));
const CUSTOM_VOICE_ID_PATTERN = /^voice(?:key)?_[A-Za-z0-9._-]{4,120}$/;

export function isCustomTtsVoiceId(value: string): boolean {
  return CUSTOM_VOICE_ID_PATTERN.test(value);
}

export function isGeminiTtsVoice(value: string): boolean {
  return VALID_GEMINI_VOICE_IDS.has(value) || isCustomTtsVoiceId(value);
}
