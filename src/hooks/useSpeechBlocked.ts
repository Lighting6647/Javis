import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { SpeechSynthesizer } from "../speech/types";

const neverChanges = (): (() => void) => () => undefined;

/**
 * เบราว์เซอร์ยังไม่ยอมให้ Javis พูดอยู่ไหม (ผู้ใช้ยังไม่ได้แตะหรือกดอะไรบนหน้านี้เลย)
 * เกิดได้ในโหมดฟังตลอดเวลา ซึ่งเริ่มฟังเองตั้งแต่เปิดหน้า เมื่อเป็นเช่นนั้น คำตอบยังขึ้นเป็นข้อความตามปกติ
 * และทันทีที่ผู้ใช้แตะหรือกดอะไรก็ตาม จะเตรียมเสียงอีกครั้งในจังหวะนั้นเพื่อให้คำตอบถัดไปออกเสียงได้
 */
export function useSpeechBlocked(synthesizer: SpeechSynthesizer): boolean {
  const subscribe = useCallback((listener: () => void) => synthesizer.onBlockedChange?.(listener) ?? neverChanges(), [synthesizer]);
  const blocked = useSyncExternalStore(subscribe, () => synthesizer.isBlocked?.() ?? false);

  useEffect(() => {
    if (!blocked) return;

    const unlock = () => void synthesizer.prepare().catch(() => false);
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [blocked, synthesizer]);

  return blocked;
}
