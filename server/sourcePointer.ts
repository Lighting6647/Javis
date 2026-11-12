import { MAX_RESULT_CONTENT_LENGTH, type WebSearchResult } from "./webSearch.js";

/**
 * ชี้ผู้ใช้ไปยังหน้าเว็บที่มีคำตอบ: เลือกแหล่งจากผลค้นที่ตรงกับคำตอบที่สุด และวลีในแหล่งนั้นที่ตรงกับสิ่งที่ตอบ
 * แล้วใส่วลีไว้ท้ายที่อยู่เว็บ (text fragment) ให้เบราว์เซอร์เลื่อนไปและไฮไลต์เอง
 *
 * ข้อเท็จจริงของเบราว์เซอร์ที่โค้ดนี้ยึด (ทดลองกับ Chromium เมื่อ 2026-11-12):
 * - วลีต้องเป็นข้อความต่อเนื่องในหน้าเว็บ เริ่มและจบที่ขอบคำ และเว้นวรรคตรงกัน ไม่เช่นนั้นหาไม่เจอ ภาษาไทยก็ต้องตัดที่ขอบคำ
 * - เบราว์เซอร์ไฮไลต์ให้เมื่อผู้ใช้แตะลิงก์เอง หรือเมื่อเปิดแท็บใหม่แบบ noopener ในจังหวะที่ยังมีการแตะของผู้ใช้
 *   แท็บที่สคริปต์เปิดเองโดยไม่มีการแตะ (เช่นคำสั่งเสียง) เปิดได้แต่ไม่ถูกไฮไลต์ และถ้าหาวลีไม่เจอ หน้าเว็บก็เปิดตามปกติ
 */

/** ยิ่งสั้นยิ่งมีโอกาสตรงกับข้อความจริงในหน้าเว็บ แต่ต้องยาวพอให้ไม่ไปตรงกับที่อื่นในหน้า */
export const MAX_PASSAGE_LENGTH = 60;
const MIN_PASSAGE_LENGTH = 8;
/** จำนวนชุดอักขระสามตัวที่ต้องตรงกับคำตอบอย่างน้อย จึงจะถือว่าวลีนั้นคือสิ่งที่ตอบ */
const MIN_SHARED = 5;
/** สัดส่วนขั้นต่ำของวลีที่ต้องตรงกับคำตอบ กันวลียาวที่ตรงแค่ปลายเดียว */
const MIN_SHARED_RATIO = 0.3;
/** วลีที่มีตัวเลขเดียวกับคำตอบ (ราคา จำนวน ปี) คือจุดที่ตอบ จึงมาก่อนวลีที่ตรงแค่ถ้อยคำ */
const SHARED_NUMBER_BONUS = 100;

/** คำที่เป็นคำสั่งให้ค้นโดยตรง ไม่ว่าจะอยู่ตรงไหนของประโยค */
const SEARCH_VERBS = /ค้นหา|ค้นข้อมูล|สืบค้น|เสิร์ช|เซิร์ช|หาข้อมูล|\bsearch\b|\blook\s?up\b/i;
/** "หา...ให้หน่อย" ที่ขึ้นต้นประโยค (อาจมีคำเรียกหรือคำสุภาพนำหน้า) ต่างจาก "หาแฟนยังไงดี" ซึ่งเป็นคำถาม */
const FIND_REQUEST = /^(?:ช่วย|รบกวน|ขอ|กรุณา|จาวิส|javis|\s)*หา.+(?:ให้|หน่อย|ที|ด้วย)(?:ครับ|ค่ะ|คะ|นะ|จ้า|\s)*$/i;

/**
 * ผู้ใช้สั่งให้หาหรือค้นหา (ต่างจากการถามคำถามที่ต้องใช้ข้อมูลล่าสุด)
 * ใช้ตัดสินว่าจะเปิดหน้าแหล่งข้อมูลให้เองหรือแค่แนบลิงก์ ตัดสินผิดจึงไม่เสียหาย: ได้แท็บเกินมาหนึ่ง หรือต้องแตะลิงก์เอง
 */
export function isFindCommand(text: string): boolean {
  const said = text.trim();
  return SEARCH_VERBS.test(said) || FIND_REQUEST.test(said);
}

/**
 * ใส่วลีไว้ท้ายที่อยู่เว็บ ให้เบราว์เซอร์เลื่อนไปยังวลีนั้นและไฮไลต์
 * ขีด จุลภาค และ & มีความหมายพิเศษในคำสั่งนี้ จึงต้องเข้ารหัส (encodeURIComponent ไม่เข้ารหัสขีดให้)
 */
export function withTextFragment(url: string, passage: string): string {
  const text = passage.trim();
  if (!text || url.includes(":~:")) return url;

  const directive = `:~:text=${encodeURIComponent(text).replace(/-/g, "%2D")}`;
  return url.includes("#") ? `${url}${directive}` : `${url}#${directive}`;
}

/** ตัวคั่นระหว่างท่อนของเนื้อหา: ท่อนที่ต่อกันอาจมาจากคนละส่วนของหน้าเว็บ วลีจึงต้องไม่คร่อมตัวคั่น */
const BLOCK_SEPARATOR = /\s*(?:\.{3,}|…)\s*|\s+[|•·–—-]\s+/gu;
const NUMBER = /\d[\d,]*\d|\d/g;

