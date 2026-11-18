import { useSyncExternalStore } from "react";
import type { Phase } from "../../conversation/types";
import type { Readout } from "../../hooks/useHudTelemetry";
import { micLevelStore } from "../../services/micLevelStore";
import { themeStore } from "../../services/themeStore";
import { ArcCore } from "./ArcCore";
import { HudClock } from "./HudClock";
import { NeuralSphere } from "./NeuralSphere";
import { Telemetry } from "./Telemetry";

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
  platformLabel
}: StageProps) {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get);
  const micLevels = useSyncExternalStore(micLevelStore.subscribe, micLevelStore.get);
  const drawing = phase === "listening" && theme === "holo" && micLevels;

  return (
    <aside
      className={`stage${compact ? " compact" : ""}${offline ? " offline" : ""}`}
      data-phase={phase}
      aria-label="แผงสถานะของนีน่า"
    >
      <div className="stage-identity" aria-hidden>
        <span className="stage-id-code">NN-CORE-01</span>
        <span className="stage-id-sub">{platformLabel ? `System · ${platformLabel}` : "System overview"}</span>
      </div>

      <div className={`core hero ${phase}`} aria-hidden>
        <NeuralSphere phase={phase} offline={offline} compact={compact} />
        <ArcCore drawing={drawing} />
        <span className="core-sweep" />
        <span className="core-heart" />
      </div>

      {/* สถานะเดียวกับป้ายบนแถบบนซึ่งโปรแกรมอ่านหน้าจออ่านอยู่แล้ว ตรงนี้จึงเป็นภาพอย่างเดียว */}
      <div className="stage-status" aria-hidden>
        <span className="stage-kicker">Nina · Central Voice Studio</span>
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
