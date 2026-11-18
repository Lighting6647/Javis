import { Check, Terminal, X } from "lucide-react";
import type { ProjectActionProposal } from "../conversation/types";

interface ProjectActionCardProps {
  proposal: ProjectActionProposal;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACTION_LABEL: Record<ProjectActionProposal["action"], string> = {
  build: "Build โปรเจกต์",
  test: "รัน Test Suite",
  lint: "ตรวจ Code & Lint",
  redeploy: "Redeploy บน Vercel"
};

/** การ์ดยืนยันก่อนรันคำสั่งควบคุมโปรเจกต์จริง (เหมือน FillCard — ไม่รันอัตโนมัติถ้ายังไม่ยืนยัน) */
export function ProjectActionCard({ proposal, onConfirm, onCancel }: ProjectActionCardProps) {
  return (
    <div className="fill-card" role="group" aria-label="ยืนยันคำสั่งควบคุมโปรเจกต์">
      <div className="fill-card-head">
        <Terminal size={17} aria-hidden />
        <strong>
          ยืนยันคำสั่ง: {ACTION_LABEL[proposal.action]} ({proposal.projectName})
        </strong>
      </div>

      <p>{proposal.reason || `ระบบกำลังจะดำเนินการ ${proposal.action} กับโปรเจกต์ ${proposal.projectName}`}</p>
      <p>เฉพาะคำสั่งที่อนุญาตเท่านั้น พูดว่า &quot;ยืนยัน&quot; หรือ &quot;ยกเลิก&quot; ก็ได้</p>

      <div className="fill-card-actions">
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          <Check size={17} aria-hidden /> ยืนยันรันคำสั่ง
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <X size={16} aria-hidden /> ยกเลิก
        </button>
      </div>
    </div>
  );
}
