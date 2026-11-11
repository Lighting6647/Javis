import { MicOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { AiProblem } from "../services/aiStatusStore";

interface ServiceBannerProps {
  problem: AiProblem;
  /** ถามสถานะล่าสุดจากเซิร์ฟเวอร์ */
  onRecheck: () => Promise<void>;
}

/** ให้ผู้ใช้เห็นว่าปุ่มทำงานแล้ว แม้เซิร์ฟเวอร์จะตอบเร็วมาก */
const MIN_CHECKING_MS = 500;

const TIME_FORMAT = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" });

/**
 * แถบแจ้งว่าบริการ AI ใช้งานไม่ได้ แสดงตั้งแต่เปิดแอป เพื่อให้ผู้ใช้รู้ก่อนจะพูดแล้วไม่ได้คำตอบ
 * ไม่ปิดกั้นการส่งข้อความ เพราะคำขอที่สำเร็จคือสิ่งที่ยืนยันว่าบริการกลับมาแล้ว
 */
export function ServiceBanner({ problem, onRecheck }: ServiceBannerProps) {
  const [checking, setChecking] = useState(false);
  /** เวลาที่ผู้ใช้กดตรวจครั้งล่าสุดแล้วยังใช้ไม่ได้ ถ้าใช้ได้แล้วแถบนี้จะหายไปเอง */
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const Icon = problem.scope === "voice" ? MicOff : TriangleAlert;

  const recheck = async () => {
    if (checking) return;
    setChecking(true);
    await Promise.all([onRecheck(), new Promise((resolve) => setTimeout(resolve, MIN_CHECKING_MS))]);
    setChecking(false);
    setCheckedAt(new Date());
  };

  return (
    <div className={`service-banner ${problem.scope}`} role={problem.scope === "chat" ? "alert" : "status"}>
      <div className="service-banner-inner">
        <Icon className="service-banner-icon" size={18} aria-hidden />
        <div className="service-banner-text">
          <strong>{problem.title}</strong>
          <span>{problem.detail}</span>
          {checkedAt && !checking && (
            <small aria-live="polite">ตรวจล่าสุด {TIME_FORMAT.format(checkedAt)} น. ยังใช้งานไม่ได้</small>
          )}
        </div>
        <button type="button" className="service-banner-action" onClick={recheck} disabled={checking} aria-busy={checking}>
          <RefreshCw className={checking ? "spin" : undefined} size={14} aria-hidden />
          {checking ? "กำลังตรวจ" : "ตรวจอีกครั้ง"}
        </button>
      </div>
    </div>
  );
}
