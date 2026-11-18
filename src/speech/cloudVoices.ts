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
    id: "assistant",
    label: "ผู้ช่วยสุภาพ (Javis ปกติ)",
    hint: "คมชัด สุขุม เป็นธรรมชาติ เหมาะกับการทำงานทั่วไป",
    recommendedCloudVoice: null,
    devicePitch: 1,
    sampleText: "สวัสดีครับ ผมคือ Javis ผู้ช่วยของคุณ วันนี้ให้ช่วยเรื่องอะไรดีครับ"
  },
  {
    id: "genz-girl",
    label: "สาวน้อย Gen Z สดใส",
    hint: "เสียงเด็กสาว Leda + ลีลาสดใส ร่าเริง เป็นกันเอง",
    recommendedCloudVoice: "Leda",
    devicePitch: 1.24,
    sampleText: "ฮายยย~ หวัดดีค่า! วันนี้มีอะไรให้เค้าช่วยเช็กหรือสรุปให้ บอกมาได้เลยน้า!"
  },
  {
    id: "upbeat-buddy",
    label: "สายลุยกระฉับกระเฉง",
    hint: "เสียง Zephyr + จังหวะคล่องตัว กระตือรือร้น สั่งงานไว",
    recommendedCloudVoice: "Zephyr",
    devicePitch: 1.08,
    sampleText: "พร้อมลุยแล้วครับ! มีงานด่วนหรือข้อมูลไหนให้ช่วยเช็ก สั่งมาได้เลย!"
  },
  {
    id: "calm-soft",
    label: "นุ่มนวลผ่อนคลาย",
    hint: "เสียง Aoede + น้ำเสียงละมุน ฟังสบาย เหมาะอ่านข่าวหรือบทความยาว ๆ",
    recommendedCloudVoice: "Aoede",
    devicePitch: 0.94,
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
  { id: "Iapetus", label: "Iapetus (ค่าเริ่มต้น)", hint: "คมชัด เป็นธรรมชาติ อ่านภาษาไทยได้ชัดเจน" },
  { id: "Zephyr", label: "Zephyr", hint: "สดใส กระฉับกระเฉง" },
  { id: "Aoede", label: "Aoede", hint: "นุ่มนวล อบอุ่น" },
  { id: "Kore", label: "Kore", hint: "มั่นคง ชัดถ้อยชัดคำ" },
  { id: "Puck", label: "Puck", hint: "ร่าเริง เป็นกันเอง" },
  { id: "Charon", label: "Charon", hint: "ทุ้ม สุขุม" },
  { id: "Fenrir", label: "Fenrir", hint: "กระชับ หนักแน่น" },
  { id: "Leda", label: "Leda", hint: "อ่อนโยน ฟังสบาย" },
  { id: "Orus", label: "Orus" },
  { id: "Callirrhoe", label: "Callirrhoe" },
  { id: "Autonoe", label: "Autonoe" },
  { id: "Enceladus", label: "Enceladus" },
  { id: "Umbriel", label: "Umbriel" },
  { id: "Algieba", label: "Algieba" },
  { id: "Despina", label: "Despina" },
  { id: "Erinome", label: "Erinome" },
  { id: "Algenib", label: "Algenib" },
  { id: "Rasalgethi", label: "Rasalgethi" },
  { id: "Laomedeia", label: "Laomedeia" },
  { id: "Achernar", label: "Achernar" },
  { id: "Alnilam", label: "Alnilam" },
  { id: "Schedar", label: "Schedar" },
  { id: "Gacrux", label: "Gacrux" },
  { id: "Pulcherrima", label: "Pulcherrima" },
  { id: "Achird", label: "Achird" },
  { id: "Zubenelgenubi", label: "Zubenelgenubi" },
  { id: "Vindemiatrix", label: "Vindemiatrix" },
  { id: "Sadachbia", label: "Sadachbia" },
  { id: "Sadaltager", label: "Sadaltager" },
  { id: "Sulafat", label: "Sulafat" }
];

const VALID_GEMINI_VOICE_IDS = new Set(GEMINI_TTS_VOICES.map((voice) => voice.id));

export function isGeminiTtsVoice(value: string): boolean {
  return VALID_GEMINI_VOICE_IDS.has(value);
}
