import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Phase } from "../../conversation/types";
import { micLevelStore } from "../../services/micLevelStore";
import { getSessionMeter } from "../../speech/sessionMeter";

interface VoiceWaveformProps {
  phase: Phase;
  offline?: boolean;
  thinkHard?: boolean;
}

const BAR_WEIGHTS = [0.22, 0.34, 0.46, 0.58, 0.72, 0.86, 0.94, 1, 0.94, 0.86, 0.72, 0.58, 0.46, 0.34, 0.22];

function resolveThaiPhaseLabel(phase: Phase, offline: boolean, thinkHard: boolean): string {
  if (offline) return "ระบบ AI ออฟไลน์";
  switch (phase) {
    case "starting":
      return "กำลังเตรียมไมโครโฟน";
    case "listening":
      return "กำลังฟังอยู่";
    case "thinking":
      return thinkHard ? "กำลังคิดลึก" : "กำลังคิดคำตอบ";
    case "speaking":
      return "กำลังพูดตอบ";
    case "idle":
    default:
      return "พร้อมรับคำสั่งเสียง";
  }
}

/**
 * แถบคลื่นเสียงแนวนอนใต้แกนพลังงาน (Audio Waveform) พร้อมป้ายสถานะภาษาไทยล้วน
 * อ่านค่าเสียงจริงจากไมโครโฟนเมื่อกำลังฟังโดยไม่กระตุก React render
 */
export function VoiceWaveform({ phase, offline = false, thinkHard = false }: VoiceWaveformProps) {
  const micAvailable = useSyncExternalStore(micLevelStore.subscribe, micLevelStore.get);
  const barsRef = useRef<HTMLDivElement>(null);
  const label = resolveThaiPhaseLabel(phase, offline, thinkHard);

  useEffect(() => {
    const container = barsRef.current;
    const meter = phase === "listening" && micAvailable ? getSessionMeter() : null;
    if (!container || !meter) return;

    const bars = [...container.querySelectorAll<HTMLSpanElement>(".voice-waveform-bar")];
    const levels = new Float32Array(bars.length);
    let rafId = 0;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (!meter.read(levels)) return;
      bars.forEach((bar, index) => {
        const weight = BAR_WEIGHTS[index] ?? 0.5;
        const level = levels[index] ?? 0;
        const heightPct = Math.round(18 + Math.min(1, level * 1.4) * weight * 82);
        bar.style.height = `${heightPct}%`;
      });
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, micAvailable]);

  return (
    <div className={`voice-waveform ${phase}${offline ? " offline" : ""}${thinkHard ? " think-hard" : ""}`} aria-hidden>
      <div className="voice-waveform-bars" ref={barsRef}>
        {BAR_WEIGHTS.map((weight, index) => {
          const heightPct = Math.round(18 + weight * (phase === "speaking" ? 74 : phase === "thinking" ? 56 : 22));
          return (
            <span
              key={index}
              className="voice-waveform-bar"
              style={{
                height: `${heightPct}%`,
                animationDelay: `${index * 65}ms`
              }}
            />
          );
        })}
      </div>
      <div className="voice-waveform-label">
        <span>{label}</span>
        {thinkHard && !offline && <em className="think-hard-badge">โหมดคิดลึก</em>}
      </div>
    </div>
  );
}
