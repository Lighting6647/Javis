import { FileText, Mic, Pause, Sparkles, Trash2 } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { MeetingState, MeetingStatus } from "../meeting/meetingRecorder";
import { formatClock, formatTranscript, type MeetingEntry, meetingMinutes } from "../meeting/transcript";
import { MeetingExport } from "./MeetingExport";

type ActiveStatus = Exclude<MeetingStatus, "idle">;

const BADGE_LABEL: Record<ActiveStatus, string> = {
  recording: "กำลังจด",
  paused: "พักการจด",
  summarizing: "กำลังสรุป"
};

const MEETING_NOTE =
  "ระหว่างจด Javis ไม่ตอบและไม่ทำตามคำสั่งใด เสียงถูกแปลงเป็นข้อความด้วยระบบเสียงของเบราว์เซอร์ และข้อความถูกส่งให้ AI ครั้งเดียวตอนกดจบและสรุป ควรแจ้งผู้ร่วมประชุมว่ามีการจดบันทึก";

/** ผู้ใช้เลื่อนขึ้นไปอ่านห่างจากท้ายรายการเกินเท่านี้ (พิกเซล) จะไม่ถูกดึงกลับลงมาเมื่อมีคำพูดใหม่ */
const STICK_DISTANCE = 80;

interface MeetingPanelProps {
  state: MeetingState;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onCancel: () => void;
}

/** เวลาที่ผ่านไปตั้งแต่เริ่มประชุม เดินทุกวินาทีระหว่างจด */
function MeetingClock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time className="meeting-clock" aria-label="เวลาตั้งแต่เริ่มประชุม">
      {formatClock(now - startedAt)}
    </time>
  );
}

/** ช่วงคำพูดที่จดแล้ว แยกจากคำที่กำลังได้ยิน ซึ่งเปลี่ยนหลายครั้งต่อวินาที เพื่อไม่ต้องวาดรายการยาวใหม่ทุกครั้ง */
const MeetingLines = memo(function MeetingLines({ entries }: { entries: readonly MeetingEntry[] }) {
  return entries.map((entry, index) => (
    <li key={`${entry.at}-${index}`}>
      <time>{formatClock(entry.at)}</time>
      <p>{entry.text}</p>
    </li>
  ));
});

/** ปุ่มนำบันทึกคำพูดที่จดได้ออกไปเก็บ ใช้ได้แม้ยังไม่ได้สรุป เช่นตอน AI ใช้งานไม่ได้ ประกอบข้อความใหม่เฉพาะเมื่อจดเพิ่ม */
const TranscriptExport = memo(function TranscriptExport({ entries, startedAt }: { entries: readonly MeetingEntry[]; startedAt: number }) {
  return (
    <MeetingExport record={{ transcript: formatTranscript(entries), minutes: meetingMinutes(0, entries.at(-1)?.at ?? 0), startedAt }} />
  );
});

/**
 * แผงของโหมดสรุปการประชุม แทนที่บทสนทนาตลอดการประชุม: สถานะและเวลา ปุ่มพัก จบ และยกเลิก
 * กับคำพูดที่จดได้ตามเวลา เพื่อให้เห็นว่า Javis กำลังได้ยินอะไร โดยไม่มีเสียงตอบใด ๆ
 */
