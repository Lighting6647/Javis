import { CalendarClock, CalendarX, Check, X } from "lucide-react";
import type { CalendarChangeProposal } from "../conversation/types";

interface CalendarChangeCardProps {
  change: CalendarChangeProposal;
  onConfirm: () => void;
  onCancel: () => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat("th-TH", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok"
});

/** เวลานัดแบบอ่านง่าย นัดทั้งวัน (มีแต่วันที่) แสดงเป็น "ทั้งวัน" */
export function formatEventTime(start: string, end: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return `${start} (ทั้งวัน)`;
  const from = Date.parse(start);
  if (!Number.isFinite(from)) return start;
  const to = Date.parse(end);
  const endText = Number.isFinite(to)
    ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(to)
    : "";
  return `${DATE_FORMAT.format(from)}${endText ? ` – ${endText}` : ""}`;
}

/** การ์ดยืนยันก่อนเลื่อน เปลี่ยนชื่อ หรือยกเลิกนัด แสดงนัดก่อนและหลังเปลี่ยน ไม่แก้ปฏิทินจนกว่าผู้ใช้จะกดยืนยัน */
export function CalendarChangeCard({ change, onConfirm, onCancel }: CalendarChangeCardProps) {
  const deleting = change.action === "delete";
  return (
    <div className="fill-card calendar-change-card" role="group" aria-label={deleting ? "ยืนยันยกเลิกนัด" : "ยืนยันเปลี่ยนนัด"}>
      <div className="fill-card-head">
        {deleting ? <CalendarX size={17} aria-hidden /> : <CalendarClock size={17} aria-hidden />}
        <strong>{deleting ? "ยกเลิกนัดนี้ไหมคะ" : "เปลี่ยนนัดตามนี้ไหมคะ"}</strong>
      </div>

      <dl className="email-draft-fields">
        <dt>{deleting ? "นัด" : "เดิม"}</dt>
        <dd>
          {change.before.title} · {formatEventTime(change.before.start, change.before.end)}
        </dd>
        {change.after && (
          <>
            <dt>ใหม่</dt>
            <dd>
              {change.after.title} · {formatEventTime(change.after.start, change.after.end)}
            </dd>
          </>
        )}
      </dl>

      <div className="fill-card-actions">
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          <Check size={17} aria-hidden /> {deleting ? "ยืนยันยกเลิกนัด" : "ยืนยันเปลี่ยนนัด"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <X size={16} aria-hidden /> ไม่ต้องเปลี่ยน
        </button>
      </div>
    </div>
  );
}
