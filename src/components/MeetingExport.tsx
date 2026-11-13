import { Check, CircleAlert, Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { buildMeetingDocument, type MeetingDocument, meetingFileName } from "../meeting/export";
import { downloadTextFile } from "../services/download";

/** ปุ่มแสดงผลของการคัดลอกนานเท่านี้ แล้วกลับเป็นปกติ */
const FEEDBACK_MS = 2200;

type CopyTarget = "summary" | "transcript";

interface CopyFeedback {
  target: CopyTarget;
  ok: boolean;
}

interface MeetingExportProps {
  /** บันทึกของการประชุม ถ้ายังไม่มีคำสรุป จะมีเฉพาะปุ่มของบันทึกคำพูด */
  record: MeetingDocument;
}

/**
 * ปุ่มนำบันทึกการประชุมออกไปใช้: คัดลอกคำสรุป คัดลอกบันทึกคำพูด และดาวน์โหลดทั้งหมดเป็นไฟล์ข้อความ
 * บทสนทนาอยู่ในหน่วยความจำของแท็บเท่านั้น ผู้ใช้จึงต้องนำคำสรุปออกไปเก็บเองได้ง่าย
 * ทุกอย่างทำในเบราว์เซอร์ของผู้ใช้ ไม่ได้ส่งบันทึกไปที่ใดเพิ่ม
 */
export function MeetingExport({ record }: MeetingExportProps) {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const summary = record.summary?.trim() ?? "";

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const copy = async (target: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(target === "summary" ? summary : record.transcript);
      setFeedback({ target, ok: true });
    } catch {
      // เบราว์เซอร์ไม่ให้เขียนคลิปบอร์ด (เช่นหน้าต่างไม่ได้อยู่ด้านหน้า): บอกผู้ใช้ และยังดาวน์โหลดเป็นไฟล์ได้
      setFeedback({ target, ok: false });
    }
  };

  const copyButton = (target: CopyTarget, label: string) => {
    const shown = feedback?.target === target ? feedback : null;
    const Icon = shown ? (shown.ok ? Check : CircleAlert) : Copy;
    return (
      <button type="button" className={shown ? (shown.ok ? "done" : "failed") : undefined} onClick={() => void copy(target)}>
        <Icon size={14} aria-hidden />
        <span aria-live="polite">{shown ? (shown.ok ? "คัดลอกแล้ว" : "คัดลอกไม่สำเร็จ ลองดาวน์โหลดแทน") : label}</span>
      </button>
    );
  };

  return (
    <div className="meeting-export" role="group" aria-label="นำบันทึกการประชุมไปใช้">
      {summary && copyButton("summary", "คัดลอกคำสรุป")}
      {copyButton("transcript", "คัดลอกบันทึกคำพูด")}
      <button type="button" onClick={() => downloadTextFile(meetingFileName(record.startedAt), buildMeetingDocument(record))}>
        <Download size={14} aria-hidden />
        <span>ดาวน์โหลดเป็นไฟล์</span>
      </button>
    </div>
  );
}
