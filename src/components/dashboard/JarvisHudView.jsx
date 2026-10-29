import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Send,
  Volume2,
  VolumeX,
  Shield,
  Cpu,
  HardDrive,
  Wifi,
  Thermometer,
  Zap,
  FileText,
  Stethoscope,
  Palette,
  ChevronRight,
} from 'lucide-react';
import { playClickSound, playSuccessSound } from '../../utils/soundEffects';
import { processJarvisCommand, SYSTEM_TELEMETRY } from '../../utils/jarvisBrain';

export function JarvisHudView({
  onRunAudit,
  onOpenQuotation,
  onOpenDoctor,
  _onOpenDesignSystem,
  onSelectBrandTheme,
  onShowToast,
}) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'JARVIS',
      time: '19:00:00',
      text: 'สวัสดีครับ ท่านประธาน J.A.R.V.I.S. MARK 3 ออนไลน์พร้อมรับคำสั่งเสียงภาษาไทย และค้นหาข้อมูลสั่งการทั้ง 17 โปรเจกต์ใน D:\\Light ให้ท่านทันทีครับ',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hudState, setHudState] = useState('READY'); // 'READY' | 'LISTENING' | 'SPEAKING' | 'PROCESSING'
  const [currentTime, setCurrentTime] = useState('');
  const [cpuUsage, setCpuUsage] = useState(18);
  const [netLatency, setNetLatency] = useState(12);

  const recognitionRef = useRef(null);
  const chatScrollRef = useRef(null);
  const canvasRef = useRef(null);

  // Live Clock & Telemetry Simulation
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      // Gentle realistic telemetry pulse
      setCpuUsage((prev) => Math.min(65, Math.max(12, prev + (Math.random() * 6 - 3))));
      setNetLatency((prev) => Math.min(24, Math.max(8, prev + (Math.random() * 2 - 1))));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Canvas 3D Hologram Wireframe Orb Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 90;

      // Glow color based on state
      const isLive = hudState === 'LISTENING' || hudState === 'SPEAKING';
      const mainColor = isLive ? '#06b6d4' : '#38bdf8';
      const glowColor = isLive ? 'rgba(6, 182, 212, 0.4)' : 'rgba(56, 189, 248, 0.2)';

      // Outer HUD Concentric Rings
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 30, 0, Math.PI * 2);
      ctx.stroke();

      // Outer Segmented Rotating Ring
      ctx.beginPath();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.arc(centerX, centerY, radius + 22, angle, angle + Math.PI * 0.7);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 22, angle + Math.PI, angle + Math.PI * 1.7);
      ctx.stroke();

      // Inner Counter-Rotating Ring
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.arc(centerX, centerY, radius + 12, -angle * 1.3, -angle * 1.3 + Math.PI * 0.5);
      ctx.stroke();

      // Sphere Wireframe Latitude/Longitude Grid
      ctx.shadowBlur = isLive ? 18 : 10;
      ctx.shadowColor = mainColor;

      const numLat = 7;
      for (let i = 1; i < numLat; i++) {
        const latAngle = (i / numLat) * Math.PI - Math.PI / 2;
        const latR = radius * Math.cos(latAngle);
        const yOffset = radius * Math.sin(latAngle);

        ctx.beginPath();
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 1;
        ctx.ellipse(centerX, centerY + yOffset, latR, latR * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const numLong = 8;
      for (let i = 0; i < numLong; i++) {
        const longAngle = angle + (i / numLong) * Math.PI;
        ctx.beginPath();
        ctx.strokeStyle = isLive ? 'rgba(6, 182, 212, 0.45)' : 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1;
        ctx.ellipse(centerX, centerY, radius * Math.sin(longAngle), radius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Center Core Energy Particle
      ctx.beginPath();
      const coreR = isLive ? 14 + Math.sin(angle * 8) * 3 : 10;
      const gradient = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, coreR * 2);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.4, mainColor);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.arc(centerX, centerY, coreR * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      angle += isLive ? 0.04 : 0.012;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [hudState]);

  // Web Speech Synthesis (Thai Voice Output)
  const speakThai = useCallback((text) => {
    if (!voiceEnabled) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'th-TH';
      utterance.rate = 1.05;
      utterance.pitch = 0.95; // Slightly deeper, executive sci-fi tone
      utterance.onstart = () => {
        setIsSpeaking(true);
        setHudState('SPEAKING');
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        setHudState('READY');
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setHudState('READY');
      };
      window.speechSynthesis.speak(utterance);
    }
  }, [voiceEnabled]);

  // Core Command Dispatcher
  const handleDispatchCommand = useCallback((text) => {
    if (!text.trim()) return;

    playClickSound();
    const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Add user message to history
    const userMsg = {
      id: Date.now(),
      sender: 'FOUNDER',
      time: nowTime,
      text: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setHudState('PROCESSING');

    // Brain NLP Processing
    setTimeout(() => {
      const result = processJarvisCommand(text);

      const jarvisMsg = {
        id: Date.now() + 1,
        sender: 'JARVIS',
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        text: result.reply,
      };

      setMessages((prev) => [...prev, jarvisMsg]);
      playSuccessSound();

      // Trigger actual system actions
      if (result.action === 'RUN_AUDIT' && onRunAudit) {
        onRunAudit();
      } else if (result.action === 'OPEN_QUOTATION' && onOpenQuotation) {
        onOpenQuotation();
      } else if (result.action === 'OPEN_DOCTOR' && onOpenDoctor) {
        onOpenDoctor();
      } else if (result.action === 'CHANGE_THEME' && onSelectBrandTheme) {
        onSelectBrandTheme(result.brandId);
      }

      // Voice response
      if (result.speech) {
        speakThai(result.speech);
      } else {
        setHudState('READY');
      }
    }, 400);
  }, [onRunAudit, onOpenQuotation, onOpenDoctor, onSelectBrandTheme, speakThai]);

  // Web Speech Recognition (Thai Voice Input)
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'th-TH';

      recognition.onstart = () => {
        setIsListening(true);
        setHudState('LISTENING');
        playClickSound();
        if (onShowToast) {
          onShowToast('info', 'J.A.R.V.I.S. กำลังฟัง...', 'พูดคำสั่งภาษาไทยได้ทันที เช่น "ตรวจระบบ", "ดูระบบ POS", "ออกใบเสนอราคา"');
        }
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);
        setHudState('PROCESSING');
        handleDispatchCommand(transcript);
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        setHudState('READY');
        if (onShowToast) {
          onShowToast('error', 'ระบบเสียงไม่พร้อม', 'ไม่สามารถจับเสียงได้ กรุณาใช้การพิมพ์ข้อความแทนครับ');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (!isSpeaking) setHudState('READY');
      };

      recognitionRef.current = recognition;
    }
  }, [isSpeaking, handleDispatchCommand, onShowToast]);

  const toggleMic = () => {
    playClickSound();
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setHudState('READY');
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          recognitionRef.current.stop();
        }
      } else {
        if (onShowToast) {
          onShowToast('info', 'Speech Recognition', 'เบราว์เซอร์นี้ไม่รองรับการจับเสียง กรุณาพิมพ์คำสั่งในช่องด้านล่างแทนครับ');
        }
      }
    }
  };

  return (
    <div className="relative min-h-[820px] w-full overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#050811] text-slate-100 shadow-2xl backdrop-blur-2xl">
      {/* Sci-Fi Background Hexagonal / Grid Overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'radial-gradient(#06b6d4 1.5px, transparent 1.5px), radial-gradient(#06b6d4 1.5px, #050811 1.5px)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* Top HUD Telemetry Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between border-b border-cyan-500/20 bg-slate-950/70 px-6 py-3.5 text-xs font-mono">
        {/* Left Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="text-sm font-black tracking-widest text-cyan-400">
              J . A . R . V . I . S .
            </span>
            <span className="rounded bg-cyan-950/80 px-2 py-0.5 text-[10px] font-bold text-cyan-300 border border-cyan-500/40">
              MARK 3 [ACTIVE]
            </span>
          </div>
          <span className="hidden sm:inline text-slate-500">•</span>
          <span className="hidden sm:inline text-slate-400">FOUNDER AI DIRECT INTERFACE</span>
        </div>

        {/* Center / Right Environment & Live Time */}
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          <div className="hidden md:flex items-center gap-2">
            <span>ENVIRONMENT:</span>
            <span className="text-cyan-300 font-bold">{SYSTEM_TELEMETRY.environment}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-bold">{SYSTEM_TELEMETRY.network}</span>
          </div>
          <div className="rounded-lg bg-slate-900 px-2.5 py-1 text-cyan-400 border border-cyan-500/30 font-bold">
            {currentTime || '19:04:30'}
          </div>
        </div>
      </div>

      {/* Main Cockpit HUD Grid: Left (Controls), Center (Orb), Right (Telemetry & Chat) */}
      <div className="relative z-10 grid grid-cols-1 gap-6 p-6 lg:grid-cols-12">
        {/* ============================================================ */}
        {/* LEFT COLUMN: Smart Control Panel (3 cols)                     */}
        {/* ============================================================ */}
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/60 p-4 shadow-lg backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-xs font-mono font-bold tracking-wider text-cyan-400">
                ❖ SMART CONTROLS
              </span>
              <span className="rounded bg-cyan-950/60 px-1.5 py-0.5 text-[9px] font-mono text-cyan-400 border border-cyan-500/30">
                DIRECT ACTIONS
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <button
                type="button"
                onClick={toggleMic}
                className={`w-full flex items-center justify-between rounded-xl border p-2.5 font-semibold transition-all shadow-sm ${
                  isListening
                    ? 'border-red-500/60 bg-red-950/40 text-red-300 animate-pulse'
                    : 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isListening ? <Mic className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4 text-cyan-400" />}
                  <span>{isListening ? 'กำลังรับเสียง...' : 'สั่งการด้วยเสียง (Voice)'}</span>
                </div>
                <span className="text-[10px] font-mono opacity-60">TH-TH</span>
              </button>

              <button
                type="button"
                onClick={() => handleDispatchCommand('ตรวจระบบทั้งหมด')}
                className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-slate-300 hover:border-cyan-500/40 hover:bg-slate-800 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  <span>รัน Full QA Audit</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              </button>

              <button
                type="button"
                onClick={() => handleDispatchCommand('ออกใบเสนอราคา')}
                className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-slate-300 hover:border-cyan-500/40 hover:bg-slate-800 transition-all"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-400" />
                  <span>ออกใบเสนอราคา QR</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              </button>

              <button
                type="button"
                onClick={() => handleDispatchCommand('ตรวจเช็คไฟล์ย้ายเครื่อง')}
                className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-slate-300 hover:border-cyan-500/40 hover:bg-slate-800 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-rose-400" />
                  <span>Migration Doctor (17 โฟลเดอร์)</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              </button>

              <button
                type="button"
                onClick={() => handleDispatchCommand('สลับเป็นธีมสีแดงคอนเสิร์ต')}
                className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-slate-300 hover:border-cyan-500/40 hover:bg-slate-800 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-amber-400" />
                  <span>สลับธีมสีแบรนด์สด</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              </button>
            </div>

            {/* Voice Sound Toggle */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">เสียงพูดตอบกลับ AI:</span>
              <button
                type="button"
                onClick={() => setVoiceEnabled((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  voiceEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                <span>{voiceEnabled ? 'เปิดเสียง' : 'ปิดเสียง'}</span>
              </button>
            </div>
          </div>

          {/* SaaS Products Quick Knowledge Chips */}
          <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/60 p-4 shadow-lg">
            <span className="text-[11px] font-mono font-bold tracking-wider text-slate-400">
              ⚡ ถามข้อมูลโปรเจกต์ด่วน:
            </span>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
              {[
                { label: '📦 ระบบ POS & คลัง', cmd: 'ขอข้อมูลระบบ POS & Inventory' },
                { label: '🎟️ บัตรคอนเสิร์ต', cmd: 'ขอข้อมูลระบบ บัตรคอน Light' },
                { label: '🏋️ ฟิตเนส & สแกนเนอร์', cmd: 'ขอข้อมูลระบบ Fitness' },
                { label: '🛡️ Pass App & Vault', cmd: 'ขอข้อมูลระบบ Pass App' },
                { label: '🚚 ระบบ Tracking', cmd: 'ขอข้อมูลระบบ Tracking พัสดุ' },
                { label: '📚 บัญชี & ใบเสร็จ', cmd: 'ขอข้อมูลระบบ บัญชี Light' },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleDispatchCommand(chip.cmd)}
                  className="rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-1 text-slate-300 hover:border-cyan-500/50 hover:bg-cyan-950/30 hover:text-cyan-300 transition-all font-mono"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* CENTER COLUMN: 3D Holographic Wireframe Orb (5 cols)         */}
        {/* ============================================================ */}
        <div className="flex flex-col items-center justify-center lg:col-span-5">
          <div className="relative flex flex-col items-center justify-center py-4">
            <span className="text-[10px] font-mono tracking-widest text-cyan-500/70 mb-1">
              PROJECT TEMP // QUANTUM CORE
            </span>

            {/* Central Canvas Orb */}
            <div className="relative flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={300}
                height={300}
                className="cursor-pointer"
                onClick={toggleMic}
                title="คลิกเพื่อเปิด / ปิดไมโครโฟนสั่งการด้วยเสียง"
              />

              {/* Center Touch Mic Overlay */}
              <button
                type="button"
                onClick={toggleMic}
                className={`absolute flex h-14 w-14 items-center justify-center rounded-full transition-all shadow-xl backdrop-blur-md ${
                  isListening
                    ? 'bg-red-500/30 border border-red-400 text-red-200 animate-pulse'
                    : 'bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30'
                }`}
              >
                {isListening ? <Mic className="h-6 w-6 text-red-300" /> : <Mic className="h-6 w-6 text-cyan-300" />}
              </button>
            </div>

            {/* Dynamic Status Label */}
            <div className="mt-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-mono font-bold tracking-widest text-cyan-400">
                {hudState === 'LISTENING' && 'LISTENING // สดับฟังคำสั่งเสียง...'}
                {hudState === 'SPEAKING' && 'SPEAKING // กำลังตอบคำสั่งเสียงภาษาไทย...'}
                {hudState === 'PROCESSING' && 'PROCESSING // กำลังประมวลผลคำสั่ง...'}
                {hudState === 'READY' && 'STANDBY // พร้อมรับคำสั่งเสียงภาษาไทย'}
              </span>
            </div>

            {/* Sci-Fi Audio Waveform Visualizer Bars */}
            <div className="mt-4 flex items-center gap-1">
              {[18, 32, 48, 24, 60, 38, 72, 45, 28, 54, 30, 68, 42, 20].map((height, idx) => (
                <div
                  key={idx}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isListening || isSpeaking
                      ? 'bg-cyan-400'
                      : 'bg-cyan-900/60'
                  }`}
                  style={{
                    height:
                      isListening || isSpeaking
                        ? `${Math.max(6, Math.sin((idx + Date.now() / 150) % Math.PI) * height)}px`
                        : '6px',
                  }}
                />
              ))}
            </div>

            <p className="mt-3 text-center text-[11px] text-slate-500">
              แตะที่ลูกแก้วโฮโลแกรมเพื่อเริ่มคุยสั่งการด้วยเสียงภาษาไทย
            </p>
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN: System Monitor & Chat Terminal (4 cols)        */}
        {/* ============================================================ */}
        <div className="space-y-4 lg:col-span-4">
          {/* Telemetry System Monitor (Top Right) */}
          <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 shadow-lg backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-xs font-mono font-bold tracking-wider text-cyan-400">
                ❖ SYSTEM MONITOR
              </span>
              <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-[9px] font-mono text-emerald-400 border border-emerald-500/30">
                STABLE
              </span>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              {/* CPU Usage */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="h-3 w-3 text-cyan-400" />
                    CPU USAGE
                  </span>
                  <span className="text-cyan-300 font-bold">{cpuUsage.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${cpuUsage}%` }}
                  />
                </div>
              </div>

              {/* Memory */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="h-3 w-3 text-emerald-400" />
                    MEMORY LOAD
                  </span>
                  <span className="text-emerald-300 font-bold">4.2 GB / 16.0 GB (26%)</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: '26%' }} />
                </div>
              </div>

              {/* Network Latency & Temp */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Wifi className="h-3 w-3 text-cyan-400" />
                    LATENCY
                  </span>
                  <p className="mt-0.5 text-xs font-bold text-cyan-300">{netLatency.toFixed(0)} ms</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Thermometer className="h-3 w-3 text-rose-400" />
                    CORE TEMP
                  </span>
                  <p className="mt-0.5 text-xs font-bold text-emerald-400">42°C (OPTIMAL)</p>
                </div>
              </div>

              {/* Power Status */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-2 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  POWER STATUS
                </span>
                <span className="font-bold text-emerald-300">{SYSTEM_TELEMETRY.power}</span>
              </div>
            </div>
          </div>

          {/* JARVIS Chat Terminal (Bottom Right) */}
          <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-4 shadow-lg backdrop-blur-md flex flex-col h-[340px]">
            <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold tracking-wider text-cyan-400">
                ❖ JARVIS TERMINAL
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                TH-TH NATURAL COMMAND
              </span>
            </div>

            {/* Terminal History Log */}
            <div
              ref={chatScrollRef}
              className="flex-1 space-y-3 overflow-y-auto pr-1 text-xs font-mono scrollbar-thin scrollbar-thumb-slate-800"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-2.5 transition-all ${
                    m.sender === 'FOUNDER'
                      ? 'border border-cyan-500/40 bg-cyan-950/30 text-cyan-100 ml-4'
                      : 'border border-slate-800 bg-slate-900/80 text-slate-200 mr-2'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] opacity-60 mb-1">
                    <span className="font-bold text-cyan-400">{m.sender}</span>
                    <span>{m.time}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-[11px]">{m.text}</p>
                </div>
              ))}
            </div>

            {/* Input & Mic Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDispatchCommand(inputText);
              }}
              className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-800/80"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="สั่งการด้วยภาษาไทย หรือพิมพ์คำสั่ง..."
                className="flex-1 rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={toggleMic}
                className={`rounded-xl border p-2 transition-all ${
                  isListening
                    ? 'border-red-500 bg-red-600 text-white'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title="พูดสั่งการภาษาไทย"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-40 shadow-sm"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
