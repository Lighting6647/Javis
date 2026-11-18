import { useCallback, useSyncExternalStore } from "react";
import { cloudVoiceStore } from "../services/aiStatusStore";
import { CloudVoiceSynthesizer, type CloudVoiceStatus } from "../speech/cloudVoice";
import type { SpeechSynthesizer } from "../speech/types";

function serializeStatus(status: CloudVoiceStatus | null): string {
  if (!status) return "none";
  if (status.mode === "paused") return `paused:${status.reason}:${status.until}`;
  return status.mode;
}

function parseStatusKey(key: string): CloudVoiceStatus | null {
  if (key === "none") return null;
  if (key === "active" || key === "off" || key === "unavailable") return { mode: key };
  const [, reason, until] = key.split(":");
  return {
    mode: "paused",
    reason: (reason as Extract<CloudVoiceStatus, { mode: "paused" }>["reason"]) ?? "failed",
    until: Number(until) || 0
  };
}

/**
 * ติดตามสถานะเสียงพูดของ Gemini แบบเรียลไทม์จากทั้งตัวพูด (พักชั่วคราว/ปิด) และเซิร์ฟเวอร์ (/api/status)
 */
export function useCloudVoiceStatus(synthesizer: SpeechSynthesizer): CloudVoiceStatus | null {
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubServer = cloudVoiceStore.subscribe(listener);
      const unsubSynth = synthesizer instanceof CloudVoiceSynthesizer ? synthesizer.subscribe(listener) : () => undefined;
      return () => {
        unsubServer();
        unsubSynth();
      };
    },
    [synthesizer]
  );

  const getSnapshot = useCallback(
    () => serializeStatus(synthesizer instanceof CloudVoiceSynthesizer ? synthesizer.status() : null),
    [synthesizer]
  );

  const key = useSyncExternalStore(subscribe, getSnapshot);
  return parseStatusKey(key);
}
