import { useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';

export function CenterTargetingReactor({
  hudState,
  isListening,
  isSpeaking,
  onToggleMic,
  activeSquadId,
  wakeWordActive,
}) {
  const reactorCanvasRef = useRef(null);

  // Multi-layered Concentric Reactor & Targeting Reticle Canvas
  useEffect(() => {
    const canvas = reactorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const baseR = 125;

      const isLive = hudState === 'LISTENING' || hudState === 'SPEAKING' || hudState === 'SEARCHING';
      const mainColor = isLive ? '#38bdf8' : '#06b6d4';

      ctx.save();

      // 1. Outer Calibration 360-Degree Ring
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 32, 0, Math.PI * 2);
      ctx.stroke();

      // Degree Ticks around Ring
      for (let i = 0; i < 72; i++) {
        const rad = (i / 72) * Math.PI * 2;
        const isMajor = i % 6 === 0;
        const r1 = baseR + 32;
        const r2 = baseR + (isMajor ? 44 : 38);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? '#38bdf8' : 'rgba(6, 182, 212, 0.3)';
        ctx.lineWidth = isMajor ? 2 : 1;
        ctx.moveTo(cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad));
        ctx.lineTo(cx + r2 * Math.cos(rad), cy + r2 * Math.sin(rad));
        ctx.stroke();
      }

      // 2. Segmented Rotating Gyro Ring (Upper & Lower Heavy Arcs from Image)
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#06b6d4';
      ctx.arc(cx, cy, baseR + 18, angle, angle + Math.PI * 0.7);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 18, angle + Math.PI, angle + Math.PI * 1.7);
      ctx.stroke();

      // 3. Counter-Rotating Inner Gyro Ring
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.6)';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 8;
      ctx.arc(cx, cy, baseR + 4, -angle * 1.3, -angle * 1.3 + Math.PI * 0.8);
      ctx.stroke();

      // 4. Geodesic Sphere Mesh Wireframe
      const numLat = 8;
      for (let i = 1; i < numLat; i++) {
        const latAngle = (i / numLat) * Math.PI - Math.PI / 2;
        const latR = baseR * Math.cos(latAngle);
        const yOffset = baseR * Math.sin(latAngle);

        const rX = Math.max(0.1, Math.abs(latR));
        const rY = Math.max(0.1, Math.abs(latR * 0.35));
        ctx.beginPath();
        ctx.strokeStyle = isLive ? 'rgba(56, 189, 248, 0.35)' : 'rgba(6, 182, 212, 0.2)';
        ctx.lineWidth = 1;
        ctx.ellipse(cx, cy + yOffset, rX, rY, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const numLong = 10;
      for (let i = 0; i < numLong; i++) {
        const longAngle = angle + (i / numLong) * Math.PI;
        const rXLong = Math.max(0.1, Math.abs(baseR * Math.sin(longAngle)));
        ctx.beginPath();
        ctx.strokeStyle = isLive ? 'rgba(56, 189, 248, 0.45)' : 'rgba(6, 182, 212, 0.25)';
        ctx.lineWidth = 1;
        ctx.ellipse(cx, cy, rXLong, baseR, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 5. Center High-Energy Reactor Core
      const coreR = isLive ? 24 + Math.sin(angle * 8) * 4 : 18;
      const gradient = ctx.createRadialGradient(cx, cy, 2, cx, cy, coreR * 2.2);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.35, mainColor);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // 6. Multi-Agent Delegation Laser Nodes
      const agents = [
        { id: 'manager', label: 'AI Manager', color: '#06b6d4' },
        { id: 'sales', label: 'AI เลขา', color: '#10b981' },
        { id: 'dev', label: 'AI Dev', color: '#a855f7' },
        { id: 'accounting', label: 'AI บัญชี', color: '#f59e0b' },
        { id: 'admin', label: 'AI Admin', color: '#3b82f6' },
      ];

      const orbitR = baseR + 56;
      agents.forEach((ag, idx) => {
        const agAngle = angle * 0.5 + (idx / agents.length) * Math.PI * 2;
        const ax = cx + orbitR * Math.cos(agAngle);
        const ay = cy + orbitR * Math.sin(agAngle) * 0.6;
        const isDelegated = activeSquadId === ag.id || (hudState === 'SEARCHING' && idx % 2 === 0);

        if (isDelegated) {
          ctx.beginPath();
          ctx.strokeStyle = ag.color;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 12;
          ctx.shadowColor = ag.color;
          ctx.moveTo(cx, cy);
          ctx.lineTo(ax, ay);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.fillStyle = isDelegated ? '#ffffff' : ag.color;
        ctx.shadowBlur = isDelegated ? 16 : 6;
        ctx.shadowColor = ag.color;
        ctx.arc(ax, ay, isDelegated ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = isDelegated ? '#ffffff' : 'rgba(255,255,255,0.7)';
        ctx.fillText(ag.label, ax + 7, ay + 3);
      });

      ctx.restore();

      angle += isLive ? 0.03 : 0.012;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [hudState, activeSquadId]);

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center px-2 lg:px-4">
      {/* Top Cockpit Reactor Telemetry (From Reference Image) */}
      <div className="w-full flex items-center justify-between text-[11px] font-mono tracking-widest text-cyan-400 mb-1 px-4">
        <span>LORD 62%</span>
        <span className="text-cyan-300 font-bold">WARNING LOAD 53%</span>
      </div>

      {/* Center Reticle Canvas & Interactive Mic Orb */}
      <div className="relative flex items-center justify-center">
        <canvas
          ref={reactorCanvasRef}
          width={390}
          height={390}
          className="cursor-pointer transition-transform hover:scale-105"
          onClick={onToggleMic}
          title="แตะเพื่อเริ่มพูดคุยสั่งการ"
        />

        {/* Center Crosshair Status Text (Preparation Complete from Image) */}
        <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-cyan-300 tracking-wider">
          Preparation Complete
        </div>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-cyan-300 tracking-wider">
          Preparation Complete
        </div>

        {/* Core Touch Mic Button */}
        <button
          type="button"
          onClick={onToggleMic}
          className={`absolute flex h-16 w-16 items-center justify-center rounded-full transition-all shadow-2xl backdrop-blur-md cursor-pointer ${
            isListening
              ? 'bg-red-500/30 border-2 border-red-400 text-red-200 animate-pulse shadow-red-500/60'
              : 'bg-cyan-500/20 border-2 border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/35 hover:scale-110 shadow-cyan-500/40'
          }`}
          title="กดเพื่อเปิด/ปิดไมโครโฟน"
        >
          <Mic className={`h-7 w-7 ${isListening ? 'text-red-300' : 'text-cyan-300'}`} />
        </button>

        {/* Tactical Elevation Numbers from Image (28, 16.1, 18.2, 6.6, 7.5) */}
        <div className="pointer-events-none absolute right-16 top-16 text-[10px] font-bold text-cyan-300">
          <div>28</div>
          <div>16.1</div>
          <div>18.2</div>
          <div>6.6</div>
        </div>
        <div className="pointer-events-none absolute bottom-12 text-[11px] font-bold text-cyan-300">
          7.5
        </div>
      </div>

      {/* State Status Text */}
      <div className="mt-2 text-center">
        <span className="text-xs font-mono font-black tracking-[0.25em] text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.9)]">
          {hudState === 'LISTENING' && 'L I S T E N I N G . . .'}
          {hudState === 'SEARCHING' && 'M U L T I - A G E N T   S Y N C . . .'}
          {hudState === 'SPEAKING' && 'S P E A K I N G . . .'}
          {hudState === 'READY' && 'L I S T E N I N G'}
        </span>
      </div>

      {/* Audio Waveform (Undulating Cyan Sine Wave matching image) */}
      <div className="mt-2 flex items-center justify-center">
        <svg
          className="w-56 h-7 stroke-cyan-400 fill-none drop-shadow-[0_0_10px_rgba(56,189,248,0.85)]"
          viewBox="0 0 200 24"
        >
          <path
            d={
              isListening || isSpeaking
                ? 'M 10 12 Q 35 2, 60 12 T 100 12 T 140 12 T 180 12'
                : 'M 10 12 Q 35 8, 60 12 T 100 12 T 140 12 T 180 12'
            }
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Voice Prompt Pill */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMic}
          className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition-all shadow-lg cursor-pointer ${
            isListening
              ? 'border border-red-500/80 bg-red-950/70 text-red-200 animate-pulse'
              : isSpeaking
              ? 'border border-sky-400 bg-sky-950/70 text-sky-200 animate-pulse'
              : 'border border-cyan-400/80 bg-cyan-950/80 text-cyan-200 hover:bg-cyan-900/90 hover:scale-105'
          }`}
        >
          <Mic className="h-4 w-4" />
          <span>
            {isListening
              ? '🎙️ รับฟังภาษาไทยอยู่ครับ... (สั่งงานได้ทันที)'
              : isSpeaking
              ? '🔊 กำลังพูดตอบกลับ...'
              : '🎙️ พูดคุยโต้ตอบภาษาไทย (คลิกเปิดไมค์)'}
          </span>
        </button>
      </div>

      <span className="text-[10px] text-slate-400 mt-1">
        {wakeWordActive
          ? 'ระบบ Standby: เรียก "จาร์วิส" หรือ "javis" ได้ตลอดเวลา'
          : 'คลิกปุ่มเพื่อเริ่มพูด'}
      </span>
    </div>
  );
}
