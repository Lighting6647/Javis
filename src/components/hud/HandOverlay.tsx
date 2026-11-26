import { useEffect, useRef } from "react";
import type { HoldKind } from "../../services/gestureCommands";
import type { HandFrame } from "../../services/handControl";
import { gestureHintStore } from "../../services/gestureHintStore";
import { handFrameStore } from "../../services/handFrameStore";

/** เส้นเชื่อมจุดบนมือ 21 จุดของ MediaPipe (นิ้วโป้ง ชี้ กลาง นาง ก้อย และฝ่ามือ) */
const BONES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];
const TIPS = [4, 8, 12, 16, 20];

const CYAN = "56, 232, 255";
const HOLD_STYLE: Record<HoldKind, { color: string; label: string }> = {
  listen: { color: "56, 232, 255", label: "ฟังคำสั่ง" },
  stopSpeaking: { color: "251, 191, 36", label: "หยุดพูด" },
  menu: { color: "125, 211, 252", label: "เมนู" },
  confirm: { color: "52, 211, 153", label: "ยืนยัน" },
  cancel: { color: "251, 113, 133", label: "ยกเลิก" },
  sleep: { color: "167, 139, 250", label: "พักลูน่า" },
  select: { color: "52, 211, 153", label: "เลือก" }
};
const FLASH_MS = 220;

/**
 * โครงมือโฮโลแกรมบน canvas เต็มจอ: เส้นกระดูกเรืองแสง วงที่ปลายนิ้วเต็มขึ้นตามการจีบ
 * แวบสว่างตอนคลิก และวงนับถอยหลังรอบฝ่ามือตอนค้างท่า
 * วาดเฉพาะตอนมีเฟรมใหม่ (ราว 30 ครั้งต่อวินาที) ผู้ใช้ที่ตั้งลดการเคลื่อนไหวจะไม่เห็นแสงวาบ
 */
export function HandOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let flashUntil = 0;
    let flashAt: { x: number; y: number } | null = null;
    let flashedFrame: HandFrame | null = null;
    let rafId = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * ratio);
      canvas.height = Math.round(window.innerHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };

    const drawFrame = (frame: HandFrame, now: number) => {
      const { points } = frame;
      context.lineCap = "round";
      context.lineJoin = "round";

      // เส้นกระดูก: ชั้นนอกเรืองแสง ชั้นในคม
      context.shadowColor = `rgba(${CYAN}, 0.9)`;
      context.shadowBlur = 14;
      context.strokeStyle = `rgba(${CYAN}, 0.55)`;
      context.lineWidth = 3;
      context.beginPath();
      for (const [a, b] of BONES) {
        const from = points[a];
        const to = points[b];
        if (!from || !to) continue;
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
      }
      context.stroke();
      context.shadowBlur = 0;

      // ข้อต่อ
      points.forEach((point, i) => {
        context.fillStyle = TIPS.includes(i) ? "rgba(255, 255, 255, 0.95)" : `rgba(${CYAN}, 0.85)`;
        context.beginPath();
        context.arc(point.x, point.y, TIPS.includes(i) ? 3.5 : 2.5, 0, Math.PI * 2);
        context.fill();
      });

      // วงจีบนิ้ว: อยู่กึ่งกลางระหว่างปลายนิ้วโป้งกับนิ้วชี้ เต็มขึ้นเมื่อจีบเข้ามา
      const thumb = points[4];
      const index = points[8];
      if (thumb && index && frame.pinch > 0.05) {
        const x = (thumb.x + index.x) / 2;
        const y = (thumb.y + index.y) / 2;
        context.lineWidth = 2;
        context.strokeStyle = `rgba(${CYAN}, 0.25)`;
        context.beginPath();
        context.arc(x, y, 16, 0, Math.PI * 2);
        context.stroke();
        context.strokeStyle = frame.pinch >= 1 ? "rgba(52, 211, 153, 0.95)" : `rgba(${CYAN}, 0.9)`;
        context.beginPath();
        context.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frame.pinch);
        context.stroke();
      }
      // นับแวบเดียวต่อเฟรม แม้เฟรมเดิมถูกวาดซ้ำระหว่างแสงวาบ
      if (frame.clicked && thumb && index && frame !== flashedFrame) {
        flashedFrame = frame;
        flashAt = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
        flashUntil = now + FLASH_MS;
      }

      // วงนับถอยหลังรอบฝ่ามือ
      if (frame.hold) {
        const style = HOLD_STYLE[frame.hold.kind];
        const { x, y } = frame.palm;
        context.lineWidth = 4;
        context.strokeStyle = `rgba(${style.color}, 0.2)`;
        context.beginPath();
        context.arc(x, y, 38, 0, Math.PI * 2);
        context.stroke();
        context.shadowColor = `rgba(${style.color}, 0.9)`;
        context.shadowBlur = 12;
        context.strokeStyle = `rgba(${style.color}, 0.95)`;
        context.beginPath();
        context.arc(x, y, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frame.hold.progress);
        context.stroke();
        context.shadowBlur = 0;
        context.font = "600 13px 'Plus Jakarta Sans', 'Noto Sans Thai', system-ui, sans-serif";
        context.textAlign = "center";
        context.fillStyle = `rgba(${style.color}, 1)`;
        context.fillText(style.label, x, y + 58);
      }

      // ป้ายชื่อท่า: ลอยเหนือนิ้วที่สูงที่สุด (ป้ายหลังสั่งงานสำเร็จแสดงแทนช่วงสั้น ๆ)
      const label = gestureHintStore.get(now) ?? frame.label;
      if (label && points.length > 0) {
        const top = Math.min(...points.map((point) => point.y));
        const x = Math.min(Math.max(frame.palm.x, 90), window.innerWidth - 90);
        const y = Math.max(top - 22, 24);
        context.font = "600 15px 'Plus Jakarta Sans', 'Noto Sans Thai', system-ui, sans-serif";
        context.textAlign = "center";
        const width = context.measureText(label).width + 20;
        context.fillStyle = "rgba(9, 14, 22, 0.82)";
        context.beginPath();
        context.roundRect(x - width / 2, y - 17, width, 26, 13);
        context.fill();
        context.fillStyle = "rgba(230, 250, 255, 1)";
        context.fillText(label, x, y + 1);
      }
    };

    const draw = () => {
      rafId = 0;
      const now = performance.now();
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const frame = handFrameStore.get();
      if (frame) drawFrame(frame, now);

      // แสงวาบตอนคลิก: ขยายและจางลง (ข้ามถ้าผู้ใช้ตั้งลดการเคลื่อนไหว)
      if (flashAt && now < flashUntil && !reducedMotion) {
        const t = 1 - (flashUntil - now) / FLASH_MS;
        context.fillStyle = `rgba(52, 211, 153, ${0.45 * (1 - t)})`;
        context.beginPath();
        context.arc(flashAt.x, flashAt.y, 16 + 22 * t, 0, Math.PI * 2);
        context.fill();
        rafId = requestAnimationFrame(draw);
      }
    };

    const schedule = () => {
      if (!rafId) rafId = requestAnimationFrame(draw);
    };

    resize();
    const unsubscribe = handFrameStore.subscribe(schedule);
    const unsubscribeHint = gestureHintStore.subscribe(schedule);
    window.addEventListener("resize", resize);
    return () => {
      unsubscribe();
      unsubscribeHint();
      window.removeEventListener("resize", resize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} className="hand-overlay" aria-hidden />;
}
