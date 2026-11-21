import { useSyncExternalStore } from "react";
import type { Phase } from "../../conversation/types";
import type { Readout } from "../../hooks/useHudTelemetry";
import { hudEffectsStore } from "../../services/hudEffectsStore";
import { micLevelStore } from "../../services/micLevelStore";
import { themeStore } from "../../services/themeStore";
import { ArcCore } from "./ArcCore";
import { HudClock } from "./HudClock";
import { NeuralSphere } from "./NeuralSphere";
import { OrbitalEnergyCore } from "./OrbitalEnergyCore";
import { Reactor3D } from "./Reactor3D";
import { Telemetry } from "./Telemetry";
import { VoiceWaveform } from "./VoiceWaveform";

interface StageProps {
  /** จังหวะปัจจุบัน ขับการเคลื่อนไหวและสีของแกนกลาง */
  phase: Phase;
  statusLabel: string;
  readouts: Readout[];
  /** มีบทสนทนาแล้ว: บนจอแคบให้ย่อเป็นแถบเดียว เพื่อเหลือที่ให้ข้อความ */
  compact: boolean;
  /** บริการ AI ใช้งานไม่ได้: แกนกลางเปลี่ยนเป็นสีเตือน */
  offline: boolean;
  /** ซ่อนค่าสถิติบนแผงตัวเลขเพื่อความเป็นส่วนตัว */
  metricsHidden?: boolean;
  /** ชื่อแพลตฟอร์มที่กำลังทำงาน เช่น เว็บ แอปเดสก์ท็อป */
  platformLabel?: string;
  /** โหมดคิดลึก: ใช้ reasoning ระดับสูงในการวิเคราะห์ */
  thinkHard?: boolean;
}

/**
 * แผงควบคุมหลักของ Javis Studio: แกนกลางโครงข่ายประสาทที่ขยับตามจังหวะสนทนา สถานะปัจจุบัน และแผงตัวเลขของระบบ
 * อยู่บนจอตลอด (ด้านซ้ายบนจอกว้าง ด้านบนบนจอแคบ)
 * แสดงเฉพาะในธีมโฮโลแกรม ธีมเรียบซ่อนไว้ด้วย CSS
 */
export function Stage({
  phase,
  statusLabel,
  readouts,
  compact,
  offline,
  metricsHidden = false,
  platformLabel,
  thinkHard = false
}: StageProps) {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get);
  const micLevels = useSyncExternalStore(micLevelStore.subscribe, micLevelStore.get);
  const hudVisual = useSyncExternalStore(hudEffectsStore.subscribe, hudEffectsStore.get);
  const drawing = phase === "listening" && theme === "holo" && micLevels;

  return (
    <aside
      className={`stage${compact ? " compact" : ""}${offline ? " offline" : ""}${thinkHard ? " think-hard" : ""}`}
      data-phase={phase}
      aria-label="แผงสถานะของจาร์วิส"
    >
      <div className="stage-identity" aria-hidden>
        <span className="stage-id-code">J.A.R.V.I.S.</span>
        <span className="stage-id-sub">{platformLabel ? `ระบบ · ${platformLabel}` : "ระบบผู้ช่วยเสียงภาษาไทย"}</span>
      </div>

      <div className={`core hero ${phase}`} aria-hidden>
        <Reactor3D
          phase={phase}
          offline={offline}
          thinkHard={thinkHard}
          accent={hudVisual.accent}
          style={hudVisual.style}
          fallback={<OrbitalEnergyCore phase={phase} offline={offline} thinkHard={thinkHard} />}
        />
        <NeuralSphere phase={phase} offline={offline} compact={compact} />
        <ArcCore drawing={drawing} />
        <span className="core-sweep" />
        <span className="core-heart" />
      </div>

      <VoiceWaveform phase={phase} offline={offline} thinkHard={thinkHard} />

      {/* แผงสถานะมินิมอลขอบซ้ายและแถบระดับเสียงขอบขวา (แสดงเฉพาะโหมดเต็มจอแบบเดียวกับ localhost:5173) */}
      {!compact && (
        <>
          <div className="hud-side-systems" aria-hidden>
            <span className="hud-side-title">ระบบ</span>
            <ul>
              <li className={offline ? "warn" : "on"}><i /> จาร์วิส</li>
              <li className={phase === "speaking" || phase === "listening" ? "on" : ""}><i /> เสียงพูด</li>
              <li className={thinkHard ? "on" : ""}><i /> คิดลึก</li>
              <li className="on"><i /> เว็บในแอป</li>
            </ul>
          </div>
          <div className="hud-side-voice" aria-hidden>
            <span className="hud-side-title">ระดับเสียง</span>
            <div className={`hud-voice-meter ${phase}`}>
              <i />
            </div>
            <span className="hud-voice-pct">
              {phase === "speaking" ? "72%" : phase === "listening" ? "58%" : phase === "thinking" ? "34%" : "0%"}
            </span>
          </div>
        </>
      )}

      {/* สถานะเดียวกับป้ายบนแถบบนซึ่งโปรแกรมอ่านหน้าจออ่านอยู่แล้ว ตรงนี้จึงเป็นภาพอย่างเดียว */}
      <div className="stage-status" aria-hidden>
        <span className="stage-kicker">จาร์วิส · ศูนย์สั่งการด้วยเสียง</span>
        <strong>{statusLabel}</strong>
        <HudClock />
      </div>

      <div className="stage-traces" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <Telemetry readouts={readouts} masked={metricsHidden} />
    </aside>
  );
}
