import { useCallback, useSyncExternalStore } from "react";
import { cloudVoiceStore } from "../services/aiStatusStore";
import { CloudVoiceSynthesizer } from "../speech/cloudVoice";
import type { SpeechSynthesizer } from "../speech/types";

/** คำตอบจะไม่มีเสียงเลยตอนนี้ไหม (เสียงของ Gemini ใช้ไม่ได้ และอุปกรณ์ไม่มีเสียงภาษาไทย) ใช้แจ้งผู้ใช้แทนการเงียบไปเฉย ๆ */
export function useVoiceSilent(synthesizer: SpeechSynthesizer): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const stops = [cloudVoiceStore.subscribe(listener)];
      if (synthesizer instanceof CloudVoiceSynthesizer) stops.push(synthesizer.subscribe(listener));
      return () => stops.forEach((stop) => stop());
    },
    [synthesizer]
  );
  const read = useCallback(() => synthesizer instanceof CloudVoiceSynthesizer && synthesizer.isSilent(), [synthesizer]);
  return useSyncExternalStore(subscribe, read);
}
