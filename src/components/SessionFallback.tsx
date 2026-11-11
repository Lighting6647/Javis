import { RefreshCw, WifiOff } from "lucide-react";

/** โครงร่างระหว่างรอตรวจสอบสิทธิ์กับเซิร์ฟเวอร์ */
export function SessionSkeleton() {
  return (
    <div className="panel" role="status" aria-label="กำลังตรวจสอบสิทธิ์เข้าใช้งาน">
      <div className="skeleton skeleton-circle" />
      <div className="skeleton skeleton-line wide" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-button" />
    </div>
  );
}

export function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="panel" role="alert">
      <div className="panel-icon muted"><WifiOff size={24} aria-hidden /></div>
      <h1>ติดต่อเซิร์ฟเวอร์ไม่ได้</h1>
      <p>กรุณาตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        <RefreshCw size={18} aria-hidden />
        ลองใหม่
      </button>
    </div>
  );
}
