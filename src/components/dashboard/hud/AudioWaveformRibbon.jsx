import { useMemo } from 'react';

export function AudioWaveformRibbon({ isListening, isSpeaking, isAlert, continuousVoice, onToggleContinuous }) {
  const bars = useMemo(() => Array.from({ length: 28 }, (_, i) => i), []);

  const themeColor = isAlert
    ? 'bg-red-500 shadow-red-500/50'
    : isSpeaking
    ? 'bg-cyan-400 shadow-cyan-400/50'
    : isListening
    ? 'bg-emerald-400 shadow-emerald-400/50'
    : 'bg-cyan-500/40 shadow-cyan-500/20';

  const statusText = isSpeaking
    ? 'J.A.R.V.I.S. SPEAKING (DSP BARITONE)'
    : isListening
    ? 'LISTENING TO SIR ไลท์...'
    : 'VOICE COGNITION READY';

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl border border-cyan-500/30 bg-slate-950/70 backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.12)]">
      {/* Waveform Bars */}
      <div className="h-6 flex items-center justify-center gap-1 w-full overflow-hidden">
        {bars.map((idx) => {
          // Dynamic height based on status and index
          const baseHeight = isSpeaking || isListening ? 6 + ((idx * 7) % 18) : 4;
          return (
            <div
              key={idx}
              className={`w-1 rounded-full transition-all duration-150 ${themeColor}`}
              style={{
                height: `${baseHeight}px`,
                animation: isSpeaking || isListening ? `pulse 0.6s ease-in-out infinite alternate ${idx * 0.04}s` : 'none',
              }}
            />
          );
        })}
      </div>

      {/* Status Bar & Continuous Toggle */}
      <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 px-1 border-t border-slate-800/80 pt-1">
        <span className="flex items-center gap-1.5 text-cyan-300 font-bold tracking-wider">
          <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-cyan-400 animate-ping' : isListening ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          {statusText}
        </span>

        <button
          type="button"
          onClick={onToggleContinuous}
          className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors cursor-pointer border ${
            continuousVoice
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
          }`}
          title="เปิด/ปิดโหมดสนทนาต่อเนื่องอัตโนมัติ (ไม่ต้องกดไมค์ใหม่หลัง AI พูดจบ)"
        >
          {continuousVoice ? '🎙️ AUTO STREAM: ON' : '🎙️ AUTO STREAM: OFF'}
        </button>
      </div>
    </div>
  );
}
