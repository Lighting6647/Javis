import { useEffect, useRef } from "react";
import type { Phase } from "../../conversation/types";
import { getSessionMeter } from "../../speech/sessionMeter";

interface OrbitalEnergyCoreProps {
  phase: Phase;
  offline?: boolean;
  thinkHard?: boolean;
}

interface Palette {
  primary: string;
  secondary: string;
  glow: string;
}

const PALETTES: Record<Phase | "offline" | "thinkHard", Palette> = {
  idle: { primary: "34, 211, 238", secondary: "45, 212, 191", glow: "14, 165, 233" },
  starting: { primary: "34, 211, 238", secondary: "56, 189, 248", glow: "34, 211, 238" },
  listening: { primary: "52, 211, 153", secondary: "34, 211, 238", glow: "16, 185, 129" },
  thinking: { primary: "251, 191, 36", secondary: "34, 211, 238", glow: "245, 158, 11" },
  thinkHard: { primary: "251, 146, 60", secondary: "34, 211, 238", glow: "249, 115, 22" },
  speaking: { primary: "56, 189, 248", secondary: "251, 191, 36", glow: "34, 211, 238" },
  offline: { primary: "248, 113, 113", secondary: "251, 146, 60", glow: "239, 68, 68" }
};

function resolvePalette(phase: Phase, offline: boolean, thinkHard: boolean): Palette {
  if (offline) return PALETTES.offline;
  if (phase === "thinking" && thinkHard) return PALETTES.thinkHard;
  return PALETTES[phase];
}

/**
 * แกนพลังงานวงแหวนแสงโคจร (Orbital Energy Core) ตอบสนองตามจังหวะเสียงและสถานะของ Javis
 * หยุดแอนิเมชันอัตโนมัติเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหวหรือซ่อนหน้าต่าง
 */
export function OrbitalEnergyCore({ phase, offline = false, thinkHard = false }: OrbitalEnergyCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ phase, offline, thinkHard });

  useEffect(() => {
    stateRef.current = { phase, offline, thinkHard };
  }, [phase, offline, thinkHard]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const size = 320;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    let rafId = 0;
    let t = 0;
    let lastTime = performance.now();
    const micBuffer = new Float32Array(24);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const current = stateRef.current;
      const palette = resolvePalette(current.phase, current.offline, current.thinkHard);
      const meter = current.phase === "listening" ? getSessionMeter() : null;

      let avgMic = 0;
      if (meter && meter.read(micBuffer)) {
        let sum = 0;
        for (let i = 0; i < micBuffer.length; i += 1) sum += micBuffer[i] ?? 0;
        avgMic = sum / micBuffer.length;
      }

      const speed =
        current.phase === "thinking"
          ? current.thinkHard
            ? 2.2
            : 1.55
          : current.phase === "speaking"
            ? 1.45
            : current.phase === "listening"
              ? 1.15 + avgMic * 1.4
              : 0.65;

      if (!reduceMotion) t += dt * speed;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const baseRadius = 88;
      const energy =
        current.phase === "listening"
          ? 0.4 + avgMic * 1.2
          : current.phase === "speaking"
            ? 0.72 + Math.sin(t * 5.2) * 0.18
            : current.phase === "thinking"
              ? 0.65
              : 0.28;

      // แสงฟุ้งรอบแกนกลาง
      const aura = ctx.createRadialGradient(cx, cy, 12, cx, cy, 146);
      aura.addColorStop(0, `rgba(${palette.primary}, ${0.32 + energy * 0.2})`);
      aura.addColorStop(0.45, `rgba(${palette.glow}, ${0.14 + energy * 0.12})`);
      aura.addColorStop(1, "rgba(2, 11, 20, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, 146, 0, Math.PI * 2);
      ctx.fill();

      // ริบบิ้นเส้นแสงโคจร 4 วง
      const ribbons = 4;
      for (let r = 0; r < ribbons; r += 1) {
        const tilt = (r * Math.PI) / ribbons + t * (r % 2 === 0 ? 0.42 : -0.36);
        const rx = baseRadius + 16 + Math.sin(t * 1.3 + r) * (6 + energy * 10);
        const ry = baseRadius * (0.58 + (r % 2) * 0.14) + energy * 8;
        const alpha = 0.28 + (r === 0 ? 0.35 : 0.18) + energy * 0.22;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.beginPath();
        const steps = 72;
        for (let i = 0; i <= steps; i += 1) {
          const a = (i / steps) * Math.PI * 2;
          const wave = Math.sin(a * 3 + t * 2.4 + r * 1.7) * (2.5 + energy * 6.5);
          const x = Math.cos(a) * (rx + wave);
          const y = Math.sin(a) * (ry + wave * 0.6);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${r % 2 === 0 ? palette.primary : palette.secondary}, ${Math.min(0.88, alpha)})`;
        ctx.lineWidth = r === 0 ? 2.1 : 1.35;
        ctx.shadowColor = `rgba(${palette.primary}, 0.55)`;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }

      // วงแหวนหลักตรงกลางที่คมชัด
      const ringRadius = 64 + energy * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${palette.primary}, 0.78)`;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = `rgba(${palette.primary}, 0.7)`;
      ctx.shadowBlur = 16;
      ctx.stroke();

      // อนุภาคละอองแสงรอบแกน
      const particles = 20;
      for (let p = 0; p < particles; p += 1) {
        const angle = (p / particles) * Math.PI * 2 + t * (0.5 + (p % 3) * 0.2);
        const dist = baseRadius + 10 + Math.sin(t * 2 + p * 1.3) * (14 + energy * 10);
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist * 0.88;
        const pr = 1.1 + ((p % 3) * 0.45) + energy * 0.6;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p % 2 === 0 ? palette.primary : palette.secondary}, ${0.35 + (p % 4) * 0.14})`;
        ctx.fill();
      }

      ctx.restore();

      if (!reduceMotion && !document.hidden) {
        rafId = requestAnimationFrame(draw);
      }
    };

    const onVisibility = () => {
      cancelAnimationFrame(rafId);
      if (!document.hidden && !reduceMotion) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(draw);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="orbital-energy-canvas" aria-hidden />;
}
