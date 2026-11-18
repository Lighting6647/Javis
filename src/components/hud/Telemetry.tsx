import type { CSSProperties } from "react";
import type { Readout } from "../../hooks/useHudTelemetry";

const ACCENT_BY_CODE: Record<string, string> = {
  AI: "emerald",
  NET: "teal",
  LAT: "cyan",
  MEM: "sky",
  LOG: "amber",
  ENV: "blue",
  TTS: "blue"
};

interface TelemetryProps {
  readouts: Readout[];
  masked?: boolean;
}

/** แผงตัวเลขของจอ Studio HUD: ค่าจริงของระบบ เรียงเป็นการ์ดขอบบนสีตามหมวด */
export function Telemetry({ readouts, masked = false }: TelemetryProps) {
  return (
    <dl className="telemetry">
      {readouts.map((readout, index) => (
        <div
          key={readout.code}
          className={`readout${readout.primary ? " primary" : ""}${readout.tone ? ` ${readout.tone}` : ""}`}
          data-accent={ACCENT_BY_CODE[readout.code] ?? "cyan"}
          style={{ "--n": index } as CSSProperties}
        >
          <dt>
            <span aria-hidden>{readout.code}</span>
            {readout.label}
          </dt>
          <dd>{masked ? "••••" : readout.value}</dd>
        </div>
      ))}
    </dl>
  );
}
