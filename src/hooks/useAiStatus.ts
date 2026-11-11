import { useEffect, useSyncExternalStore } from "react";
import { aiStatusStore, describeAiProblem, type AiProblem } from "../services/aiStatusStore";

/**
 * ติดตามสถานะบัญชี AI ของเซิร์ฟเวอร์ระหว่างที่ผู้ใช้อยู่ในแอป
 * @param enabled เริ่มติดตามเมื่อผู้ใช้เข้าใช้งานได้แล้ว
 * @param usesServerTranscription อุปกรณ์นี้ส่งเสียงไปแปลงบนเซิร์ฟเวอร์หรือไม่ (แอปเดสก์ท็อป)
 */
export function useAiStatus(enabled: boolean, usesServerTranscription: boolean): {
  problem: AiProblem | null;
  recheck: () => Promise<void>;
} {
  const status = useSyncExternalStore(aiStatusStore.subscribe, aiStatusStore.get);

  useEffect(() => {
    if (!enabled) return;
    return aiStatusStore.watch();
  }, [enabled]);

  return {
    problem: enabled ? describeAiProblem(status, usesServerTranscription) : null,
    recheck: aiStatusStore.refresh
  };
}
