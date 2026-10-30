import React from 'react';
import { Volume2, Printer } from 'lucide-react';

export function CockpitCanopyFrame({
  userTitle,
  onCycleTitle,
  wakeWordActive,
  onToggleWakeWord,
  onTestThaiVoice,
  currentTime,
  onToggleFullscreen,
  onOpenAdmin,
  onOpenCompany,
  children,
}) {
  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-[#020713] text-cyan-400 font-mono select-none">
      {/* ------------------------------------------------------------ */}
      {/* 0. PURE HOLOGRAPHIC AMBIENCE (Zero Static Background Image)   */}
      {/* ------------------------------------------------------------ */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
        <div className="absolute inset-0 bg-radial from-cyan-950/20 via-[#010614]/90 to-[#010614]" />
        <div className="absolute inset-0 opacity-15 bg-[linear-gradient(to_right,#00f0ff15_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff15_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* ------------------------------------------------------------ */}
      {/* 1. CURVED HUD LADDERS (Far Left & Far Right from Image)       */}
      {/* ------------------------------------------------------------ */}
      {/* Left Curved Velocity / Altitude Scale (16.7) */}
      <div className="pointer-events-none fixed left-1.5 top-1/2 -translate-y-1/2 z-30 hidden 2xl:flex items-center gap-1 opacity-80">
        <span className="text-[11px] font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]">
          16.7
        </span>
        <svg className="w-12 h-[520px] stroke-cyan-400 fill-none" viewBox="0 0 48 520">
          <path d="M 40 10 Q 6 260, 40 510" strokeWidth="2.5" strokeLinecap="round" />
          {Array.from({ length: 32 }).map((_, i) => {
            const y = 20 + i * 15.5;
            const isMajor = i % 4 === 0;
            const x1 = 40 - Math.sin((i / 32) * Math.PI) * 32;
            const x2 = x1 - (isMajor ? 14 : 7);
            return (
              <line
                key={i}
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                strokeWidth={isMajor ? 2 : 1}
                stroke={isMajor ? '#38bdf8' : 'rgba(56,189,248,0.4)'}
              />
            );
          })}
        </svg>
      </div>

      {/* Right Curved Altitude / Pitch Scale (1.4, 0.6, 2.17) */}
      <div className="pointer-events-none fixed right-1.5 top-1/2 -translate-y-1/2 z-30 hidden 2xl:flex items-center gap-1 opacity-80">
        <svg className="w-12 h-[520px] stroke-cyan-400 fill-none" viewBox="0 0 48 520">
          <path d="M 8 10 Q 42 260, 8 510" strokeWidth="2.5" strokeLinecap="round" />
          {Array.from({ length: 32 }).map((_, i) => {
            const y = 20 + i * 15.5;
            const isMajor = i % 4 === 0;
            const x1 = 8 + Math.sin((i / 32) * Math.PI) * 32;
            const x2 = x1 + (isMajor ? 14 : 7);
            return (
              <line
                key={i}
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                strokeWidth={isMajor ? 2 : 1}
                stroke={isMajor ? '#38bdf8' : 'rgba(56,189,248,0.4)'}
              />
            );
          })}
        </svg>
        <div className="flex flex-col justify-between h-[480px] text-[11px] font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] py-4">
          <span>1.4</span>
          <span>0.6</span>
          <span>2.17</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* 2. TOP VISOR CANOPY & STATUS BAR (Matching Reference Image)  */}
      {/* ------------------------------------------------------------ */}
      <header className="relative z-30 border-b border-cyan-500/30 bg-[#010918]/90 backdrop-blur-md px-4 lg:px-8 py-2.5 shadow-2xl">
        <div className="flex items-center justify-between">
          {/* Left: J.A.R.V.I.S. MK III Identity */}
          <div className="flex items-center gap-3">
            <span className="text-base font-black tracking-[0.25em] text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.9)]">
              J . A . R . V . I . S .
            </span>
            <span className="rounded border border-cyan-400/50 bg-cyan-950/70 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
              MK III
            </span>
            <div className="hidden sm:flex items-center gap-1.5 rounded border border-emerald-500/40 bg-slate-900/80 px-2 py-0.5 text-[10px] text-emerald-300">
              <Printer className="h-3 w-3 text-emerald-400" />
              <span>2 PRINTERS ONLINE</span>
            </div>
          </div>

          {/* Center Top: 6 Glowing Status Circles from Image */}
          <div className="hidden md:flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="relative flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-950/40 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
              >
                <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              </div>
            ))}
            <span className="ml-2 text-[10px] text-cyan-300/80 tracking-widest uppercase">
              NODE SYNC 100%
            </span>
          </div>

          {/* Right Top: Controls, Environment & sir ไลท์ */}
          <div className="flex items-center gap-3 text-xs">
            {/* Honorific Switcher */}
            <button
              type="button"
              onClick={onCycleTitle}
              className="flex items-center gap-1.5 rounded-full border border-cyan-400/60 bg-cyan-950/70 px-3 py-1 text-[11px] font-bold text-cyan-200 hover:bg-cyan-900/60 transition-all shadow-[0_0_10px_rgba(6,182,212,0.3)] cursor-pointer"
              title="สลับคำเรียก: sir ไลท์ / ท่านประธาน / ผู้การ / คุณผู้ชาย"
            >
              <span>🎖️ {userTitle}</span>
            </button>

            {/* Thai Voice Sound Test */}
            <button
              type="button"
              onClick={onTestThaiVoice}
              className="hidden lg:flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-950/60 px-2.5 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-900/60 transition-all cursor-pointer"
              title="ทดสอบฟังเสียงภาษาไทย"
            >
              <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>เสียงไทย</span>
            </button>

            {/* Wake Word Badge */}
            <button
              type="button"
              onClick={onToggleWakeWord}
              className={`hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all cursor-pointer ${
                wakeWordActive
                  ? 'border-cyan-400/70 bg-cyan-950/80 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'border-slate-800 bg-slate-900 text-slate-500'
              }`}
              title="คลิกเปิด/ปิดการดักฟัง wake word javis อัตโนมัติ"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  wakeWordActive ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'
                }`}
              />
              <span>WAKE: JAVIS {wakeWordActive ? '[ON]' : '[OFF]'}</span>
            </button>

            {/* Time & Window */}
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-300 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-cyan-500/30">
              <span>🕒 {currentTime || '03:25:18 AM'}</span>
            </div>

            {/* Quick App Link */}
            {onOpenCompany && (
              <button
                type="button"
                onClick={onOpenCompany}
                className="hidden xl:inline-flex rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-900/50"
              >
                AI COMPANY
              </button>
            )}

            {/* Window Controls */}
            <div className="flex items-center gap-1 text-slate-400 text-xs">
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 hover:text-cyan-300"
                title="เต็มจอ"
              >
                ◻
              </button>
              {onOpenAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 hover:text-red-400"
                  title="หน้า Admin"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Cockpit Space */}
      <main className="relative z-10 w-full p-3 lg:p-6">{children}</main>
    </div>
  );
}