export function MeetingPanel({ state, onPause, onResume, onFinish, onCancel }: MeetingPanelProps) {
  const { status, startedAt, entries, partial, summary, notice } = state;
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** ผู้ใช้อยู่ท้ายรายการ จึงเลื่อนตามคำพูดใหม่ให้ */
  const following = useRef(true);

  // ระหว่างจด เลื่อนตามคำพูดล่าสุด เว้นแต่ผู้ใช้เลื่อนขึ้นไปอ่านเอง ส่วนตอนสรุป คำสรุปอยู่บนสุด จึงเลื่อนขึ้นไปให้เห็น
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (status === "summarizing") body.scrollTop = 0;
    else if (following.current) body.scrollTop = body.scrollHeight;
  }, [entries, partial, status]);

  if (status === "idle" || startedAt === null) return null;

  const trackScroll = () => {
    const body = bodyRef.current;
    if (body) following.current = body.scrollHeight - body.scrollTop - body.clientHeight < STICK_DISTANCE;
  };

  const requestCancel = () => {
    // ยังไม่ได้จดอะไร: ไม่มีอะไรให้เสีย จึงไม่ต้องถามซ้ำ
    if (entries.length === 0 && !partial) onCancel();
    else setConfirmingCancel(true);
  };

  return (
    <section className={`meeting ${status}`} aria-label="โหมดสรุปการประชุม">
      <header className="meeting-head">
        <div className="meeting-state">
          <span className={`meeting-badge ${status}`}>
            <i aria-hidden /> {BADGE_LABEL[status]}
          </span>
          {status === "recording" && <MeetingClock startedAt={startedAt} />}
          <span className="meeting-count">{entries.length > 0 ? `จดแล้ว ${entries.length} ช่วงคำพูด` : "ยังไม่มีคำพูดที่จดได้"}</span>
        </div>

        {confirmingCancel ? (
          <div className="meeting-actions" role="group" aria-label="ยืนยันการทิ้งบันทึก">
            <span className="meeting-confirm">ทิ้งบันทึกทั้งหมดที่จดไว้ใช่ไหม กู้คืนไม่ได้</span>
            <button type="button" className="btn btn-danger" onClick={onCancel}>
              <Trash2 size={15} aria-hidden /> ทิ้งบันทึก
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmingCancel(false)}>
              เก็บไว้
            </button>
          </div>
        ) : status === "summarizing" ? (
          <div className="meeting-actions">
            <button type="button" className="btn btn-secondary" onClick={onPause}>
              ยกเลิกการสรุป
            </button>
          </div>
        ) : (
          <div className="meeting-actions">
            {status === "recording" ? (
              <button type="button" className="btn btn-secondary" onClick={onPause}>
                <Pause size={15} aria-hidden /> พัก
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={onResume}>
                <Mic size={15} aria-hidden /> จดต่อ
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onFinish}>
              <Sparkles size={15} aria-hidden /> จบและสรุป
            </button>
            <button type="button" className="btn btn-quiet" onClick={requestCancel}>
              ยกเลิก
            </button>
          </div>
        )}
      </header>

      {notice && (
        <div className={`toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      {/* ไม่ประกาศเป็นบันทึกสด: โปรแกรมอ่านหน้าจอจะอ่านทุกคำพูดซ้อนเสียงในห้องประชุม */}
      <div className="meeting-body" ref={bodyRef} onScroll={trackScroll}>
        {status === "summarizing" && (
          <div className="meeting-summary" role="status">
            <h2>
              <Sparkles size={14} aria-hidden /> คำสรุปจาก AI
            </h2>
            {summary ? (
              <p>{summary}</p>
            ) : (
              <div className="meeting-summary-wait" aria-label="กำลังรอคำสรุป">
                <span className="skeleton skeleton-line wide" />
                <span className="skeleton skeleton-line wide" />
                <span className="skeleton skeleton-line" />
              </div>
            )}
          </div>
        )}

        {entries.length === 0 && !partial ? (
          <div className="meeting-empty">
            <FileText size={28} aria-hidden />
            <strong>{status === "recording" ? "กำลังฟังอยู่ เริ่มประชุมได้เลย" : "ยังไม่ได้จดอะไร"}</strong>
            <p>{status === "recording" ? "คำพูดที่ได้ยินจะขึ้นที่นี่ทีละช่วง พร้อมเวลาที่พูด" : "กดจดต่อเพื่อให้ Javis ฟังและจดอีกครั้ง"}</p>
          </div>
        ) : (
          <ol className="meeting-lines" aria-label="คำพูดที่จดได้">
            <MeetingLines entries={entries} />
            {partial && (
              <li className="partial">
                <time>…</time>
                <p>{partial}</p>
              </li>
            )}
          </ol>
        )}
      </div>

      <footer className="meeting-foot">
        <p>{MEETING_NOTE}</p>
        {entries.length > 0 && status !== "summarizing" && <TranscriptExport entries={entries} startedAt={startedAt} />}
      </footer>
    </section>
  );
}
