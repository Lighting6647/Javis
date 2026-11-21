import {
  Activity,
  Check,
  Cpu,
  GitBranch,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X
} from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { aiProviderStore, aiStatusStore } from "../services/aiStatusStore";
import {
  classifyRouterGoal,
  decideReviewItem,
  fetchRouterSnapshot,
  type JevRouteDecision,
  type JevTelemetrySnapshot,
  type ReviewQueueItem
} from "../services/routerApi";

interface RouterPanelProps {
  onClose: () => void;
}

const CHOICE_LABEL: Record<string, string> = {
  "fast-reply": "Fast Reply",
  "web-research": "Web Research",
  "deep-reasoning": "Deep Reasoning",
  review: "Human Review",
  stop: "Halt / Stop"
};

export function RouterPanel({ onClose }: RouterPanelProps) {
  const aiProvider = useSyncExternalStore(aiProviderStore.subscribe, aiProviderStore.get);
  const [telemetry, setTelemetry] = useState<JevTelemetrySnapshot | null>(null);
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [probeGoal, setProbeGoal] = useState("");
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<JevRouteDecision | null>(null);
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      void aiStatusStore.refresh();
      const data = await fetchRouterSnapshot();
      setTelemetry(data.telemetry);
      setItems(data.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดสถานะ Router ไม่สำเร็จค่ะ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void aiStatusStore.refresh();
    void fetchRouterSnapshot()
      .then((data) => {
        if (!active) return;
        setTelemetry(data.telemetry);
        setItems(data.items);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "โหลดสถานะ Router ไม่สำเร็จค่ะ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleProbe = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = probeGoal.trim();
    if (!trimmed || probing) return;
    setProbing(true);
    setError(null);
    try {
      const res = await classifyRouterGoal(trimmed);
      setProbeResult(res.decision);
      await loadSnapshot();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ทดสอบ Router ไม่สำเร็จค่ะ");
    } finally {
      setProbing(false);
    }
  };

  const handleReviewDecision = async (id: string, decision: "approved" | "rejected") => {
    if (busyReviewId) return;
    setBusyReviewId(id);
    setError(null);
    try {
      const res = await decideReviewItem(id, decision);
      setTelemetry(res.telemetry);
      setItems((prev) => prev.map((entry) => (entry.id === id ? res.item : entry)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ส่งคำตัดสินไม่สำเร็จค่ะ");
    } finally {
      setBusyReviewId(null);
    }
  };

  const pendingItems = items.filter((item) => item.status === "pending");

  return (
    <section className="router-hub" aria-label="แผงควบคุม JEV Agent Router">
      <div className="projects-head">
        <div>
          <h2>JEV Agent-Router Telemetry</h2>
          <p>State Bus · System-One (&lt; 2 ms) · Confidence Gate 0.85 · Worker Dispatch</p>
        </div>
        <div className="projects-head-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void loadSnapshot()}
            disabled={loading}
            aria-label="รีเฟรชข้อมูล Router"
          >
            {loading ? <LoaderCircle size={14} className="spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} รีเฟรช
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="ปิดแผง Router">
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>

      {error && (
        <div className="router-alert" role="alert">
          <ShieldAlert size={16} aria-hidden />
          <span>{error}</span>
          <button type="button" className="btn" onClick={() => void loadSnapshot()}>
            ลองใหม่
          </button>
        </div>
      )}

      {aiProvider && (
        <div className="router-provider-bar" aria-label="ผู้ให้บริการและโมเดลที่ตอบจริง">
          <div className="router-provider-main">
            <Cpu size={14} aria-hidden />
            <span>ผู้ให้บริการจริง:</span>
            <strong>{aiProvider.label}</strong>
            <code>Fast: {aiProvider.chatModel}</code>
            <code>Pro: {aiProvider.proModel}</code>
          </div>
          <span className="router-provider-fallback">
            {aiProvider.fallbacks.length > 0
              ? `Failover: ${aiProvider.fallbacks.map((fb) => `${fb.label} (${fb.chatModel})`).join(" → ")}`
              : "Failover: ไม่มีคีย์สำรอง"}
          </span>
        </div>
      )}

      {/* แสดง Flow: State In -> System-One -> Gate 0.85 -> Dispatch */}
      <div className="router-pipeline" aria-label="เส้นทางการตัดสินใจ">
        <div className="router-stage">
          <span className="router-stage-code">01 STATE IN</span>
          <strong>{telemetry ? `${telemetry.busReaders} Bus Readers` : "—"}</strong>
        </div>
        <span className="router-arrow" aria-hidden>→</span>
        <div className="router-stage">
          <span className="router-stage-code">02 SYSTEM-ONE</span>
          <strong>{telemetry ? `${telemetry.avgLatencyMs} ms avg` : "—"}</strong>
        </div>
        <span className="router-arrow" aria-hidden>→</span>
        <div className="router-stage">
          <span className="router-stage-code">03 GATE 0.85</span>
          <strong>{telemetry ? `${telemetry.heldAtGate} held / ${telemetry.blockedByNoul} blocked` : "—"}</strong>
        </div>
        <span className="router-arrow" aria-hidden>→</span>
        <div className="router-stage">
          <span className="router-stage-code">04 DISPATCH</span>
          <strong>{telemetry ? `${telemetry.fastTierCount} fast · ${telemetry.proTierCount} pro` : "—"}</strong>
        </div>
      </div>

      {/* การ์ดสถิติ GRAPH COST และ DISPATCH */}
      {loading && !telemetry ? (
        <div className="router-metrics-grid" aria-busy="true">
          <div className="skeleton router-skeleton-card" />
          <div className="skeleton router-skeleton-card" />
          <div className="skeleton router-skeleton-card" />
          <div className="skeleton router-skeleton-card" />
        </div>
      ) : telemetry ? (
        <div className="router-metrics-grid">
          <article className="router-metric-card">
            <span className="router-metric-label"><Activity size={13} aria-hidden /> DECISIONS</span>
            <strong className="router-metric-value">{telemetry.decisions.toLocaleString("th-TH")}</strong>
            <span className="router-metric-sub">Fast {telemetry.fastTierCount} · Pro {telemetry.proTierCount}</span>
          </article>
          <article className="router-metric-card">
            <span className="router-metric-label"><Cpu size={13} aria-hidden /> LATENCY (MEDIAN/AVG)</span>
            <strong className="router-metric-value">{telemetry.avgLatencyMs.toFixed(2)} ms</strong>
            <span className="router-metric-sub">ประมวลผลในเครื่อง 100%</span>
          </article>
          <article className="router-metric-card">
            <span className="router-metric-label"><GitBranch size={13} aria-hidden /> GRAPH COST</span>
            <strong className="router-metric-value">${telemetry.totalCostUsd.toFixed(4)}</strong>
            <span className="router-metric-sub">ประหยัด ~${telemetry.savedUsd.toFixed(4)} เทียบ LLM ใหญ่</span>
          </article>
          <article className="router-metric-card">
            <span className="router-metric-label"><ShieldCheck size={13} aria-hidden /> HUMAN REVIEW QUEUE</span>
            <strong className="router-metric-value">{pendingItems.length} รอตรวจ</strong>
            <span className="router-metric-sub">บล็อกอันตราย {telemetry.blockedByNoul} ครั้ง</span>
          </article>
        </div>
      ) : null}

      {/* ทดลองส่ง Goal เข้า State Bus เพื่อดูการตัดสินใจสด */}
      <form className="router-probe-box" onSubmit={(event) => void handleProbe(event)}>
        <label htmlFor="router-probe-input" className="router-section-title">
          ทดสอบจำลอง State Bus &amp; Gate 0.85
        </label>
        <div className="router-probe-row">
          <input
            id="router-probe-input"
            type="text"
            value={probeGoal}
            onChange={(event) => setProbeGoal(event.target.value)}
            placeholder="เช่น ค้นหาราคาทองวันนี้ / วิเคราะห์สถาปัตยกรรมฐานข้อมูล / เอ่อ"
            maxLength={400}
          />
          <button type="submit" className="btn btn-primary" disabled={probing || !probeGoal.trim()}>
            {probing ? <LoaderCircle size={14} className="spin" aria-hidden /> : <Play size={14} aria-hidden />} ทดสอบ Route
          </button>
        </div>
        {probeResult && (
          <div className="router-probe-result" role="status">
            <span>
              Choice: <strong>{CHOICE_LABEL[probeResult.choice] ?? probeResult.choice}</strong> ({probeResult.choiceConfidence.toFixed(2)})
            </span>
            <span>
              Tier: <strong>{probeResult.modelTier.toUpperCase()}</strong>
            </span>
            <span>
              Urgency: <strong>{probeResult.urgency}</strong>
            </span>
            <span>
              Gate:{" "}
              <strong className={probeResult.gatePassed ? "router-tag-ok" : "router-tag-warn"}>
                {probeResult.gatePassed ? "PASS (>=0.85)" : probeResult.holdReason || "HOLD"}
              </strong>
            </span>
          </div>
        )}
      </form>

      {/* คิว Worker Slots + Human Review + RUN LOG */}
      <div className="router-columns">
        <div className="router-panel-box">
          <div className="router-box-head">
            <h3>DISPATCH &amp; HUMAN REVIEW ({pendingItems.length})</h3>
            {telemetry && (
              <span className="router-box-meta">
                w1–w4: {telemetry.workers.map((w) => `${w.id}:${w.runs}`).join(" · ")}
              </span>
            )}
          </div>
          {pendingItems.length === 0 ? (
            <p className="router-empty">ไม่มีรายการค้างตรวจที่ด่าน Gate 0.85 ค่ะ</p>
          ) : (
            <ul className="router-review-list">
              {pendingItems.map((item) => {
                const busy = busyReviewId === item.id;
                return (
                  <li key={item.id} className="router-review-item">
                    <div className="router-review-info">
                      <strong>{item.redactedGoal}</strong>
                      <span>
                        {item.holdReason} · Tier {item.modelTier} · {item.choiceConfidence.toFixed(2)}
                      </span>
                    </div>
                    <div className="router-review-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => void handleReviewDecision(item.id, "approved")}
                      >
                        <Check size={13} aria-hidden /> อนุมัติ
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void handleReviewDecision(item.id, "rejected")}
                      >
                        <X size={13} aria-hidden /> ปฏิเสธ
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="router-panel-box">
          <div className="router-box-head">
            <h3>RUN LOG (ล่าสุด)</h3>
            <span className="router-box-meta">ไม่บันทึกข้อความผู้ใช้</span>
          </div>
          {!telemetry || telemetry.recentLog.length === 0 ? (
            <p className="router-empty">ยังไม่มีบันทึกการ Route ในเซสชันนี้ค่ะ</p>
          ) : (
            <ul className="router-log-list">
              {telemetry.recentLog.slice(0, 10).map((entry, idx) => (
                <li key={`${entry.ts}-${idx}`} className="router-log-row">
                  <span className="router-log-ts">{entry.ts}</span>
                  <span className="router-log-choice">{CHOICE_LABEL[entry.choice] ?? entry.choice}</span>
                  <span className={`router-log-tier tier-${entry.modelTier}`}>{entry.modelTier}</span>
                  <span className={entry.gatePassed ? "router-tag-ok" : "router-tag-warn"}>
                    {!entry.safeToRun ? "BLOCKED" : entry.gatePassed ? "GATE OK" : "HOLD"}
                  </span>
                  <span className="router-log-ms">{entry.latencyMs.toFixed(1)} ms</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
