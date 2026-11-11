import { Check, ClipboardPen, X } from "lucide-react";
import type { FillRequest } from "../conversation/types";

interface FillCardProps {
  request: FillRequest;
  onConfirm: () => void;
  onCancel: () => void;
}

/** ค่าของช่องติ๊กมาเป็น true/false แสดงเป็นคำที่ผู้ใช้อ่านเข้าใจ */
function displayValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return "ติ๊กเลือก";
  if (normalized === "false") return "ไม่เลือก";
  return value;
}

/**
 * รายการค่าที่ Javis จะกรอกลงหน้าเว็บ แสดงให้ผู้ใช้ตรวจและยืนยันก่อนทุกครั้ง
 * ไม่มีทางกรอกโดยไม่ผ่านการ์ดนี้ และการกรอกไม่รวมการกดส่งฟอร์ม
 */
export function FillCard({ request, onConfirm, onCancel }: FillCardProps) {
  return (
    <div className="fill-card" role="group" aria-label="รายการที่จะกรอกลงหน้าเว็บ">
      <div className="fill-card-head">
        <ClipboardPen size={17} aria-hidden />
        <strong>ตรวจก่อนกรอก {request.fields.length} ช่อง</strong>
      </div>

      <dl>
        {request.fields.map((field) => (
          <div key={field.id}>
            <dt>{field.label}</dt>
            <dd>{displayValue(field.value)}</dd>
          </div>
        ))}
      </dl>

      <p>Javis จะกรอกเฉพาะช่องด้านบน และไม่กดส่งฟอร์มให้ พูดว่า "ยืนยัน" หรือ "ยกเลิก" ก็ได้</p>

      <div className="fill-card-actions">
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          <Check size={17} aria-hidden /> ยืนยันและกรอก
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <X size={16} aria-hidden /> ยกเลิก
        </button>
      </div>
    </div>
  );
}
