import { RefreshCw, WifiOff } from "lucide-react";

/** โครงร่างระหว่างรอตรวจสอบสิทธิ์กับเซิร์ฟเวอร์ */
export function SessionSkeleton() {
  return (
    <div className="card-skeleton" role="status" aria-label="กำลังตรวจสอบสิทธิ์เข้าใช้งาน">
      <div className="skeleton skeleton-orb" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-button" />
    </div>
  );
}

export function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="access-gate" role="alert">
      <div className="gate-icon muted"><WifiOff size={26} aria-hidden /></div>
      <h2>ติดต่อเซิร์ฟเวอร์ไม่ได้</h2>
      <p>กรุณาตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง</p>
      <button type="button" className="start-button" onClick={onRetry}>
        <RefreshCw size={20} aria-hidden />
        ลองใหม่
      </button>
    </div>
  );
}
