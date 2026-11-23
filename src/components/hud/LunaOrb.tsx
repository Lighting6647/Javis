import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Phase } from "../../conversation/types";
import { ACCENT_RGB, type HudAccent } from "../../services/hudEffectsStore";
import { readOutputLevel } from "../../speech/outputMeter";
import { getSessionMeter } from "../../speech/sessionMeter";

interface LunaOrbProps {
  phase: Phase;
  offline?: boolean;
  thinkHard?: boolean;
  /** สีเน้นจากคำสั่งเสียง ค่าเริ่มต้น cyan ใช้ชุดสีชมพู-ฟ้า-ม่วงของลูน่า สีอื่นจะย้อมวงขีดให้เข้าโทนนั้น */
  accent?: HudAccent;
}

type RGB = [number, number, number];

/** จำนวนขีดรอบวง */
const TICKS = 76;

/** ไล่สีวงขีดตามเข็มนาฬิกาเริ่มจากยอดบน: ฟ้าน้ำทะเล > น้ำเงิน > ม่วง > ลาเวนเดอร์ > ชมพู > ชมพูอมแดง */
const TICK_STOPS: Array<[number, RGB]> = [
  [0.0, [116, 242, 255]],
  [0.22, [92, 176, 255]],
  [0.45, [124, 132, 255]],
  [0.6, [168, 140, 255]],
  [0.75, [236, 146, 230]],
  [0.9, [255, 140, 196]],
  [1.0, [255, 122, 150]]
];

const OFFLINE_RGB: RGB = [248, 113, 113];

function mixRgb(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function tickColor(f: number): RGB {
  for (let i = 1; i < TICK_STOPS.length; i += 1) {
    const [p1, c1] = TICK_STOPS[i]!;
    const [p0, c0] = TICK_STOPS[i - 1]!;
    if (f <= p1) return mixRgb(c0, c1, (f - p0) / (p1 - p0));
  }
  return TICK_STOPS[TICK_STOPS.length - 1]![1];
}

function rgba([r, g, b]: RGB, a: number): string {
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;
}

/** ระยะเชิงมุมแบบวนรอบ (0..0.5 ของรอบ) */
function wrapDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
}

/** ก้อนแสงสีหนึ่งก้อนบนลูกแก้ว: ตำแหน่งสัมพัทธ์กับรัศมี ขนาด สี และความเร็วการลอย */
interface Blob {
  x: number;
  y: number;
  r: number;
  color: RGB;
  alpha: number;
  drift: number;
  seed: number;
}

const BLOBS: Blob[] = [
  { x: 0.0, y: -0.95, r: 0.85, color: [120, 110, 255], alpha: 0.55, drift: 0.12, seed: 0.3 }, // ม่วงน้ำเงินขอบบน
  { x: 0.42, y: -0.38, r: 0.8, color: [255, 110, 225], alpha: 1, drift: 0.16, seed: 1.7 }, // ชมพูบานเย็นขวาบน
  { x: -0.05, y: 0.55, r: 0.8, color: [90, 200, 255], alpha: 0.85, drift: 0.14, seed: 3.1 }, // ฟ้าด้านล่าง
  { x: -0.62, y: -0.05, r: 0.5, color: [255, 170, 140], alpha: 0.55, drift: 0.2, seed: 4.6 }, // พีชขอบซ้าย
  { x: 0.55, y: 0.45, r: 0.55, color: [110, 150, 255], alpha: 0.45, drift: 0.18, seed: 5.9 } // น้ำเงินขวาล่าง
];

/**
 * ภาพหลักของลูน่า: ลูกแก้วแสงนุ่มเปลี่ยนสีช้า ๆ ในวงขีดไล่สีที่ขยับตามเสียง บนพื้นกรมท่าเข้ม
 * วาดด้วย Canvas 2D เต็มจอ (ไม่ต้องใช้ WebGL) รับสถานะเดียวกับแกน 3D เดิม
 * ฟัง: ขีดขยับตามระดับไมโครโฟนจริง / พูด: ขีดเต้นเป็นจังหวะเสียงพูด / คิด: คลื่นวิ่งวนรอบวง / ว่าง: หายใจเบา ๆ
 */
