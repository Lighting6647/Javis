import { useEffect, useRef } from "react";
import type { Phase } from "../../conversation/types";
import { readOutputLevel } from "../../speech/outputMeter";
import { getSessionMeter } from "../../speech/sessionMeter";

/**
 * แถบระดับเสียงขอบขวาของจอ: ตอนฟังวัดจากไมโครโฟน ตอนลูน่าพูดวัดจากเสียงที่เล่นจริง
 * อัปเดต DOM ตรง ๆ ทุก ~80 ms เพื่อไม่ให้ React วาดใหม่ทั้ง Stage
 */
export function VoiceLevelMeter({ phase }: { phase: Phase }) {
  const barRef = useRef<HTMLElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bins = new Float32Array(16);
    let smooth = 0;
    const tick = () => {
      let level = 0;
      if (phase === "listening") {
        const meter = getSessionMeter();
        if (meter && meter.read(bins)) {
          let sum = 0;
          for (let i = 0; i < bins.length; i += 1) sum += bins[i] ?? 0;
          level = Math.min(1, (sum / bins.length) * 2.4);
        }
      } else if (phase === "speaking") {
        level = readOutputLevel() ?? 0;
      }
      smooth += (level - smooth) * (level > smooth ? 0.6 : 0.25);
      const pct = Math.round(smooth * 100);
      if (barRef.current) barRef.current.style.height = `${pct}%`;
      if (pctRef.current) pctRef.current.textContent = `${pct}%`;
    };
    tick();
    const timer = window.setInterval(tick, 80);
    return () => window.clearInterval(timer);
  }, [phase]);

  return (
    <>
      <div className={`hud-voice-meter ${phase}`}>
        <i ref={barRef} />
      </div>
      <span className="hud-voice-pct" ref={pctRef}>
        0%
      </span>
    </>
  );
}
