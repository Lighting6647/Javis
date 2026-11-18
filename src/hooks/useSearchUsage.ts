import { useEffect, useRef, useState } from "react";
import { fetchSearchUsage, type SearchUsageView } from "../services/searchUsage";

/** ถามใหม่ทุก 5 นาที ตรงกับที่เซิร์ฟเวอร์จำยอดของ Tavily ไว้ */
const REFRESH_MS = 5 * 60 * 1000;
/** หลังคำตอบแต่ละครั้ง ถามได้ไม่ถี่กว่านี้ เพื่อให้ตัวเลขความจำผลค้นขยับตามการใช้งานโดยไม่รบกวนเซิร์ฟเวอร์ */
const AFTER_REPLY_MIN_GAP_MS = 10_000;
/** รอให้บทสนทนานิ่งก่อนถาม: ข้อความของผู้ใช้กับคำตอบเพิ่มเข้ามาห่างกันไม่กี่วินาที ถามครั้งเดียวหลังคำตอบพอ */
const SETTLE_MS = 5_000;

/**
 * ยอดใช้การค้นเว็บสำหรับแผงสถานะ ถามเมื่อแอปพร้อม ทุก 5 นาที และหลังคำตอบใหม่
 * @param ready ผู้ใช้เข้าสู่ระบบแล้ว (หรือเซิร์ฟเวอร์ไม่บังคับ) ก่อนนั้นเซิร์ฟเวอร์จะไม่ตอบ
 * @param messageCount จำนวนข้อความในบทสนทนา เปลี่ยนเมื่อมีคำตอบใหม่
 */
export function useSearchUsage(ready: boolean, messageCount: number): SearchUsageView | null {
  const [usage, setUsage] = useState<SearchUsageView | null>(null);
  const lastAsked = useRef(0);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const ask = () => {
      lastAsked.current = Date.now();
      void fetchSearchUsage(controller.signal).then((next) => {
        if (!controller.signal.aborted && next) setUsage(next);
      });
    };
    ask();
    const timer = window.setInterval(ask, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || messageCount === 0) return;
    // ข้อความใหม่เข้ามาก่อนครบเวลา: เลื่อนออกไป ไม่ยกเลิกคำขอที่ส่งไปแล้ว
    const timer = window.setTimeout(() => {
      if (Date.now() - lastAsked.current < AFTER_REPLY_MIN_GAP_MS) return;
      lastAsked.current = Date.now();
      void fetchSearchUsage().then((next) => {
        if (next) setUsage(next);
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [ready, messageCount]);

  return usage;
}
