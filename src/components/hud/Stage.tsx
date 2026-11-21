import { useSyncExternalStore } from "react";
import type { Phase } from "../../conversation/types";
import type { Readout } from "../../hooks/useHudTelemetry";
import { micLevelStore } from "../../services/micLevelStore";
import { themeStore } from "../../services/themeStore";
import { ArcCore } from "./ArcCore";
import { HudClock } from "./HudClock";
import { NeuralSphere } from "./NeuralSphere";
import { OrbitalEnergyCore } from "./OrbitalEnergyCore";
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
  /** กำลังฟังเพื่อรอคำเรียกชื่อ (ยังไม่ส่งคำพูดไปถาม AI) */
  waitingForWake?: boolean;
}

/**
 * แผงควบคุมหลักของ Javis Studio: แกนกลางโครงข่ายประสาทที่ขยับตามจังหวะสนทนา สถานะปัจจุบัน และแผงตัวเลขของระบบ
 * อยู่บนจอตลอด (ด้านซ้ายบนจอกว้าง ด้านบนบนจอแคบ)
 * แสดงเฉพาะในธีมโฮโลแกรม ธีมเรียบซ่อนไว้ด้วย CSS
 */
export function Stage({
  phase,
  statusLabel,
  readouts: _readouts,
  compact,
  offline,
  metricsHidden: _metricsHidden = false,
  platformLabel,
  thinkHard = false,
  waitingForWake = false
}: StageProps) {
  void _readouts;
  void _metricsHidden;
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get);
  const micLevels = useSyncExternalStore(micLevelStore.subscribe, micLevelStore.get);
  const drawing = phase === "listening" && theme === "holo" && micLevels;

  return (
    <aside
      className={`stage${compact ? " compact" : ""}${offline ? " offline" : ""}${thinkHard ? " think-hard" : ""}`}
      data-phase={phase}
      data-wake={waitingForWake ? "waiting" : undefined}
      aria-label="แผงสถานะของลูน่า"
    >
      <div className="stage-identity" aria-hidden>
        <span className="stage-id-code">LUNA</span>
        <span className="stage-id-sub">{platformLabel ? `ระบบ · ${platformLabel}` : "ระบบผู้ช่วยเสียงภาษาไทย"}</span>
      </div>

      <div className={`core hero ${phase}`} aria-hidden>
        <OrbitalEnergyCore phase={phase} offline={offline} thinkHard={thinkHard} />
        <NeuralSphere phase={phase} offline={offline} compact={compact} />
        <ArcCore drawing={drawing} />
        <span className="core-sweep" />
        <span className="core-heart" />
      </div>

      <VoiceWaveform phase={phase} offline={offline} thinkHard={thinkHard} waitingForWake={waitingForWake} />

      {/* แผงสถานะมินิมอลขอบซ้ายและแถบระดับเสียงขอบขวา (แสดงเฉพาะโหมดเต็มจอแบบเดียวกับ localhost:5173) */}
      {!compact && (
        <>
          <div className="hud-side-systems" aria-hidden>
            <span className="hud-side-title">ระบบ</span>
            <ul>
              <li className={offline ? "warn" : "on"}><i /> ลูน่า</li>
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
        <span className="stage-kicker">ลูน่า · ศูนย์สั่งการด้วยเสียง</span>
        <strong>{statusLabel}</strong>
        <HudClock />
      </div>

      <div className="stage-traces" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </aside>
  );
}
