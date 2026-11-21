/**
 * คำเรียกชื่อ (wake word) ของโหมดฟังตลอดเวลา: Javis ส่งคำพูดไปถาม AI เฉพาะเมื่อผู้ใช้เรียกชื่อก่อน
 * เสียงโทรทัศน์หรือคนรอบข้างที่ไม่ได้เรียกชื่อจึงไม่ถูกส่งไปและไม่ใช้โควตา
 */

/**
 * คำเรียกชื่อเริ่มต้น ตัวจับคู่เลือกคำที่ยาวที่สุด ณ ตำแหน่งแรกที่พบเอง
 * รวมตัวสะกดที่ระบบฟังภาษาไทยของเบราว์เซอร์มักถอดชื่อ "ลูน่า" ผิด (รูน่า ลูหน่า หลูน่า ลูนาร์)
 * วรรณยุกต์และช่องว่างไม่มีผลกับการจับคู่ จึงครอบคลุม ลูน้า ลู่น่า และ "ลู น่า" ด้วย (ดู wakeSkeleton)
 */
export const DEFAULT_WAKE_PHRASES: readonly string[] = ["hey luna", "ลูน่า", "ลูนา", "luna", "รูน่า", "ลูหน่า", "หลูน่า", "ลูนาร์"];

/** หลังเรียกชื่อแล้วไม่ได้พูดคำสั่งต่อในประโยคเดียวกัน: คำพูดถัดไปที่เริ่มภายในเวลานี้ถือเป็นคำสั่ง */
export const WAKE_WINDOW_MS = 8000;

export interface WakeMatch {
  /** ข้อความที่เหลือหลังคำเรียกชื่อ (สตริงว่างถ้าเรียกชื่ออย่างเดียว) */
  command: string;
}

/** ตัวอักษรละตินหรือตัวเลข: คำเรียกชื่อภาษาอังกฤษต้องไม่ติดกับตัวอักษรเหล่านี้ เช่น "lunatic" ไม่นับ */
const LATIN_WORD_CHAR = /[a-z0-9]/;

/** เครื่องหมายและช่องว่างที่ตัดทิ้งระหว่างคำเรียกชื่อกับคำสั่ง */
const LEADING_PUNCTUATION = /^[\s,.:;!?\-–—'"“”‘’ๆ]+/u;

/** ตัวอักษรที่มองไม่เห็น (zero-width) ที่ระบบฟังบางตัวแทรกมา */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;

/** ทำให้ข้อความเทียบกันได้: ตัวพิมพ์เล็ก รูปแบบยูนิโค้ดเดียวกัน ไม่มีอักษรที่มองไม่เห็น และช่องว่างช่องเดียว */
export function normalizeWakeText(text: string): string {
  return text.normalize("NFC").replace(INVISIBLE, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * อักษรที่ไม่นับตอนจับคู่คำเรียกชื่อ: ช่องว่าง วรรณยุกต์ไทย (่ ้ ๊ ๋) และไม้ทัณฑฆาต (์)
 * ระบบฟังมักใส่วรรณยุกต์หรือเว้นวรรคกลางชื่อไม่ตรงกัน เช่น "ลูน้า" "ลู่น่า" "ลู น่า" "lu na"
 */
const IGNORED_FOR_MATCH = /[\s\u0E48-\u0E4C]/;

/** ข้อความที่ตัดอักษรที่ไม่นับออกแล้ว พร้อมตำแหน่งในข้อความเดิมของอักษรแต่ละตัวที่เหลือ */
interface WakeSkeleton {
  text: string;
  positions: number[];
}

/** ทำโครงของข้อความสำหรับจับคู่คำเรียกชื่อ (ข้อความต้องผ่าน normalizeWakeText แล้ว) */
export function wakeSkeleton(text: string): WakeSkeleton {
  let skeleton = "";
  const positions: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (IGNORED_FOR_MATCH.test(char)) continue;
    skeleton += char;
    positions.push(index);
  }
  return { text: skeleton, positions };
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
 * จับคู่บนโครงของข้อความ (ไม่สนช่องว่างและวรรณยุกต์) แล้วตัดคำสั่งจากข้อความเดิม
 * เลือกคำเรียกชื่อที่พบก่อนสุด ถ้าพบที่ตำแหน่งเดียวกันหลายคำเลือกคำที่ยาวกว่า ("hey luna" ชนะ "luna")
 * ข้อความก่อนคำเรียกชื่อถูกทิ้ง เพราะมักเป็นเสียงรอบข้างที่ไม่ได้พูดกับผู้ช่วย
 */
export function matchWakePhrase(heard: string, phrases: readonly string[] = DEFAULT_WAKE_PHRASES): WakeMatch | null {
  const text = normalizeWakeText(heard);
  if (!text) return null;
  const skeleton = wakeSkeleton(text);

  let best: { start: number; end: number } | null = null;
  for (const raw of phrases) {
    const phrase = wakeSkeleton(normalizeWakeText(raw)).text;
    if (!phrase) continue;

    let from = 0;
    for (;;) {
      const found = skeleton.text.indexOf(phrase, from);
      if (found < 0) break;
      // ตำแหน่งในข้อความเดิม: ตั้งแต่อักษรตัวแรกที่ตรง ถึงหลังอักษรตัวสุดท้ายที่ตรง
      const start = skeleton.positions[found]!;
      let end = skeleton.positions[found + phrase.length - 1]! + 1;
      // วรรณยุกต์หรือไม้ทัณฑฆาตที่ตามหลังอักษรตัวสุดท้ายเป็นส่วนของชื่อ ("ลูนาร์") ไม่ใช่ส่วนของคำสั่ง
      while (end < text.length && /[\u0E48-\u0E4C]/.test(text[end]!)) end += 1;
      if (!touchesLatinWord(text, start, end, phrase)) {
        if (!best || start < best.start || (start === best.start && end > best.end)) best = { start, end };
        break;
      }
      from = found + 1;
    }
  }

  if (!best) return null;
  return { command: text.slice(best.end).replace(LEADING_PUNCTUATION, "").trim() };
}

/**
 * ตัวตรวจคำเรียกชื่อแบบฟังเสียงโดยตรง (เช่น Picovoice Porcupine) ที่ทำงานแทนการตรวจจากข้อความที่ได้ยิน
 * เมื่อมีตัวนี้ Javis ไม่เปิดระบบฟังของเบราว์เซอร์ระหว่างรอคำเรียกชื่อเลย
 */
export interface WakeWordDetector {
  /** รอจนได้ยินคำเรียกชื่อ จบเมื่อได้ยิน ล้มเหลวเมื่อตัวตรวจใช้ไม่ได้ หรือเมื่อ signal ถูกยกเลิก */
  waitForWake(signal: AbortSignal): Promise<void>;
}
