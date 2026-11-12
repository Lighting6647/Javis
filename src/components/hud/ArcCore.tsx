import { type CSSProperties, useRef } from "react";
import { useMicBars } from "../../hooks/useMicBars";

/** จำนวนแท่งของวงคลื่นเสียงรอบแกน */
const BAR_COUNT = 60;
const BAR_STEP = 360 / BAR_COUNT;
const BARS = Array.from({ length: BAR_COUNT }, (_unused, index) => index);

interface ArcCoreProps {
  /** Javis กำลังฟังและแผงสถานะกำลังแสดง: ให้วงคลื่นเสียงขยับตามเสียงไมโครโฟนจริงถ้าอุปกรณ์วัดได้ */
  metering: boolean;
}

/**
 * แกนกลางของจอ HUD: วงขีดองศา วงโค้งหมุนสวนกัน วงคลื่นเสียง และวงแกนพลังงาน
 * ความเร็วและสีเปลี่ยนตามสถานะผ่าน CSS ของตัวหุ้ม (.core)
 * วงคลื่นเสียงขยับตามเสียงไมโครโฟนจริงระหว่างฟัง เมื่อวัดได้ (เบราว์เซอร์บนคอมพิวเตอร์ที่อนุญาตไมโครโฟนแล้ว)
 * นอกนั้นขยับตามจังหวะ (ฟัง คิด ตอบ) เพื่อบอกสถานะ ไม่ได้วัดระดับเสียง
 */
export function ArcCore({ metering }: ArcCoreProps) {
  const bars = useRef<SVGGElement>(null);
  useMicBars(bars, metering);

  return (
    <svg className="arc" viewBox="0 0 400 400" aria-hidden focusable="false">
      <circle className="arc-ring arc-ticks" cx="200" cy="200" r="192" />
      <circle className="arc-ring arc-ticks-major" cx="200" cy="200" r="189" />
      <circle className="arc-ring arc-track" cx="200" cy="200" r="174" />
      <circle className="arc-ring arc-segments" cx="200" cy="200" r="174" />
      <circle className="arc-ring arc-dots" cx="200" cy="200" r="160" />

      <g className="arc-bars" ref={bars}>
        {BARS.map((index) => (
          <g key={index} transform={`rotate(${index * BAR_STEP} 200 200)`}>
            <rect x="198.4" y="54" width="3.2" height="26" rx="1.6" style={{ "--i": index } as CSSProperties} />
          </g>
        ))}
      </g>

      <circle className="arc-ring arc-sweep" cx="200" cy="200" r="108" />
      <circle className="arc-ring arc-sweep reverse" cx="200" cy="200" r="96" />
      <circle className="arc-ring arc-reactor" cx="200" cy="200" r="78" />
      <circle className="arc-ring arc-inner" cx="200" cy="200" r="60" />

      <g className="arc-cross">
        <line x1="200" y1="0" x2="200" y2="20" />
        <line x1="200" y1="380" x2="200" y2="400" />
        <line x1="0" y1="200" x2="20" y2="200" />
        <line x1="380" y1="200" x2="400" y2="200" />
      </g>
      <g className="arc-degrees">
        <text x="200" y="40">000</text>
        <text x="360" y="204">090</text>
        <text x="200" y="368">180</text>
        <text x="40" y="204">270</text>
      </g>
    </svg>
  );
}
