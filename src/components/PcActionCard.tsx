import { Check, MonitorCog, X } from "lucide-react";
import type { PcActionProposal } from "../conversation/types";

interface PcActionCardProps {
  proposal: PcActionProposal;
  onConfirm: () => void;
  onCancel: () => void;
}

/** การ์ดยืนยันก่อนลูน่าทำสิ่งที่เปลี่ยนแปลงเครื่องหรือหน้าเว็บ แสดงสิ่งที่จะทำจริงทั้งหมด */
export function PcActionCard({ proposal, onConfirm, onCancel }: PcActionCardProps) {
  return (
    <div className="fill-card" role="group" aria-label={`ยืนยัน: ${proposal.title}`}>
      <div className="fill-card-head">
        <MonitorCog size={17} aria-hidden />
        <strong>{proposal.title}</strong>
      </div>

      <pre className="pc-action-detail" tabIndex={0}>
        {proposal.detail}
      </pre>
      <p>
        {proposal.buttonOnly
          ? "อ่านคำสั่งให้ครบก่อน แล้วกดปุ่มยืนยัน รายการนี้ใช้เสียงยืนยันไม่ได้ค่ะ"
          : "กดยืนยัน หรือพูดว่า \"ยืนยัน\" หรือ \"ยกเลิก\" ก็ได้ค่ะ"}
      </p>

      <div className="fill-card-actions">
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          <Check size={17} aria-hidden /> {proposal.kind === "command" ? "รันคำสั่งนี้" : "ยืนยัน"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <X size={16} aria-hidden /> ยกเลิก
        </button>
      </div>
    </div>
  );
}