/** ตัวอักษร ตัวเลข และสระวรรณยุกต์ ติดกันเป็นสายเดียว ใช้เทียบถ้อยคำโดยไม่สนวรรคตอนและตัวพิมพ์ */
const comparable = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");

function trigramsOf(text: string): Set<string> {
  const plain = comparable(text);
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= plain.length; index += 1) grams.add(plain.slice(index, index + 3));
  return grams;
}

/** ตัวเลขตั้งแต่สองหลักในข้อความ โดยไม่สนจุลภาคคั่นหลักพัน */
const numbersOf = (text: string) => new Set((text.match(NUMBER) ?? []).map((number) => number.replace(/,/g, "")).filter((number) => number.length >= 2));

interface Scored {
  passage: string;
  score: number;
}

/** วลีในเนื้อหาที่ตรงกับคำตอบที่สุด พร้อมคะแนน คืน null ถ้าไม่มีวลีใดตรงพอ */
function bestPassage(answer: string, content: string): Scored | null {
  const answerGrams = trigramsOf(answer);
  if (answerGrams.size === 0 || !content.trim()) return null;
  const answerNumbers = numbersOf(answer);

  // ตัดคำด้วยตัวตัดคำเดียวกับที่เบราว์เซอร์ใช้ วลีที่เริ่มและจบตรงขอบคำเท่านั้นที่เบราว์เซอร์หาเจอ
  let words = [...new Intl.Segmenter("th", { granularity: "word" }).segment(content)]
    .filter((segment) => segment.isWordLike)
    .map(({ index, segment }) => ({ start: index, end: index + segment.length }));
  // เนื้อหาที่ยาวถึงเพดานถูกตัดท้ายมา คำสุดท้ายจึงอาจไม่ครบคำ
  if (content.length >= MAX_RESULT_CONTENT_LENGTH) words = words.slice(0, -1);

  const separators = [...content.matchAll(BLOCK_SEPARATOR)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
  const crossesSeparator = (start: number, end: number) => separators.some((separator) => separator.start < end && separator.end > start);

  let best: Scored | null = null;
  for (let first = 0; first < words.length; first += 1) {
    const start = (words[first] as { start: number }).start;

    for (let last = first; last < words.length; last += 1) {
      const end = (words[last] as { end: number }).end;
      if (end - start > MAX_PASSAGE_LENGTH || crossesSeparator(start, end)) break;
      if (end - start < MIN_PASSAGE_LENGTH) continue;

      const passage = content.slice(start, end);
      const grams = trigramsOf(passage);
      let shared = 0;
      for (const gram of grams) if (answerGrams.has(gram)) shared += 1;
      if (shared < MIN_SHARED || shared / grams.size < MIN_SHARED_RATIO) continue;

      let sharedNumbers = 0;
      for (const number of numbersOf(passage)) if (answerNumbers.has(number)) sharedNumbers += 1;
      // ตรงมากและไม่มีส่วนเกินได้คะแนนสูง: วลีที่พอดีกับสิ่งที่ตอบชนะวลียาวที่พ่วงเรื่องอื่นมาด้วย
      const score = sharedNumbers * SHARED_NUMBER_BONUS + (shared * shared) / grams.size;
      if (!best || score > best.score) best = { passage, score };
    }
  }
  return best;
}

/**
 * เลือกวลีจากเนื้อหาของแหล่งข้อมูลที่ตรงกับคำตอบที่สุด สำหรับให้เบราว์เซอร์ไฮไลต์
 * คืน null เมื่อไม่มีวลีใดตรงพอ เพราะการชี้ผิดที่แย่กว่าการไม่ชี้
 */
export function pickPassage(answer: string, content: string): string | null {
  return bestPassage(answer, content)?.passage ?? null;
}

export interface SourcePointer {
  /** ที่อยู่ของหน้าแหล่งข้อมูล พร้อมคำสั่งไฮไลต์เมื่อเลือกวลีได้ */
  url: string;
  title: string;
}

/**
 * เลือกหน้าที่จะพาผู้ใช้ไปดู จากผลค้นที่ใช้ตอบ: แหล่งที่เนื้อหาตรงกับคำตอบที่สุด และวลีที่ตรงในแหล่งนั้น
 * ถ้าไม่มีแหล่งใดตรงกับคำตอบ ใช้แหล่งอันดับแรกของผลค้นโดยไม่ชี้วลี
 * เซิร์ฟเวอร์เป็นผู้เลือกจากรายการผลค้นเท่านั้น เนื้อหาเว็บจึงพาไปหน้าอื่นนอกผลค้นไม่ได้
 */
export function pointToSource(answer: string, results: readonly WebSearchResult[]): SourcePointer | null {
  let chosen: { result: WebSearchResult; passage: string | null; score: number } | null = null;
  for (const result of results) {
    const scored = bestPassage(answer, result.content);
    // คะแนนเท่ากันใช้แหล่งที่อันดับดีกว่า ซึ่งมาก่อนในรายการ
    if (scored && (!chosen || scored.score > chosen.score)) chosen = { result, passage: scored.passage, score: scored.score };
  }

  const fallback = results[0];
  if (!chosen && !fallback) return null;
  const { result, passage } = chosen ?? { result: fallback as WebSearchResult, passage: null };
  return { title: result.title, url: passage ? withTextFragment(result.url, passage) : result.url };
}
