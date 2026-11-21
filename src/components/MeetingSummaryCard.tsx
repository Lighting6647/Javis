import { NotebookPen, X } from "lucide-react";
import type { MeetingRecord } from "../conversation/types";
import { MeetingExport } from "./MeetingExport";

interface MeetingSummaryCardProps {
  summary: string;
  meeting: MeetingRecord;
  onDismiss: () => void;
}

/** การ์ดแสดงผลสรุปการประชุมล่าสุดแบบเดี่ยว (ไม่มีระบบช่องแชท) */
export function MeetingSummaryCard({ summary, meeting, onDismiss }: MeetingSummaryCardProps) {
  return (
    <section className="meeting-summary-card" aria-label="สรุปการประชุมล่าสุด">
      <header className="meeting-summary-head">
        <div className="meeting-summary-title">
          <NotebookPen size={16} aria-hidden />
          <strong>สรุปการประชุม</strong>
          <span>{meeting.minutes} นาที</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onDismiss}
          aria-label="ปิดสรุปการประชุม"
          title="ปิดสรุปการประชุม"
        >
          <X size={16} aria-hidden />
        </button>
      </header>
      <p className="meeting-summary-body">{summary}</p>
      <MeetingExport record={{ ...meeting, summary }} />
    </section>
  );
}
