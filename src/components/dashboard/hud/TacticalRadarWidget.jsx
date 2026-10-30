import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { playClickSound } from '../../../utils/soundEffects';

export function TacticalRadarWidget({ onDispatchCommand }) {
  const radarCanvasRef = useRef(null);
  const globeCanvasRef = useRef(null);

  // 1. Tactical Sonar Radar Sweep Animation
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let angle = 0;

    // Simulated targets on radar (Red blips matching reference image)
    const targets = [
      { r: 48, a: 0.9, label: 'LEAD-01' },
      { r: 72, a: 1.4, label: 'WEBAPP-DEAL' },
      { r: 60, a: 2.1, label: 'QU-READY' },
      { r: 84, a: 2.8, label: 'POS-LIGHT' },
    ];

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = 98;

      ctx.save();

      // Outer Glow Border
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.stroke();

      // Concentric Range Rings
      [28, 52, 76, maxR].forEach((r, idx) => {
        ctx.beginPath();
        ctx.strokeStyle = idx === 3 ? '#06b6d4' : 'rgba(6, 182, 212, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash(idx % 2 === 0 ? [4, 4] : []);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Crosshairs & Angle Divisions
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // Rotating Radar Sweep Cone
      const sweepGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, maxR);
      sweepGrad.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
      sweepGrad.addColorStop(1, 'rgba(16, 185, 129, 0.25)');

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, angle - 0.45, angle);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Sweep Line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.strokeStyle = '#6ee7b7';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#10b981';
      ctx.stroke();

      // Target Blips (Red dots from reference image)
      targets.forEach((t) => {
        const tx = cx + t.r * Math.cos(t.a);
        const ty = cy + t.r * Math.sin(t.a);
        const distAngle = Math.abs((angle % (Math.PI * 2)) - t.a);
        const isIlluminated = distAngle < 0.5;

        ctx.beginPath();
        ctx.fillStyle = isIlluminated ? '#ff2a55' : 'rgba(239, 68, 68, 0.5)';
        ctx.shadowBlur = isIlluminated ? 14 : 4;
        ctx.shadowColor = '#ef4444';
        ctx.arc(tx, ty, isIlluminated ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      angle += 0.025;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, []);

  // 2. Holographic Rotating Globe Animation
  useEffect(() => {
    const canvas = globeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const r = 36;

      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;

      // Latitude lines
      for (let i = -2; i <= 2; i++) {
        const yr = Math.max(0.1, Math.sqrt(Math.max(0, r * r - (i * 12) * (i * 12))));
        ctx.beginPath();
        ctx.ellipse(cx, cy + i * 11, yr, yr * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rotating Longitude lines
      for (let j = 0; j < 6; j++) {
        const lonAngle = angle + (j / 6) * Math.PI;
        const rXLon = Math.max(0.1, Math.abs(r * Math.sin(lonAngle)));
        ctx.beginPath();
        ctx.ellipse(cx, cy, rXLon, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Center glowing beacon
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#38bdf8';
      ctx.fill();

      ctx.restore();

      angle += 0.015;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div className="flex flex-col space-y-4 w-72 xl:w-80 shrink-0">
      {/* ------------------------------------------------------------ */}
      {/* 1. TOP DIALS & OSCILLOSCOPE (From Reference Image)            */}
      {/* ------------------------------------------------------------ */}
      <div className="rounded-2xl border border-cyan-500/30 bg-[#020b1e]/85 p-3.5 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-cyan-300 tracking-wider">
            RADAR TELEMETRY // LOAD 62%
          </span>
          <span className="text-[9px] text-emerald-400 font-bold">12.1 NM</span>
        </div>

        {/* 5 Circular Gauge Dials */}
        <div className="flex items-center justify-between px-1 mb-3">
          {[18, 55, 30, 80, 45].map((val, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <div className="relative h-7 w-7 rounded-full border border-cyan-400/50 bg-cyan-950/40 flex items-center justify-center">
                {/* Needle */}
                <div
                  className="absolute h-3 w-0.5 bg-cyan-300 origin-bottom rounded-full"
                  style={{ transform: `rotate(${val * 3.6}deg)` }}
                />
                <div className="h-1.5 w-1.5 rounded-full bg-white z-10" />
              </div>
              <span className="text-[8px] text-cyan-400/80 font-mono mt-0.5">
                {idx === 2 ? '2.2' : idx === 3 ? '4.8' : val}
              </span>
            </div>
          ))}
        </div>

        {/* Audio Sine Waveform Oscilloscope */}
        <div className="h-9 w-full rounded-lg bg-slate-950/80 border border-cyan-500/20 px-2 flex items-center overflow-hidden">
          <svg className="w-full h-7 stroke-cyan-400 fill-none" viewBox="0 0 160 28">
            <path
              d="M 0 14 Q 20 2, 40 14 T 80 14 T 120 14 T 160 14"
              strokeWidth="1.8"
              className="drop-shadow-[0_0_6px_#38bdf8]"
            />
          </svg>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* 2. TACTICAL SONAR / RADAR SWEEP (Matching Image 1:1)         */}
      {/* ------------------------------------------------------------ */}
      <div className="relative rounded-2xl border-2 border-cyan-400/40 bg-[#020b1e]/90 p-3 shadow-[0_0_30px_rgba(6,182,212,0.25)] backdrop-blur-md flex flex-col items-center">
        <div className="w-full flex items-center justify-between text-[10px] text-cyan-400 mb-1 px-2">
          <span className="font-bold flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            TACTICAL SONAR SCANNER
          </span>
          <span className="text-emerald-400 font-bold font-mono">1.8 KM</span>
        </div>

        {/* Sonar Canvas */}
        <canvas
          ref={radarCanvasRef}
          width={220}
          height={220}
          className="cursor-pointer transition-transform hover:scale-105"
          onClick={() => {
            playClickSound();
            if (onDispatchCommand) onDispatchCommand('ตรวจระบบทั้งหมด');
          }}
          title="คลิกเพื่อสั่ง AI ตรวจสแกนโปรเจกต์ทั้งหมด"
        />

        {/* Bottom Tag */}
        <div className="w-full flex items-center justify-between mt-2 pt-2 border-t border-cyan-500/20 text-[10px]">
          <span className="text-cyan-300 font-mono tracking-wider">ARTIFICIAL INTELLIGENCE</span>
          <span className="text-rose-400 font-bold font-mono">4 TARGETS ACQUIRED</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* 3. HOLOGRAPHIC REVOLVING GLOBE & SEARCH (From Image)         */}
      {/* ------------------------------------------------------------ */}
      <div className="rounded-2xl border border-cyan-500/30 bg-[#020b1e]/85 p-3 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <canvas ref={globeCanvasRef} width={80} height={80} className="shrink-0" />
          <div className="space-y-1 text-xs flex-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-cyan-300 font-bold">13 Scanning...</span>
              <span className="text-emerald-400 font-bold">EPS10</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              AI Sales & Dev Pipeline monitoring 17 active workspace folders.
            </p>
            {/* Search Input Widget from Image */}
            <div className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-slate-950/80 px-2 py-1 mt-1">
              <Search className="h-3 w-3 text-cyan-400" />
              <input
                type="text"
                placeholder="Search..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim() && onDispatchCommand) {
                    onDispatchCommand(e.target.value.trim());
                    e.target.value = '';
                  }
                }}
                className="w-full bg-transparent text-[10px] text-cyan-200 placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
