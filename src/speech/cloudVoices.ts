export interface GeminiVoiceOption {
  id: string;
  label: string;
  hint?: string;
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
