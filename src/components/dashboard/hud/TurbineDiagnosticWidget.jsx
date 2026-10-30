import { useEffect, useRef } from 'react';

export function TurbineDiagnosticWidget() {
  const turbineCanvasRef = useRef(null);

  // Rotating 8-Spoke Turbine Engine Canvas
  useEffect(() => {
    const canvas = turbineCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const r = 70;

      ctx.save();

      // Outer Ticks Ring
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 48; i++) {
        const rad = (i / 48) * Math.PI * 2;
        const isMajor = i % 6 === 0;
        const r1 = r + 14;
        const r2 = r + (isMajor ? 22 : 18);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? '#38bdf8' : 'rgba(6, 182, 212, 0.3)';
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.moveTo(cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad));
        ctx.lineTo(cx + r2 * Math.cos(rad), cy + r2 * Math.sin(rad));
        ctx.stroke();
      }

      // Middle Turbine Rim
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // 8 Rotating Radial Spokes (From reference image)
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#06b6d4';
      for (let s = 0; s < 8; s++) {
        const spokeAngle = angle + (s / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + 14 * Math.cos(spokeAngle), cy + 14 * Math.sin(spokeAngle));
        ctx.lineTo(cx + (r - 2) * Math.cos(spokeAngle), cy + (r - 2) * Math.sin(spokeAngle));
        ctx.stroke();
      }

      // Center Hub
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#020b1e';
      ctx.fill();
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center glowing reactor dot
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#38bdf8';
      ctx.fill();

      // Orbiting Cyan Plasma Nodes
      for (let p = 0; p < 4; p++) {
        const pAngle = -angle * 1.5 + (p / 4) * Math.PI * 2;
        const px = cx + (r + 28) * Math.cos(pAngle);
        const py = cy + (r + 28) * Math.sin(pAngle);
        ctx.beginPath();
        ctx.fillStyle = '#38bdf8';
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#38bdf8';
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      angle += 0.02;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div className="flex flex-col space-y-3 w-72 xl:w-80 shrink-0">
      {/* ------------------------------------------------------------ */}
      {/* 1. TOP HAZARD STRIP & LOAD 53% (From Reference Image)        */}
      {/* ------------------------------------------------------------ */}
      <div className="rounded-2xl border border-cyan-500/30 bg-[#020b1e]/85 p-3.5 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between text-[10px] text-cyan-300 font-mono mb-1.5">
          <span className="font-bold">SYSTEM SCAN</span>
          <span className="text-emerald-400 font-bold">78.1 FPS</span>
        </div>

        {/* Hazard Diagonal Striped Bar */}
        <div
          className="h-4 w-full rounded border border-rose-500/60 overflow-hidden"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #ef4444 0, #ef4444 10px, #0f172a 10px, #0f172a 20px)',
          }}
        />

        {/* Real-time ECG Heartbeat Waveform Line from Image (23.9) */}
        <div className="flex items-center justify-between text-[10px] text-cyan-400 mt-2 mb-1">
          <span>CARDIAC & TELEMETRY</span>
          <span className="text-emerald-400 font-bold">23.9</span>
        </div>
        <div className="h-9 w-full rounded-lg bg-slate-950/80 border border-cyan-500/20 px-2 flex items-center overflow-hidden">
          <svg className="w-full h-7 stroke-cyan-400 fill-none" viewBox="0 0 160 28">
            <path
              d="M 0 14 L 30 14 L 38 4 L 46 24 L 54 10 L 62 16 L 70 14 L 110 14 L 118 4 L 126 24 L 134 10 L 142 16 L 160 14"
              strokeWidth="1.8"
              className="drop-shadow-[0_0_6px_#38bdf8]"
            />
          </svg>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* 2. 8-SPOKE ROTATING TURBINE GAUGE (Matching Image 1:1)       */}
      {/* ------------------------------------------------------------ */}
      <div className="relative rounded-2xl border-2 border-cyan-400/40 bg-[#020b1e]/90 p-3 shadow-[0_0_30px_rgba(6,182,212,0.25)] backdrop-blur-md flex flex-col items-center">
        <div className="w-full flex items-center justify-between text-[10px] text-cyan-400 mb-1 px-2">
          <span className="font-bold flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            TURBINE REACTOR 451
          </span>
          <span className="text-cyan-300 font-bold font-mono">66 RPM</span>
        </div>

        {/* Turbine Canvas */}
        <canvas ref={turbineCanvasRef} width={220} height={220} />

        <div className="w-full flex items-center justify-between mt-1 text-[10px] text-slate-400 font-mono px-2">
          <span>Preparation Complete</span>
          <span className="text-cyan-300 font-bold">9.5</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* 3. CONCENTRIC SPIRAL & 5-BAR HISTOGRAM (From Image)          */}
      {/* ------------------------------------------------------------ */}
      <div className="rounded-2xl border border-cyan-500/30 bg-[#020b1e]/85 p-3 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between text-[10px] text-cyan-300 font-bold mb-2">
          <span>PIPELINE CAPACITY</span>
          <span className="text-emerald-400">OPTIMAL</span>
        </div>
        {/* 5 Vertical Glowing Bars */}
        <div className="flex items-end justify-between h-14 px-2 gap-2 bg-slate-950/70 rounded-lg p-2 border border-cyan-500/20">
          {[60, 85, 45, 95, 70].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-cyan-500 shadow-[0_0_8px_#38bdf8] transition-all"
                style={{ height: `${h}%` }}
              />
              <span className="text-[8px] text-slate-400 font-mono">M{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
