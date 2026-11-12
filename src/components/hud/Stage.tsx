import { useSyncExternalStore } from "react";
import type { Phase } from "../../conversation/types";
import type { Readout } from "../../hooks/useHudTelemetry";
import { micLevelStore } from "../../services/micLevelStore";
import { themeStore } from "../../services/themeStore";
import { ArcCore } from "./ArcCore";
import { HudClock } from "./HudClock";
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
}

/**
 * แผงสถานะของจอ HUD: แกนกลางที่ขยับตามจังหวะสนทนา สถานะปัจจุบัน และแผงตัวเลขของระบบ
 * อยู่บนจอตลอด (ด้านซ้ายบนจอกว้าง ด้านบนบนจอแคบ) ให้รู้สึกว่า Javis อยู่ตรงนั้นเสมอ ไม่ใช่แค่หน้าต่างแชต
 * แสดงเฉพาะในธีมโฮโลแกรม ธีมเรียบซ่อนไว้ด้วย CSS
 */
export function Stage({ phase, statusLabel, readouts, compact, offline }: StageProps) {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get);
  const micLevels = useSyncExternalStore(micLevelStore.subscribe, micLevelStore.get);
  // ธีมเรียบซ่อนแผงนี้ไว้ จึงต้องไม่เปิดไมโครโฟนไว้วัดเสียงให้กับสิ่งที่ผู้ใช้มองไม่เห็น
  const metering = phase === "listening" && theme === "holo" && micLevels;

  return (
    <aside className={`stage${compact ? " compact" : ""}${offline ? " offline" : ""}`} data-phase={phase} aria-label="แผงสถานะของ Javis">
      <div className={`core hero ${phase}`} aria-hidden>
        <ArcCore metering={metering} />
        <span className="core-sweep" />
        <span className="core-heart" />
      </div>

      {/* สถานะเดียวกับป้ายบนแถบบนซึ่งโปรแกรมอ่านหน้าจออ่านอยู่แล้ว ตรงนี้จึงเป็นภาพอย่างเดียว */}
      <div className="stage-status" aria-hidden>
        <span className="stage-kicker">Javis · ผู้ช่วยส่วนตัว</span>
        <strong>{statusLabel}</strong>
        <HudClock />
      </div>

      <Telemetry readouts={readouts} />
    </aside>
  );
}
