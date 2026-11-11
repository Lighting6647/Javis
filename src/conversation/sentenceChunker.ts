import { stripLinks } from "./richText";

/** จบประโยคด้วยเครื่องหมายวรรคตอนตามด้วยช่องว่าง หรือขึ้นบรรทัดใหม่ */
const SENTENCE_END = /[.!?…]+["')\]]*\s+|\n+/;
/** ภาษาไทยไม่มีจุดจบประโยค เมื่อยาวพอจึงตัดที่ช่องว่างซึ่งเป็นจุดเว้นวรรค */
const SOFT_LIMIT = 80;
const MIN_SOFT_CHUNK = 30;
/** ข้อความยาวต่อเนื่องไม่มีช่องว่างเลย ตัดส่งเพื่อไม่ให้เสียงเงียบนาน */
const HARD_LIMIT = 220;

/** ลบลิงก์และสัญลักษณ์จัดรูปแบบที่ไม่ควรถูกอ่านออกเสียง คืนสตริงว่างถ้าไม่เหลือคำให้อ่าน */
export function toSpeakable(text: string): string {
  const cleaned = stripLinks(text)
    .replace(/\(\s*\)/g, "")
    .replace(/[*_#`>|~[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : "";
}

export interface SentenceChunker {
  push(delta: string): void;
  flush(): void;
}

/**
 * รับข้อความที่ทยอยสตรีมเข้ามา แล้วส่งออกทีละประโยคทันทีที่ครบ
 * เพื่อให้เริ่มอ่านออกเสียงได้โดยไม่ต้องรอคำตอบทั้งก้อน
 */
export function createSentenceChunker(emit: (sentence: string) => void): SentenceChunker {
  let buffer = "";

  const cut = (end: number) => {
    const sentence = toSpeakable(buffer.slice(0, end));
    buffer = buffer.slice(end);
    if (sentence) emit(sentence);
  };

  return {
    push(delta) {
      buffer += delta;

      for (;;) {
        const match = SENTENCE_END.exec(buffer);
        if (match) {
          cut(match.index + match[0].length);
          continue;
        }

        if (buffer.length >= SOFT_LIMIT) {
          const space = buffer.lastIndexOf(" ");
          if (space >= MIN_SOFT_CHUNK) {
            cut(space + 1);
            continue;
          }
        }

        if (buffer.length >= HARD_LIMIT) cut(buffer.length);
        break;
      }
    },
    flush() {
      cut(buffer.length);
    }
  };
}
