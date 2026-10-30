import { useState, useRef, useEffect } from 'react';
import { Mic, Send, Volume2, Search, X } from 'lucide-react';
import { playClickSound } from '../../../utils/soundEffects';

export function StarkWorkshopView({
  userTitle,
  onCycleTitle,
  wakeWordActive,
  onToggleWakeWord,
  onTestThaiVoice,
  currentTime,
  onToggleFullscreen,
  onOpenAdmin,
  onOpenCompany,
  messages,
  onDispatchCommand,
  isListening,
  isSpeaking,
  hudState,
  onToggleMic,
  activeSquadId,
  activeHologram,
  onDismissHologram,
}) {
  const [inputText, setInputText] = useState('');
  const [searchProject, setSearchProject] = useState('');
  const canvasRef = useRef(null);
  const chatScrollRef = useRef(null);

  // Auto scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Canvas 3D Holographic Wireframe Arc Reactor Sphere (Stark Workshop Edition)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const baseR = 120;

      const isLive = hudState === 'LISTENING' || hudState === 'SPEAKING' || hudState === 'SEARCHING';
      const mainColor = isLive ? '#38bdf8' : '#00f0ff';

      ctx.save();

      // Outer Concentric Degrees / Tick Ring
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 32, 0, Math.PI * 2);
      ctx.stroke();

      // 48 Degree Tick Marks
      for (let i = 0; i < 48; i++) {
        const rad = (i / 48) * Math.PI * 2;
        const isMajor = i % 4 === 0;
        const r1 = baseR + 32;
        const r2 = baseR + (isMajor ? 44 : 38);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? '#38bdf8' : 'rgba(0, 240, 255, 0.3)';
        ctx.lineWidth = isMajor ? 2 : 1;
        ctx.moveTo(cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad));
        ctx.lineTo(cx + r2 * Math.cos(rad), cy + r2 * Math.sin(rad));
        ctx.stroke();
      }

      // Upper & Lower Segmented Rotating Gyro Arcs
      ctx.beginPath();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00f0ff';
      ctx.arc(cx, cy, baseR + 18, angle, angle + Math.PI * 0.7);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 18, angle + Math.PI, angle + Math.PI * 1.7);
      ctx.stroke();

      // Counter-Rotating Inner Gyro Ring
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 2;
      ctx.arc(cx, cy, baseR + 4, -angle * 1.4, -angle * 1.4 + Math.PI * 0.85);
      ctx.stroke();

      // 3D Spherical Geodesic Wireframe Lattice
      const numLat = 9;
      for (let i = 1; i < numLat; i++) {
        const latAngle = (i / numLat) * Math.PI - Math.PI / 2;
        const latR = baseR * Math.cos(latAngle);
        const yOffset = baseR * Math.sin(latAngle);

        ctx.beginPath();
        ctx.strokeStyle = isLive ? 'rgba(56, 189, 248, 0.45)' : 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.ellipse(cx, cy + yOffset, latR, latR * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const numLong = 12;
      for (let i = 0; i < numLong; i++) {
        const longAngle = angle + (i / numLong) * Math.PI;
        ctx.beginPath();
        ctx.strokeStyle = isLive ? 'rgba(56, 189, 248, 0.55)' : 'rgba(0, 240, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.ellipse(cx, cy, baseR * Math.sin(longAngle), baseR, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Glowing Vertices at Geodesic Intersections
      for (let i = 1; i < numLat; i += 2) {
        const latAngle = (i / numLat) * Math.PI - Math.PI / 2;
        const latR = baseR * Math.cos(latAngle);
        const yOffset = baseR * Math.sin(latAngle);
        for (let j = 0; j < 6; j++) {
          const ptAngle = angle + (j / 6) * Math.PI * 2;
          const px = cx + latR * Math.cos(ptAngle);
          const py = cy + yOffset + (latR * 0.35) * Math.sin(ptAngle);
          ctx.beginPath();
          ctx.fillStyle = isLive ? '#bae6fd' : '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#38bdf8';
          ctx.arc(px, py, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Center High-Energy Reactor Core Pulse
      const coreR = isLive ? 22 + Math.sin(angle * 8) * 4 : 16;
      const gradient = ctx.createRadialGradient(cx, cy, 2, cx, cy, coreR * 2.5);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.35, mainColor);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting Multi-Agent Satellite Laser Nodes
      const agents = [
        { id: 'manager', label: 'AI Manager', color: '#00f0ff' },
        { id: 'sales', label: 'AI เลขา', color: '#10b981' },
        { id: 'dev', label: 'AI Dev', color: '#a855f7' },
        { id: 'accounting', label: 'AI บัญชี', color: '#f59e0b' },
        { id: 'admin', label: 'AI Admin', color: '#3b82f6' },
      ];

      const orbitR = baseR + 58;
      agents.forEach((ag, idx) => {
        const agAngle = angle * 0.6 + (idx / agents.length) * Math.PI * 2;
        const ax = cx + orbitR * Math.cos(agAngle);
        const ay = cy + orbitR * Math.sin(agAngle) * 0.55;
        const isDelegated = activeSquadId === ag.id || (hudState === 'SEARCHING' && idx % 2 === 0);

        if (isDelegated) {
          ctx.beginPath();
          ctx.strokeStyle = ag.color;
          ctx.lineWidth = 2.2;
          ctx.shadowBlur = 14;
          ctx.shadowColor = ag.color;
          ctx.moveTo(cx, cy);
          ctx.lineTo(ax, ay);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.fillStyle = isDelegated ? '#ffffff' : ag.color;
        ctx.shadowBlur = isDelegated ? 16 : 8;
        ctx.shadowColor = ag.color;
        ctx.arc(ax, ay, isDelegated ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = isDelegated ? '#ffffff' : 'rgba(255,255,255,0.75)';
        ctx.fillText(ag.label, ax + 7, ay + 3);
      });

      ctx.restore();

      angle += isLive ? 0.03 : 0.012;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [hudState, activeSquadId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onDispatchCommand(inputText.trim());
    setInputText('');
  };

  const projects = [
    { id: 'pos', name: 'POS & Inventory Light', cat: 'Digital Commerce', path: 'D:\\Light\\Inventoty AI Light', price: '฿390 / เดือน' },
    { id: 'ticket', name: 'ThaiTicket Concert Hub', cat: 'Event Ticketing', path: 'D:\\Light\\บัตรคอน Light', price: '฿1,500 / งาน' },
    { id: 'fit', name: 'Krob Fit Gym Management', cat: 'Fitness & Scanner', path: 'D:\\Light\\Fitness', price: '฿990 / เดือน' },
    { id: 'pass', name: 'Krob Pass Vault & Gate', cat: 'Cybersecurity', path: 'D:\\Light\\Pass App Light', price: '฿690 / เดือน' },
  ].filter(p => !searchProject || p.name.toLowerCase().includes(searchProject.toLowerCase()) || p.cat.toLowerCase().includes(searchProject.toLowerCase()));

  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-[#010614] text-slate-100 font-mono select-none flex flex-col justify-between">
      {/* ============================================================ */}
      {/* 1. STARK WORKSHOP 4K PHOTOREALISTIC HOLOGRAPHIC BACKGROUND   */}
      {/* ============================================================ */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <img
          src="/assets/jarvis-stark-workshop.jpg"
          alt="Tony Stark Laboratory Workshop Holographic Environment"
          className="w-full h-full object-cover object-center opacity-80 mix-blend-screen select-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#010614] via-transparent to-[#010614]/85" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#010614]/85 via-transparent to-[#010614]/85" />
      </div>

      {/* ============================================================ */}
      {/* 2. TOP HUD HEADER BAR (Stark Labs Style)                     */}
      {/* ============================================================ */}
      <header className="relative z-20 border-b border-cyan-500/30 bg-[#020b22]/90 backdrop-blur-md px-4 lg:px-8 py-3 shadow-2xl">
        <div className="flex items-center justify-between">
          {/* Identity */}
          <div className="flex items-center gap-3">
            <span className="text-lg font-black tracking-[0.25em] text-cyan-300 drop-shadow-[0_0_12px_rgba(0,240,255,0.9)]">
              J . A . R . V . I . S .
            </span>
            <span className="rounded border border-cyan-400/60 bg-cyan-950/80 px-2 py-0.5 text-xs font-bold text-cyan-200">
              STARK WORKSHOP LABS
            </span>
            <span className="hidden sm:inline-flex rounded border border-emerald-500/50 bg-emerald-950/70 px-2.5 py-0.5 text-xs text-emerald-300 font-bold">
              ● 15 APPS ONLINE
            </span>
          </div>

          {/* Right Controls for sir ไลท์ */}
          <div className="flex items-center gap-2.5 sm:gap-4 text-xs">
            {/* Honorific Switcher */}
            <button
              type="button"
              onClick={onCycleTitle}
              className="flex items-center gap-1.5 rounded-full border border-cyan-400/70 bg-cyan-950/90 px-3.5 py-1 text-xs font-bold text-cyan-200 hover:bg-cyan-900/70 transition-all shadow-[0_0_12px_rgba(0,240,255,0.4)] cursor-pointer"
              title="คลิกสลับคำเรียก: sir ไลท์ / ท่านประธาน / ผู้การ / คุณผู้ชาย"
            >
              <span>🎖️ {userTitle}</span>
            </button>

            {/* Thai Voice Test Button */}
            <button
              type="button"
              onClick={onTestThaiVoice}
              className="hidden lg:flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-950/70 px-3 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-900/70 transition-all cursor-pointer shadow-sm"
              title="ทดสอบฟังเสียงสังเคราะห์ภาษาไทย"
            >
              <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>เสียงไทย 100%</span>
            </button>

            {/* Wake Word Badge */}
            <button
              type="button"
              onClick={onToggleWakeWord}
              className={`hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border transition-all cursor-pointer ${
                wakeWordActive
                  ? 'border-cyan-400/80 bg-cyan-950/90 text-cyan-200 shadow-[0_0_14px_rgba(0,240,255,0.5)]'
                  : 'border-slate-800 bg-slate-900 text-slate-500'
              }`}
              title="ระบบจับเสียงอัตโนมัติ 'จาร์วิส' / 'javis'"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  wakeWordActive ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'
                }`}
              />
              <span>WAKE: JAVIS {wakeWordActive ? '[ON]' : '[OFF]'}</span>
            </button>

            {/* Clock */}
            <div className="bg-slate-900/95 border border-cyan-500/40 px-3 py-1 rounded-lg text-cyan-300 font-bold text-xs">
              🕒 {currentTime || '03:25:18 AM'}
            </div>

            {/* App Nav */}
            {onOpenCompany && (
              <button
                type="button"
                onClick={onOpenCompany}
                className="hidden xl:inline-flex rounded-lg border border-cyan-500/50 bg-cyan-950/60 px-2.5 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-900/60"
              >
                AI COMPANY
              </button>
            )}

            {/* Window Fullscreen */}
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-400 hover:text-cyan-300"
              title="เต็มจอ"
            >
              ◻
            </button>
            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-400 hover:text-red-400"
                title="ออกสู่หน้า Admin"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 3. MULTI-AGENT HUB BAR (5 Specialized Agents)               */}
      {/* ============================================================ */}
      <div className="relative z-10 mx-4 lg:mx-8 mt-3 flex items-center justify-between border border-cyan-500/25 bg-[#020d28]/80 px-4 py-2 rounded-2xl backdrop-blur-md overflow-x-auto scrollbar-none shadow-lg">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            MULTI-AGENT HUB:
          </span>
          <span className="rounded-full border border-cyan-400/70 bg-cyan-950/80 px-3 py-0.5 text-cyan-200">
            AI Manager (Direct)
          </span>
          <span className="rounded-full border border-emerald-500/50 bg-emerald-950/50 px-3 py-0.5 text-emerald-300">
            AI เลขา (Sales)
          </span>
          <span className="rounded-full border border-purple-500/50 bg-purple-950/50 px-3 py-0.5 text-purple-300">
            AI Dev (Tech Lead)
          </span>
          <span className="rounded-full border border-amber-500/50 bg-amber-950/50 px-3 py-0.5 text-amber-300">
            AI บัญชี (Finance)
          </span>
          <span className="rounded-full border border-blue-500/50 bg-blue-950/50 px-3 py-0.5 text-blue-300">
            AI Admin (Docs)
          </span>
        </div>
        <span className="text-cyan-300/80 text-xs hidden lg:inline">
          🎯 สั่งการ Webapp Sales & Dev ครบวงจร
        </span>
      </div>

      {/* ============================================================ */}
      {/* 4. MAIN STARK HOLOGRAPHIC WORKSPACE (Center Orb + Side Pods) */}
      {/* ============================================================ */}
      <main className="relative z-10 flex-1 flex flex-col 2xl:flex-row items-center justify-between gap-6 p-4 lg:p-8 max-w-[1920px] mx-auto w-full">

        {/* ------------------------------------------------------------ */}
        {/* LEFT POD: FLOATING HOLOGRAPHIC PROJECT CARDS                 */}
        {/* ------------------------------------------------------------ */}
        <div className="w-full 2xl:w-88 flex flex-col space-y-3 shrink-0">
          <div className="rounded-2xl border border-cyan-500/35 bg-[#020d28]/85 p-4 shadow-[0_0_30px_rgba(0,240,255,0.2)] backdrop-blur-xl">
            <div className="flex items-center justify-between text-xs text-cyan-300 font-bold border-b border-cyan-500/25 pb-2 mb-3">
              <span>PROJECT PIPELINES // D:\LIGHT</span>
              <span className="text-emerald-400">4 READY</span>
            </div>

            {/* Search Box */}
            <div className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-slate-950/80 px-3 py-1.5 mb-3 text-xs">
              <Search className="h-3.5 w-3.5 text-cyan-400" />
              <input
                type="text"
                value={searchProject}
                onChange={(e) => setSearchProject(e.target.value)}
                placeholder="ค้นหาโปรเจกต์..."
                className="w-full bg-transparent text-xs text-cyan-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Project List */}
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 text-xs">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onDispatchCommand(`ดูข้อมูล ${p.name}`)}
                  className="p-3 rounded-xl border border-cyan-500/25 bg-cyan-950/30 hover:border-cyan-400 hover:bg-cyan-900/40 transition-all cursor-pointer shadow-sm"
                >
                  <div className="flex items-center justify-between text-cyan-200 font-bold">
                    <span>{p.name}</span>
                    <span className="text-emerald-400 text-[11px] font-mono">{p.price}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span>{p.cat}</span>
                    <span className="text-cyan-400 font-mono">คลิกเพื่อสั่งการ →</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Audio Spectrum Equalizer */}
            <div className="mt-3 pt-3 border-t border-cyan-500/20">
              <div className="flex items-center justify-between text-[11px] text-cyan-400 mb-1.5">
                <span>HOLOGRAPHIC AUDIO SPECTRUM</span>
                <span className="text-emerald-400 font-bold">48.0 kHz</span>
              </div>
              <div className="flex items-end justify-between h-9 px-1 gap-1">
                {[20, 45, 80, 60, 95, 30, 70, 50, 85, 40, 90, 65, 35, 75].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-cyan-400 rounded-t shadow-[0_0_8px_#00f0ff] transition-all"
                    style={{
                      height: isListening || isSpeaking ? `${h}%` : '20%',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* CENTER: GIGANTIC FLOATING 3D HOLOGRAPHIC AI SPHERE           */}
        {/* ------------------------------------------------------------ */}
        <div className="flex-1 flex flex-col items-center justify-center py-2">
          {/* Subtitle */}
          <div className="text-xs font-mono font-bold tracking-[0.3em] text-cyan-400/90 mb-2 drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">
            STARK LABS // NEURAL CORE // MARK III
          </div>

          {/* 3D Holographic Sphere Canvas & Core Reactor */}
          <div className="relative flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={380}
              height={380}
              onClick={onToggleMic}
              className="cursor-pointer transition-transform hover:scale-105"
              title="แตะลูกแก้วเพื่อเริ่มสั่งการด้วยเสียง"
            />

            {/* Center Touch Mic Orb */}
            <button
              type="button"
              onClick={onToggleMic}
              className={`absolute flex h-16 w-16 items-center justify-center rounded-full transition-all shadow-2xl backdrop-blur-md cursor-pointer ${
                isListening
                  ? 'bg-red-500/35 border-2 border-red-400 text-red-200 animate-pulse shadow-red-500/60'
                  : 'bg-cyan-500/25 border-2 border-cyan-400/80 text-cyan-200 hover:bg-cyan-500/40 hover:scale-110 shadow-cyan-500/50'
              }`}
            >
              <Mic className={`h-7 w-7 ${isListening ? 'text-red-300' : 'text-cyan-200'}`} />
            </button>
          </div>

          {/* Status Label */}
          <div className="mt-3 text-center">
            <span className="text-sm font-black tracking-[0.3em] text-cyan-300 drop-shadow-[0_0_12px_rgba(0,240,255,0.9)]">
              {hudState === 'LISTENING' && 'L I S T E N I N G . . .'}
              {hudState === 'SEARCHING' && 'M U L T I - A G E N T   S Y N C . . .'}
              {hudState === 'SPEAKING' && 'S P E A K I N G . . .'}
              {hudState === 'READY' && 'L I S T E N I N G'}
            </span>
          </div>

          {/* Smooth Undulating Sine Waveform */}
          <div className="mt-2 flex items-center justify-center">
            <svg className="w-64 h-8 stroke-cyan-400 fill-none drop-shadow-[0_0_12px_rgba(0,240,255,0.9)]" viewBox="0 0 200 24">
              <path
                d={
                  isListening || isSpeaking
                    ? 'M 10 12 Q 35 2, 60 12 T 100 12 T 140 12 T 180 12'
                    : 'M 10 12 Q 35 8, 60 12 T 100 12 T 140 12 T 180 12'
                }
                strokeWidth="2.5"
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
                  : '🎙️ สแตนด์บายรับคำสั่งเสียงภาษาไทยจาก sir ไลท์'}
              </span>
            </button>
          </div>
          <span className="text-[11px] text-slate-400 mt-1">
            {wakeWordActive
              ? 'ระบบ Standby: เรียก "จาร์วิส" หรือ "javis" ได้ตลอดเวลา'
              : 'คลิกปุ่มเพื่อเริ่มพูด'}
          </span>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* RIGHT POD: MULTI-AGENT CHAT TERMINAL FOR SIR ไลท์            */}
        {/* ------------------------------------------------------------ */}
        <div className="w-full 2xl:w-96 flex flex-col space-y-3 shrink-0">
          <div className="rounded-2xl border border-cyan-500/35 bg-[#020d28]/90 p-4 shadow-[0_0_35px_rgba(0,240,255,0.25)] backdrop-blur-xl flex flex-col h-[480px]">
            {/* Terminal Title */}
            <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2 mb-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-bold tracking-wider text-cyan-300 font-mono">
                  AI MANAGER // CONSOLE
                </span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono">MULTI-AGENT DIRECT</span>
            </div>

            {/* Message Stream */}
            <div
              ref={chatScrollRef}
              className="flex-1 space-y-2 overflow-y-auto pr-1 text-xs scrollbar-thin scrollbar-thumb-cyan-900"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-2.5 transition-all text-xs ${
                    m.sender === userTitle.toUpperCase() || m.sender === 'SIR ไลท์'
                      ? 'border border-cyan-500/60 bg-cyan-950/40 text-cyan-100 ml-4'
                      : 'border border-slate-800/90 bg-slate-900/80 text-slate-200 mr-2'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-mono">
                    <span className="font-bold text-cyan-400">
                      [ {m.time} ] {m.sender}
                    </span>
                    {m.delegatedTo && (
                      <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        {m.delegatedTo}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-[11px] font-sans">
                    {m.text}
                  </p>
                </div>
              ))}
            </div>

            {/* Quick Action Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-2 text-[10px] scrollbar-none border-t border-cyan-500/20">
              <span className="text-slate-500 shrink-0 font-bold">สั่งการเร็ว:</span>
              {[
                '🔊 ฟังเสียงภาษาไทย',
                'วิเคราะห์เว็บแอพ',
                'สถานะทีม AI',
                'ตรวจระบบทั้งหมด',
                'ออกใบเสนอราคา',
                'ดูระบบ POS',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    if (chip === '🔊 ฟังเสียงภาษาไทย') {
                      onTestThaiVoice();
                    } else {
                      onDispatchCommand(chip);
                    }
                  }}
                  className={`shrink-0 rounded-lg px-2.5 py-1 transition-all font-sans cursor-pointer ${
                    chip.startsWith('🔊')
                      ? 'border border-emerald-500/50 bg-emerald-950/70 text-emerald-300 font-bold shadow-sm'
                      : 'border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60'
                  }`}
                >
                  {chip.startsWith('🔊') ? chip : `"${chip}"`}
                </button>
              ))}
            </div>

            {/* Command Input Field: [ INITIALIZE COMMAND ... ] */}
            <form onSubmit={handleSubmit} className="mt-1 flex items-center gap-2 pt-1 border-t border-cyan-500/20">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="INITIALIZE COMMAND ..."
                  className="w-full rounded-xl border border-cyan-400/50 bg-slate-900/90 px-3 py-2 text-xs text-cyan-200 placeholder-cyan-500/50 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-300/50 font-mono tracking-wider shadow-inner"
                />
                {!inputText && (
                  <span className="absolute right-3 top-2.5 h-3.5 w-1.5 bg-cyan-400 animate-pulse" />
                )}
              </div>
              <button
                type="button"
                onClick={onToggleMic}
                className={`rounded-xl border p-2 transition-all cursor-pointer ${
                  isListening
                    ? 'border-red-500 bg-red-600 text-white animate-pulse'
                    : 'border-cyan-500/40 bg-slate-900 text-cyan-400 hover:bg-cyan-950/60'
                }`}
                title="เปิด/ปิดไมโครโฟน"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="flex items-center gap-1 rounded-xl bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-30 cursor-pointer shadow-md"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Holographic Projection Modal */}
      {activeHologram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in select-none"
        >
          <div className="w-full max-w-lg rounded-2xl border-2 border-cyan-400/60 bg-slate-950/95 p-5 shadow-[0_0_50px_rgba(0,240,255,0.4)] backdrop-blur-xl">
            <div className="flex items-start justify-between border-b border-cyan-500/30 pb-3">
              <div>
                <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300 border border-cyan-500/40 font-mono">
                  {activeHologram.category}
                </span>
                <h3 className="mt-1 text-sm font-black tracking-wider text-white">
                  {activeHologram.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onDismissHologram}
                className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white hover:border-red-500 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 my-4">
              {activeHologram.details.map((d, i) => (
                <div key={i} className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 text-xs">
                  <span className="text-[10px] text-slate-500 block">{d.label}</span>
                  <span className="font-bold text-cyan-300">{d.val}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-emerald-400 font-bold">{activeHologram.badge}</span>
              <button
                type="button"
                onClick={onDismissHologram}
                className="text-slate-400 hover:text-white underline cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
