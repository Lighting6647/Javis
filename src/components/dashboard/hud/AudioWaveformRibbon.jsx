import { useState, useEffect, useMemo } from 'react';
import { Brain } from 'lucide-react';
import { getStoredMemories } from '../../../services/mem0Service';

export function AudioWaveformRibbon({
  isListening,
  isSpeaking,
  isAlert,
  continuousVoice,
  onToggleContinuous,
  onOpenMem0,
}) {
  const bars = useMemo(() => Array.from({ length: 32 }, (_, i) => i), []);
  const [memoryCount, setMemoryCount] = useState(4);

  useEffect(() => {
    try {
      const mems = getStoredMemories();
      setMemoryCount(mems.length);
    } catch {}
  }, [isSpeaking]);

  const themeColor = isAlert
    ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
    : isSpeaking
    ? 'bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.8)]'
    : isListening
    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
    : 'bg-cyan-500/40 shadow-cyan-500/20';

  const statusText = isSpeaking
    ? 'J.A.R.V.I.S. SPEAKING (DSP BARITONE)'
    : isListening
    ? 'LISTENING TO SIR ไลท์...'
    : 'VOICE COGNITION READY';

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl border border-cyan-500/40 bg-slate-950/80 backdrop-blur-xl shadow-[0_0_25px_rgba(6,182,212,0.15)]">
      {/* 32 Neon Acoustic Waveform Bars */}
      <div className="h-7 flex items-center justify-center gap-1 w-full overflow-hidden px-2">
        {bars.map((idx) => {
          // Sinusoidal energy pattern for authentic Iron Man HUD aesthetic
          const centerDist = Math.abs(idx - 15.5) / 15.5;
          const energyFactor = 1 - centerDist * 0.45;
          const dynamicHeight = isSpeaking || isListening
            ? Math.max(5, Math.min(24, Math.round((8 + ((idx * 9) % 18)) * energyFactor)))
            : Math.max(3, Math.round(5 * energyFactor));

          return (
            <div
              key={idx}
              className={`w-1 rounded-full transition-all duration-150 ${themeColor}`}
              style={{
                height: `${dynamicHeight}px`,
                animation:
                  isSpeaking || isListening
                    ? `pulse 0.45s ease-in-out infinite alternate ${(idx * 0.035).toFixed(3)}s`
                    : 'none',
              }}
            />
          );
        })}
      </div>

      {/* Control Bar: Status + Mem0 Indicator + Continuous Stream Toggle */}
      <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 px-1 border-t border-slate-800/80 pt-1.5">
        <span className="flex items-center gap-1.5 text-cyan-300 font-bold tracking-wider">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isSpeaking
                ? 'bg-cyan-400 animate-ping'
                : isListening
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-slate-500'
            }`}
          />
          {statusText}
        </span>

        <div className="flex items-center gap-2">
          {/* Mem0 Long-term Memory Pill */}
          <button
            type="button"
            onClick={onOpenMem0}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-purple-950/70 border border-purple-500/50 text-purple-300 hover:bg-purple-900/80 hover:text-white transition-all cursor-pointer shadow-sm hover:scale-105"
            title="เปิดดูและจัดการความจำระยะยาวของ J.A.R.V.I.S. (Mem0 Ecosystem Context)"
          >
            <Brain className="w-2.5 h-2.5 text-purple-400 animate-pulse" />
            <span>MEM0 ({memoryCount})</span>
          </button>

          {/* Hands-free Continuous Loop Switch */}
          <button
            type="button"
            onClick={onToggleContinuous}
            className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer border ${
              continuousVoice
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 hover:bg-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
            }`}
            title="เปิด/ปิดโหมดสนทนาต่อเนื่องอัตโนมัติ (ไม่ต้องกดไมค์ใหม่หลัง AI พูดจบ)"
          >
            {continuousVoice ? '🎙️ AUTO STREAM: ON' : '🎙️ AUTO STREAM: OFF'}
          </button>
        </div>
      </div>
    </div>
  );
}
