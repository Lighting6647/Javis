import { useEffect, useState } from "react";
import { formatHudDate } from "../../services/hudTelemetry";

const formatTime = (date: Date): string => date.toLocaleTimeString("th-TH", { hour12: false });

/** วันที่และเวลาของอุปกรณ์บนจอ HUD เดินทุกวินาที */
export function HudClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="hud-clock">
      <span>{formatHudDate(now)}</span>
      <time dateTime={now.toISOString()}>{formatTime(now)}</time>
    </span>
  );
}
