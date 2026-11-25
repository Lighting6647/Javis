/**
 * คำเรียกชื่อ (wake word) ของโหมดฟังตลอดเวลา: Javis ส่งคำพูดไปถาม AI เฉพาะเมื่อผู้ใช้เรียกชื่อก่อน
 * เสียงโทรทัศน์หรือคนรอบข้างที่ไม่ได้เรียกชื่อจึงไม่ถูกส่งไปและไม่ใช้โควตา
 */

/** คำเรียกชื่อเริ่มต้น เรียงจากยาวไปสั้นไม่จำเป็น ตัวจับคู่เลือกคำที่ยาวที่สุด ณ ตำแหน่งแรกที่พบเอง */
export const DEFAULT_WAKE_PHRASES: readonly string[] = ["hey luna", "ลูน่า", "ลูนา", "luna"];

/** หลังเรียกชื่อแล้วไม่ได้พูดคำสั่งต่อในประโยคเดียวกัน: คำพูดถัดไปที่เริ่มภายในเวลานี้ถือเป็นคำสั่ง */
export const WAKE_WINDOW_MS = 8000;

export interface WakeMatch {
  /** ข้อความที่เหลือหลังคำเรียกชื่อ (สตริงว่างถ้าเรียกชื่ออย่างเดียว) */
  command: string;
}

/**
 * คำที่ระบบฟังของ Chrome มักได้ยินเพี้ยนไปจาก "ลูน่า" นับเป็นการเรียกชื่อด้วย
 * ใช้เฉพาะเมื่อคำเรียกชื่อที่ตั้งไว้มี ลูน่า หรือ ลูนา
 */
const LUNA_MISHEARINGS: readonly string[] = ["ลูนน่า", "ลูนนา", "ลูน้า", "ลูหน้า", "ลูนาร์", "รูน่า", "รูนา", "ลุนา", "ลุน่า", "ลูน่ะ"];

function withMishearings(phrases: readonly string[]): readonly string[] {
  const normalized = phrases.map(normalizeWakeText);
  return normalized.includes("ลูน่า") || normalized.includes("ลูนา") ? [...phrases, ...LUNA_MISHEARINGS] : phrases;
}

/** ตัวอักษรละตินหรือตัวเลข: คำเรียกชื่อภาษาอังกฤษต้องไม่ติดกับตัวอักษรเหล่านี้ เช่น "lunatic" ไม่นับ */
const LATIN_WORD_CHAR = /[a-z0-9]/;

/** เครื่องหมายและช่องว่างที่ตัดทิ้งระหว่างคำเรียกชื่อกับคำสั่ง */
const LEADING_PUNCTUATION = /^[\s,.:;!?\-–—'"“”‘’ๆ]+/u;
const TRAILING_PUNCTUATION = /[\s,.:;!?\-–—'"“”‘’]+$/u;

/** ทำให้ข้อความเทียบกันได้: ตัวพิมพ์เล็ก รูปแบบยูนิโค้ดเดียวกัน และช่องว่างช่องเดียว */
export function normalizeWakeText(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * แปลงรายการคำเรียกชื่อจากการตั้งค่า (คั่นด้วยจุลภาค) ค่าว่างหรือไม่มีคำที่ใช้ได้จะได้ค่าเริ่มต้น
 * @param raw เช่น "ลูน่า, hey luna"
 */
export function parseWakePhrases(raw: string | undefined | null): readonly string[] {
  const phrases = (raw ?? "")
    .split(",")
    .map(normalizeWakeText)
    .filter((phrase) => phrase.length > 0);
  return phrases.length > 0 ? [...new Set(phrases)] : DEFAULT_WAKE_PHRASES;
}

/** คำเรียกชื่อที่ตำแหน่งนี้อยู่ติดกับตัวอักษรละตินอื่นหรือไม่ (ใช้กับคำภาษาอังกฤษเท่านั้น ภาษาไทยไม่เว้นวรรคระหว่างคำ) */
function touchesLatinWord(text: string, start: number, end: number, phrase: string): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";
  const startsLatin = LATIN_WORD_CHAR.test(phrase[0] ?? "");
  const endsLatin = LATIN_WORD_CHAR.test(phrase[phrase.length - 1] ?? "");
  return (startsLatin && LATIN_WORD_CHAR.test(before)) || (endsLatin && LATIN_WORD_CHAR.test(after));
}

/**
 * หาคำเรียกชื่อในข้อความที่ได้ยิน คืนคำสั่งที่ตามหลังคำเรียกชื่อ หรือ null ถ้าไม่ได้เรียกชื่อ
 * เลือกคำเรียกชื่อที่พบก่อนสุด ถ้าพบที่ตำแหน่งเดียวกันหลายคำเลือกคำที่ยาวกว่า ("hey luna" ชนะ "luna")
 * ข้อความก่อนคำเรียกชื่อถูกทิ้ง เพราะมักเป็นเสียงรอบข้างที่ไม่ได้พูดกับ Javis
 */
export function matchWakePhrase(heard: string, phrases: readonly string[] = DEFAULT_WAKE_PHRASES): WakeMatch | null {
  const text = normalizeWakeText(heard);
  if (!text) return null;

  let best: { start: number; end: number } | null = null;
  for (const raw of withMishearings(phrases)) {
    const phrase = normalizeWakeText(raw);
    if (!phrase) continue;

    let from = 0;
    for (;;) {
      const start = text.indexOf(phrase, from);
      if (start < 0) break;
      const end = start + phrase.length;
      if (!touchesLatinWord(text, start, end, phrase)) {
        if (!best || start < best.start || (start === best.start && end > best.end)) best = { start, end };
        break;
      }
      from = start + 1;
    }
  }

  if (!best) return null;
  const command = text.slice(best.end).replace(LEADING_PUNCTUATION, "").trim();
  if (command) return { command };
  // เรียกชื่อไว้ท้ายประโยค เช่น "สวัสดีลูน่า" หรือ "เปิดเพลงหน่อยลูน่า": ทั้งประโยคคือสิ่งที่พูดกับลูน่า
  const before = text.slice(0, best.start).replace(TRAILING_PUNCTUATION, "").trim();
  if (before) return { command: text.slice(0, best.end).trim() };
  return { command: "" };
}

/**
 * ตัวตรวจคำเรียกชื่อแบบฟังเสียงโดยตรง (เช่น Picovoice Porcupine) ที่ทำงานแทนการตรวจจากข้อความที่ได้ยิน
 * เมื่อมีตัวนี้ Javis ไม่เปิดระบบฟังของเบราว์เซอร์ระหว่างรอคำเรียกชื่อเลย
 */
export interface WakeWordDetector {
  /** รอจนได้ยินคำเรียกชื่อ จบเมื่อได้ยิน ล้มเหลวเมื่อตัวตรวจใช้ไม่ได้ หรือเมื่อ signal ถูกยกเลิก */
  waitForWake(signal: AbortSignal): Promise<void>;
}
