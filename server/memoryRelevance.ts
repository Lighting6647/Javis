/**
 * เลือกความจำที่เกี่ยวกับคำถาม เมื่อผู้ใช้มีความจำมากเกิน 20 เรื่อง
 * ทำในเครื่องทั้งหมด (ตัดคำภาษาไทยด้วย Intl.Segmenter + เทียบตัวอักษรสองตัวติดกัน) ไม่เรียก API ที่มีค่าใช้จ่าย
 */

export interface RelevanceMemory {
  id: string;
  text: string;
}

/** ความจำไม่เกินนี้ส่งทั้งหมดตามเดิม */
export const RELEVANCE_THRESHOLD = 20;
/** ความจำที่ส่งไปมากสุดเมื่อต้องเลือก */
export const MAX_SELECTED_MEMORIES = 15;
const MAX_PROFILE_MEMORIES = 5;
const RECENT_MEMORIES = 3;
/** คะแนนต่ำกว่านี้ถือว่าไม่เกี่ยว (ตัวอักษรตรงกันบังเอิญ) */
const MIN_SCORE = 0.12;

/**
 * ความจำพื้นฐานที่ใช้กับทุกคำตอบ: ชื่อหรือวิธีเรียกผู้ใช้ และวิธีตอบที่ผู้ใช้ต้องการ
 * ส่งเสมอแม้คำถามไม่ได้พูดถึง เพื่อให้คำตอบยังเป็นแบบที่ผู้ใช้ขอไว้
 */
const PROFILE_PATTERN = /ชื่อ|เรียก(?:ว่า|ผู้ใช้)|สรรพนาม|ชอบ(?:ให้)?(?:ตอบ|คำตอบ)|อยากให้ตอบ|ตอบสั้น|ตอบยาว|ภาษา|\bname\b|call me/i;

/** คำทั่วไปที่ไม่ช่วยบอกหัวข้อ */
const STOPWORDS = new Set(
  (
    "ผู้ ใช้ ผม ฉัน เรา คุณ เขา มัน คือ เป็น อยู่ มี ที่ และ หรือ แต่ ของ ให้ ได้ ไหม มั้ย ครับ ค่ะ คะ จ้ะ นะ จะ ไป มา แล้ว ก็ " +
    "อะไร ยังไง อย่างไร ทำไม เมื่อไร เมื่อไหร่ ที่ไหน ช่วย หน่อย ด้วย บ้าง กับ ใน จาก ถึง ว่า นี้ นั้น โดย เพราะ ถ้า " +
    "ตอน วัน นี่ เลย ยัง ควร อยาก ต้อง กำลัง เคย the a an is are to of and or in on for my me i you"
  ).split(" ")
);

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("th", { granularity: "word" }) : null;

/** ตัดคำ (ภาษาไทยและอังกฤษ) ตัดคำทั่วไปและเครื่องหมายออก */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = segmenter
    ? [...segmenter.segment(lower)].filter((part) => part.isWordLike).map((part) => part.segment)
    : lower.split(/[^\p{L}\p{N}]+/u);
  return words.map((word) => word.trim()).filter((word) => word.length > 0 && !STOPWORDS.has(word));
}

/** ตัวอักษรสองตัวติดกัน ใช้จับคำที่สะกดต่างกันเล็กน้อยหรือตัดคำไม่ตรงกัน */
function bigrams(text: string): Set<string> {
  const compact = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const grams = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) grams.add(compact.slice(index, index + 2));
  return grams;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * คะแนนความเกี่ยวข้องของความจำแต่ละเรื่องกับคำถาม (0 ขึ้นไป)
 * คำที่ตรงกันได้น้ำหนักตามความหายาก (คำที่อยู่ในความจำแทบทุกเรื่องได้น้ำหนักน้อย) บวกความคล้ายของตัวอักษร
 */
export function scoreMemories(memories: readonly RelevanceMemory[], query: string): number[] {
  const queryTokens = new Set(tokenize(query));
  const queryGrams = bigrams(query);
  const memoryTokens = memories.map((memory) => new Set(tokenize(memory.text)));
  const documentFrequency = new Map<string, number>();
  for (const tokens of memoryTokens) for (const token of tokens) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);

  return memories.map((memory, index) => {
    const tokens = memoryTokens[index] ?? new Set<string>();
    let weighted = 0;
    let possible = 0;
    for (const token of tokens) {
      const idf = Math.log(1 + memories.length / (documentFrequency.get(token) ?? 1));
      possible += idf;
      if (queryTokens.has(token)) weighted += idf;
    }
    const wordScore = possible > 0 ? weighted / possible : 0;
    return wordScore + 0.5 * overlap(bigrams(memory.text), queryGrams) * (wordScore > 0 ? 1 : 0.6);
  });
}

/**
 * ความจำที่จะส่งให้ AI พร้อมคำถามนี้: ถ้าไม่เกิน 20 เรื่องส่งทั้งหมด
 * ถ้าเกิน ส่งความจำพื้นฐาน (ชื่อ วิธีตอบ) เรื่องที่เกี่ยวกับคำถาม และเรื่องที่จำล่าสุดไม่กี่เรื่อง รวมไม่เกิน 15 เรื่อง เรียงตามลำดับเดิม
 * @param query ข้อความล่าสุดของผู้ใช้ (รวมข้อความก่อนหน้าได้ เพื่อจับคำถามต่อเนื่อง)
 */
export function selectRelevantMemories<T extends RelevanceMemory>(memories: readonly T[] | undefined, query: string): T[] {
  const all = memories ?? [];
  if (all.length <= RELEVANCE_THRESHOLD) return [...all];

  const scores = scoreMemories(all, query);
  const chosen = new Set<number>();
  all.forEach((memory, index) => {
    if (chosen.size < MAX_PROFILE_MEMORIES && PROFILE_PATTERN.test(memory.text)) chosen.add(index);
  });

  const ranked = scores
    .map((score, index) => ({ score, index }))
    .filter((entry) => entry.score >= MIN_SCORE && !chosen.has(entry.index))
    .sort((a, b) => b.score - a.score || b.index - a.index);
  for (const entry of ranked) {
    if (chosen.size >= MAX_SELECTED_MEMORIES - RECENT_MEMORIES) break;
    chosen.add(entry.index);
  }
  // เรื่องล่าสุดช่วยบทสนทนาต่อเนื่อง เช่น เพิ่งจำไปเมื่อครู่แล้วถามต่อ
  for (let index = all.length - 1; index >= 0 && chosen.size < MAX_SELECTED_MEMORIES; index -= 1) {
    if (all.length - index > RECENT_MEMORIES) break;
    chosen.add(index);
  }
  return [...chosen].sort((a, b) => a - b).map((index) => all[index] as T);
}
