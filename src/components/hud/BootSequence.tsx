import { useEffect, useState } from "react";
import { playBootMusic, sfx } from "../../services/sfx";

interface BootSequenceProps {
  onComplete: () => void;
}

const BOOT_STEPS = [
  { progress: 25, title: "กำลังเริ่มต้นระบบลูน่า", log: "ตรวจสอบแกนประมวลผลและหน่วยความจำ…" },
  { progress: 55, title: "เชื่อมต่อระบบเสียงภาษาไทย", log: "ปรับเทียบไมโครโฟนและตัวสังเคราะห์เสียง…" },
  { progress: 82, title: "เปิดใช้งานแกนพลังงาน 3 มิติ", log: "โหลดโมดูลโฮโลแกรมและระบบสั่งการ…" },
  { progress: 100, title: "ระบบลูน่าพร้อมใช้งาน", log: "สวัสดีค่ะคุณไลท์ พร้อมรับคำสั่งเสียงแล้วค่ะ" }
] as const;

/**
 * หน้าจอบูต 4 จังหวะแบบ Iron Man (ภาษาไทย) พร้อมปุ่มเริ่มระบบเพื่อปลดล็อกเสียงเบราว์เซอร์
 */
export function BootSequence({ onComplete }: BootSequenceProps) {
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!started) return;
    const stopMusic = playBootMusic();
    const timers = [
      window.setTimeout(() => setStepIndex(1), 700),
      window.setTimeout(() => setStepIndex(2), 1450),
      window.setTimeout(() => setStepIndex(3), 2200),
      window.setTimeout(() => {
        sfx.done();
        onComplete();
      }, 2950)
    ];
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      stopMusic();
    };
  }, [started, onComplete]);

  const current = BOOT_STEPS[stepIndex] ?? BOOT_STEPS[0];

  return (
    <div className="boot-overlay" role="dialog" aria-modal="true" aria-label="เริ่มต้นระบบลูน่า">
      {!started ? (
        <div className="ignition-card">
          <div className="ignition-ring" aria-hidden />
          <span className="ignition-code">J.A.R.V.I.S · MARK-TH</span>
          <h2>ระบบผู้ช่วยอัจฉริยะภาษาไทย</h2>
          <p>แตะปุ่มด้านล่างเพื่อเปิดระบบเสียงและแกนพลังงาน 3 มิติ</p>
          <div className="ignition-actions">
            <button
              type="button"
              className="btn btn-primary ignition-btn"
              onClick={() => {
                sfx.wake();
                setStarted(true);
              }}
            >
              เริ่มต้นระบบ
            </button>
            <button type="button" className="btn btn-quiet" onClick={onComplete}>
              ข้าม
            </button>
          </div>
        </div>
      ) : (
        <div className="boot-card">
          <div className="boot-reticle" aria-hidden>
            <span className="boot-core-title">J.A.R.V.I.S</span>
          </div>
          <div className="boot-progress-meta">
            <strong>{current.title}</strong>
            <span>{current.progress}%</span>
          </div>
          <div className="boot-progress-track">
            <div className="boot-progress-fill" style={{ width: `${current.progress}%` }} />
          </div>
          <p className="boot-log">{current.log}</p>
          <button type="button" className="btn btn-quiet boot-skip" onClick={onComplete}>
            เข้าสู่หน้าหลักทันที
          </button>
        </div>
      )}
    </div>
  );
}
