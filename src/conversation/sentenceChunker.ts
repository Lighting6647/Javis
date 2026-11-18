import { stripLinks } from "./richText";

/** จบประโยคด้วยเครื่องหมายวรรคตอนตามด้วยช่องว่าง หรือขึ้นบรรทัดใหม่ */
const SENTENCE_END = /[.!?…]+["')\]]*\s+|\n+/;
/** ภาษาไทยไม่มีจุดจบประโยค: ช่วงแรกส่งเร็วขึ้นเพื่อลดเวลารอเสียงพูดบนมือถือ แล้วค่อยใช้ช่วงปกติ */
const FIRST_SOFT_LIMIT = 44;
const FIRST_MIN_CHUNK = 22;
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
  let emitted = 0;

  const cut = (end: number) => {
    const sentence = toSpeakable(buffer.slice(0, end));
    buffer = buffer.slice(end);
    if (sentence) {
      emitted += 1;
      emit(sentence);
    }
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

        const softLimit = emitted === 0 ? FIRST_SOFT_LIMIT : SOFT_LIMIT;
        const minChunk = emitted === 0 ? FIRST_MIN_CHUNK : MIN_SOFT_CHUNK;
        if (buffer.length >= softLimit) {
          const space = buffer.lastIndexOf(" ");
          if (space >= minChunk) {
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
