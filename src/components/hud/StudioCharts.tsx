import type { CSSProperties } from "react";
import type { ConversationMessage } from "../../conversation/types";
import type { MemoryItem } from "../../memory/memoryStore";
import { formatLatency } from "../../services/hudTelemetry";

interface StudioChartsProps {
  latenciesMs: number[];
  lastReplyMs: number | null;
  memories: MemoryItem[];
  messages: ConversationMessage[];
  aiReady: boolean;
  listening: boolean;
  meetingAvailable: boolean;
  metricsHidden: boolean;
}

const CHART_WIDTH = 220;
const CHART_HEIGHT = 64;
const PAD_X = 6;
const PAD_Y = 8;

function buildSparklinePaths(values: number[]): { line: string; area: string; lastX: number; lastY: number } | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const innerW = CHART_WIDTH - PAD_X * 2;
  const innerH = CHART_HEIGHT - PAD_Y * 2;

  const points = values.map((val, index) => {
    const x = PAD_X + (index / (values.length - 1)) * innerW;
    const y = PAD_Y + innerH - ((val - min) / span) * innerH;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  const line = points.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x},${pt.y}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L${last.x},${CHART_HEIGHT} L${first.x},${CHART_HEIGHT} Z`;

  return { line, area, lastX: last.x, lastY: last.y };
}

/**
 * แถวกราฟวิเคราะห์ 3 คอลัมน์แบบ Performance Studio (ใช้ข้อมูลจริงของเซสชันทั้งหมด ไม่แต่งตัวเลข)
 */
export function StudioCharts({
  latenciesMs,
  lastReplyMs,
  memories,
  messages,
  aiReady,
  listening,
  meetingAvailable,
  metricsHidden
}: StudioChartsProps) {
  const spark = buildSparklinePaths(latenciesMs);
  const avgLatency =
    latenciesMs.length > 0 ? Math.round(latenciesMs.reduce((sum, ms) => sum + ms, 0) / latenciesMs.length) : null;
  const maskedValue = "••••";

  const recentTurns = messages.slice(-10);
  const maxTurnLen = Math.max(1, ...recentTurns.map((m) => m.text.length));

  return (
    <section className="studio-charts" aria-label="สถิติและการทำงานของระบบแบบเรียลไทม์">
      {/* 1. Response Latency Trajectory */}
      <article className="studio-chart-card" data-accent="emerald">
        <header className="chart-head">
          <div>
            <span className="chart-kicker">RESPONSE LATENCY</span>
            <h3>Latency trajectory</h3>
          </div>
          <span className={`chart-badge ${aiReady ? "ok" : "wait"}`}>{aiReady ? "LIVE" : "WAIT"}</span>
        </header>

        <div className="chart-metric">
          <strong>{metricsHidden ? maskedValue : formatLatency(lastReplyMs)}</strong>
          <small>
            {latenciesMs.length > 0
              ? `เฉลี่ย ${metricsHidden ? maskedValue : formatLatency(avgLatency)} (${latenciesMs.length} รอบ)`
              : "รอการสนทนารอบแรก"}
          </small>
        </div>

        <div className="chart-canvas" aria-hidden>
          <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="jv-lat-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="20" x2={CHART_WIDTH} y2="20" className="chart-grid" />
            <line x1="0" y1="44" x2={CHART_WIDTH} y2="44" className="chart-grid" />
            {spark ? (
              <>
                <path d={spark.area} fill="url(#jv-lat-fill)" />
                <path d={spark.line} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={spark.lastX} cy={spark.lastY} r="3.2" fill="#34d399" />
              </>
            ) : (
              <line x1={PAD_X} y1="44" x2={CHART_WIDTH - PAD_X} y2="44" stroke="#34d399" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 4" />
            )}
          </svg>
        </div>

        <footer className="chart-foot">
          <span>SESSION LIVE</span>
          <span>REAL TELEMETRY</span>
        </footer>
      </article>

      {/* 2. Knowledge & Memory Store */}
      <article className="studio-chart-card" data-accent="cyan">
        <header className="chart-head">
          <div>
            <span className="chart-kicker">MEMORY STORE</span>
            <h3>Context &amp; recall</h3>
          </div>
          <span className="chart-badge cyan">LOCAL</span>
        </header>

        <div className="chart-metric">
          <strong>{metricsHidden ? maskedValue : `${memories.length} เรื่อง`}</strong>
          <small>{memories.length > 0 ? "บันทึกอยู่ในอุปกรณ์นี้" : "สั่ง “จำไว้ว่า…” เพื่อบันทึก"}</small>
        </div>

        <div className="chart-memory-list">
          {memories.length === 0 ? (
            <p className="chart-empty">ยังไม่มีความจำระยะยาวในอุปกรณ์</p>
          ) : metricsHidden ? (
            <p className="chart-empty">ซ่อนรายการความจำเพื่อความเป็นส่วนตัว</p>
          ) : (
            <ul>
              {memories.slice(-3).reverse().map((item) => (
                <li key={item.id} title={item.text}>
                  <span aria-hidden />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="chart-foot">
          <span>ON-DEVICE</span>
          <span>{memories.length}/50 SLOTS</span>
        </footer>
      </article>

      {/* 3. Session Turn Activity */}
      <article className="studio-chart-card" data-accent="sky">
        <header className="chart-head">
          <div>
            <span className="chart-kicker">LATEST RECORDS</span>
            <h3>Session activity</h3>
          </div>
          <span className="chart-badge sky">{listening ? "VOICE ON" : "READY"}</span>
        </header>

        <div className="chart-metric">
          <strong>{metricsHidden ? maskedValue : `${messages.length} รายการ`}</strong>
          <small>{meetingAvailable ? "รองรับสนทนาเสียงและสรุปประชุม" : "รองรับสนทนาเสียงและค้นเว็บ"}</small>
        </div>

        <div className="chart-bars" aria-hidden>
          {recentTurns.length > 0 ? (
            recentTurns.map((msg) => {
              const ratio = Math.max(0.18, msg.text.length / maxTurnLen);
              return (
                <span
                  key={msg.id}
                  className={`chart-bar ${msg.role}`}
                  style={{ "--h": `${Math.round(ratio * 100)}%` } as CSSProperties}
                />
              );
            })
          ) : (
            Array.from({ length: 10 }, (_unused, idx) => (
              <span
                key={idx}
                className="chart-bar idle"
                style={{ "--h": `${18 + ((idx * 13) % 28)}%` } as CSSProperties}
              />
            ))
          )}
        </div>

        <footer className="chart-foot">
          <span>TURN HISTORY</span>
          <span>{recentTurns.length} RECORDS</span>
        </footer>
      </article>
    </section>
  );
}
