import { AppWindow, Check, X } from "lucide-react";
import type { AppLaunchProposal } from "../conversation/types";

interface AppLaunchCardProps {
  proposal: AppLaunchProposal;
  onConfirm: () => void;
  onCancel: () => void;
}

/** การ์ดยืนยันก่อนเปิดโปรแกรมบนคอมพิวเตอร์หรือแอปบนมือถือ (ไม่เปิดเองอัตโนมัติถ้ายังไม่ยืนยัน) */
export function AppLaunchCard({ proposal, onConfirm, onCancel }: AppLaunchCardProps) {
  return (
    <div className="fill-card" role="group" aria-label="ยืนยันการเปิดโปรแกรม">
      <div className="fill-card-head">
        <AppWindow size={17} aria-hidden />
        <strong>ยืนยันการเปิดโปรแกรม: {proposal.appName}</strong>
      </div>

      <p>{proposal.reason || `ลูน่ากำลังจะเปิดโปรแกรม ${proposal.appName} ให้ค่ะ`}</p>
      <p>เฉพาะโปรแกรมที่อนุญาตในระบบเท่านั้น พูดว่า &quot;ยืนยัน&quot; หรือ &quot;ยกเลิก&quot; ก็ได้ค่ะ</p>

      <div className="fill-card-actions">
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          <Check size={17} aria-hidden /> ยืนยันเปิดโปรแกรม
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <X size={16} aria-hidden /> ยกเลิก
        </button>
      </div>
    </div>
  );
}