export function LunaOrb({ phase, offline = false, thinkHard = false, accent = "cyan" }: LunaOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ phase, offline, thinkHard, accent });
  useEffect(() => {
    stateRef.current = { phase, offline, thinkHard, accent };
  }, [phase, offline, thinkHard, accent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const micBuf = new Float32Array(16);
    const ticks = new Float32Array(TICKS);
    let level = 0;
    let offlineMix = 0;
    let time = 0;
    let last = performance.now();
    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt * (reduced ? 0.35 : 1);
      const s = stateRef.current;

      // ----- ระดับเสียงรายขีด -----
      let micOk = false;
      if (s.phase === "listening") {
        const meter = getSessionMeter();
        micOk = Boolean(meter && meter.read(micBuf));
      }

      // ความดังจริงของเสียงที่ลูน่ากำลังพูด (null เมื่อเล่นผ่านช่องทางที่วัดไม่ได้)
      const voice = s.phase === "speaking" ? readOutputLevel() : null;

      let overall = 0;
      for (let i = 0; i < TICKS; i += 1) {
        const f = i / TICKS;
        let target: number;
        if (s.offline) {
          target = 0.05;
        } else if (s.phase === "listening") {
          if (micOk) {
            // สะท้อนซ้าย-ขวารอบยอดบน ให้ความถี่ต่ำอยู่บนสุด
            const mirror = 1 - Math.abs(f * 2 - 1);
            const bin = Math.min(micBuf.length - 1, Math.floor((1 - mirror) * micBuf.length));
            target = Math.min(1, (micBuf[bin] ?? 0) * 2.4 + 0.06);
          } else {
            target = 0.18 + 0.12 * Math.sin(time * 2.4 + i * 0.45) * Math.sin(time * 1.1 + i * 0.17);
          }
        } else if (s.phase === "speaking") {
          const env =
            voice !== null
              ? 0.06 + voice * 1.1
              : 0.45 + 0.3 * Math.sin(time * 7.1) * Math.sin(time * 2.3) + 0.15 * Math.sin(time * 13.7);
          const wave = 0.5 + 0.5 * Math.sin(i * 0.9 + time * 9) * Math.sin(i * 0.37 - time * 5.3);
          target = Math.max(0.08, env * (0.35 + wave * 0.9));
        } else if (s.phase === "thinking" || s.phase === "starting") {
          const speed = s.thinkHard ? 0.62 : 0.38;
          const head = (time * speed) % 1;
          let bump = Math.exp(-Math.pow(wrapDist(f, head) / 0.07, 2));
          if (s.thinkHard) bump = Math.max(bump, Math.exp(-Math.pow(wrapDist(f, (head + 0.5) % 1) / 0.07, 2)));
          target = 0.08 + bump * 0.75;
        } else {
          target = 0.07 + 0.05 * (0.5 + 0.5 * Math.sin(time * 1.3 + f * Math.PI * 4));
        }
        const prev = ticks[i] ?? 0;
        ticks[i] = prev + (target - prev) * (target > prev ? 0.35 : 0.12);
        overall += ticks[i] ?? 0;
      }
      overall /= TICKS;
      level += (overall - level) * 0.1;
      offlineMix += ((s.offline ? 1 : 0) - offlineMix) * 0.06;

      // ----- วาด -----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";

      const cx = width / 2;
      const cy = height / 2;
      const short = Math.min(width, height);

      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(width, height) * 0.6);
      bg.addColorStop(0, "#23215e");
      bg.addColorStop(0.45, "#151447");
      bg.addColorStop(1, "#07061a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const breathe = 1 + Math.sin(time * 1.35) * 0.018 + level * 0.07;
      const R = short * 0.19 * breathe;

      // ฮาโลด้านนอกลูกแก้ว
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.55);
      halo.addColorStop(0, rgba(mixRgb([110, 120, 255], OFFLINE_RGB, offlineMix), 0.22 + level * 0.2));
      halo.addColorStop(1, "rgba(60, 60, 200, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);

      // ก้อนสีที่ลอยช้า ๆ
      const spin = time * 0.08;
      for (const b of BLOBS) {
        const ang = Math.atan2(b.y, b.x) + Math.sin(time * b.drift + b.seed) * 0.35 + spin * (thinkHardSpin(s) ? 2.2 : 1);
        const dist = Math.hypot(b.x, b.y) * (1 + Math.sin(time * b.drift * 1.7 + b.seed) * 0.08);
        const bx = cx + Math.cos(ang) * dist * R;
        const by = cy + Math.sin(ang) * dist * R;
        const br = b.r * R * (1 + level * 0.25);
        const col = mixRgb(b.color, OFFLINE_RGB, offlineMix * 0.8);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, rgba(col, b.alpha));
        g.addColorStop(0.55, rgba(col, b.alpha * 0.35));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }

      // แกนขาว
      ctx.globalCompositeOperation = "source-over";
      const coreX = cx - R * 0.08 + Math.sin(time * 0.6) * R * 0.05;
      const coreY = cy - R * 0.02 + Math.cos(time * 0.5) * R * 0.05;
      const core = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, R * 0.98);
      const coreAlpha = 1 - offlineMix * 0.4;
      core.addColorStop(0, `rgba(255, 255, 255, ${coreAlpha})`);
      core.addColorStop(0.42, `rgba(255, 252, 255, ${0.95 * coreAlpha})`);
      core.addColorStop(0.72, `rgba(255, 245, 255, ${0.38 * coreAlpha})`);
      core.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(coreX, coreY, R, 0, Math.PI * 2);
      ctx.fill();

      // เส้นวงในบาง ๆ
      ctx.strokeStyle = `rgba(235, 225, 255, ${0.38 + level * 0.25})`;
      ctx.lineWidth = Math.max(1, R * 0.006);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.0, 0, Math.PI * 2);
      ctx.stroke();

      // วงขีด
      const tint = s.accent !== "cyan" ? ACCENT_RGB[s.accent].main.map((v) => v * 255) as RGB : null;
      const ringR = short * 0.19 * 1.24;
      const baseLen = short * 0.19 * 0.1;
      const maxExtra = short * 0.19 * 0.32;
      const thick = Math.max(2, short * 0.19 * 0.034);
      ctx.lineCap = "round";
      for (let i = 0; i < TICKS; i += 1) {
        const f = i / TICKS;
        const a = -Math.PI / 2 + f * Math.PI * 2;
        const v = ticks[i] ?? 0;
        // ความยาวพื้นฐานแกว่งเล็กน้อยต่อขีด ให้ดูมีชีวิตเหมือนภาพตัวอย่าง
        const jitter = 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(i * 2.17 + 0.6));
        const len = baseLen * jitter + v * maxExtra;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        let col = tickColor(f);
        if (tint) col = mixRgb(col, tint, 0.55);
        col = mixRgb(col, OFFLINE_RGB, offlineMix * 0.75);
        col = mixRgb(col, [255, 255, 255], 0.18);
        const x0 = cx + cos * ringR;
        const y0 = cy + sin * ringR;
        const x1 = cx + cos * (ringR + len);
        const y1 = cy + sin * (ringR + len);

        ctx.strokeStyle = rgba(col, 0.1 + v * 0.2);
        ctx.lineWidth = thick * 2.4;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        ctx.strokeStyle = rgba(col, 0.78 + v * 0.22);
        ctx.lineWidth = thick;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    // คงชื่อคลาส reactor-3d-wrap ไว้ เพื่อให้ CSS เดิมซ่อนแกนเล็กใน Stage ระหว่างโหมดเต็มจอ
    <div
      className="reactor-3d-wrap luna-orb-wrap"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>,
    document.body
  );
}

function thinkHardSpin(s: { phase: Phase; thinkHard: boolean }): boolean {
  return s.phase === "thinking" && s.thinkHard;
}
