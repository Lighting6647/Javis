import { useEffect, useState } from "react";

/**
 * วงแหวน HUD ของแกนกลาง Javis: วงขีดบอกองศา วงโค้งหมุนสวนกัน และเป้าเล็ง
 * เป็นภาพประกอบล้วน ๆ ความเร็วและสีเปลี่ยนตามสถานะผ่าน CSS ของตัวหุ้ม (.core)
 */
export function HoloRings() {
  return (
    <svg className="core-rings" viewBox="0 0 200 200" aria-hidden focusable="false">
      <circle className="ring ring-ticks" cx="100" cy="100" r="96" />
      <circle className="ring ring-outer" cx="100" cy="100" r="86" />
      <circle className="ring ring-dots" cx="100" cy="100" r="76" />
      <circle className="ring ring-arc" cx="100" cy="100" r="66" />
      <circle className="ring ring-arc reverse" cx="100" cy="100" r="56" />
      <circle className="ring ring-inner" cx="100" cy="100" r="46" />
      <g className="ring-cross">
        <line x1="100" y1="2" x2="100" y2="14" />
        <line x1="100" y1="186" x2="100" y2="198" />
        <line x1="2" y1="100" x2="14" y2="100" />
        <line x1="186" y1="100" x2="198" y2="100" />
      </g>
    </svg>
  );
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString("th-TH", { hour12: false });
}

/** นาฬิกาของจอ HUD เดินทุกวินาที */
function Clock() {
  const [now, setNow] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const timer = setInterval(() => setNow(formatClock(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  return <time>{now}</time>;
}

interface HudReadoutProps {
  /** สถานะปัจจุบันของ Javis เป็นข้อความ */
  status: string;
  /** ที่ที่แอปกำลังทำงาน เช่น เว็บ แอปเดสก์ท็อป */
  platform: string;
}

/** แถบตัวเลขของจอ HUD แสดงข้อมูลจริงของระบบ: สถานะ ที่ทำงาน และเวลา */
export function HudReadout({ status, platform }: HudReadoutProps) {
  return (
    <dl className="hud-readout">
      <div>
        <dt>สถานะ</dt>
        <dd>{status}</dd>
      </div>
      <div>
        <dt>ระบบ</dt>
        <dd>{platform}</dd>
      </div>
      <div>
        <dt>เวลา</dt>
        <dd><Clock /></dd>
      </div>
    </dl>
  );
}
