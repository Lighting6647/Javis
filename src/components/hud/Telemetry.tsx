import type { CSSProperties } from "react";
import type { Readout } from "../../hooks/useHudTelemetry";

/** แผงตัวเลขของจอ HUD: ค่าจริงของระบบ เรียงเป็นช่องแบบหน้าปัดเครื่องมือวัด */
export function Telemetry({ readouts }: { readouts: Readout[] }) {
  return (
    <dl className="telemetry">
      {readouts.map((readout, index) => (
        <div
          key={readout.code}
          className={`readout${readout.primary ? " primary" : ""}${readout.tone ? ` ${readout.tone}` : ""}`}
          style={{ "--n": index } as CSSProperties}
        >
          <dt>
            <span aria-hidden>{readout.code}</span>
            {readout.label}
          </dt>
          <dd>{readout.value}</dd>
        </div>
      ))}
    </dl>
  );
}
