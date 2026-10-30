import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Send,
  Volume2,
  VolumeX,
  Cpu,
  HardDrive,
  Wifi,
  Zap,
  Activity,
  Layers,
  Bot,
  Radio,
  Sliders,
  Fingerprint,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { playClickSound, playSuccessSound } from '../../utils/soundEffects';
import { processJarvisCommand } from '../../utils/jarvisBrain';

export function JarvisHudView({
  onRunAudit,
  onOpenQuotation,
  _onOpenDoctor,
  _onOpenDesignSystem,
  onSelectBrandTheme,
  onShowToast,
  onOpenAdmin,
  onOpenCompany,
}) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'JARVIS',
      time: '03:25:18 AM',
      text: 'สวัสดีครับ, บอส มีอะไรให้ผม ช่วยจัดการ หรือค้นหา ข้อมูล ไหมครับ?',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hudState, setHudState] = useState('READY'); // 'READY' | 'LISTENING' | 'SEARCHING' | 'SPEAKING'
  const [currentTime, setCurrentTime] = useState('');
  const [cpuUsage, setCpuUsage] = useState(58);
  const [diskUsage] = useState('R 32KB/s // W 2.8MB/s');
  const [activeHologram, setActiveHologram] = useState(null); // On-demand holographic projection payload
  const [activeSquadId, setActiveSquadId] = useState(null); // Currently delegated AI Squad satellite node
  const [wakeWordActive, setWakeWordActive] = useState(false); // Default to clean Push-To-Talk (No runaway loops)
  const [dragStartX, setDragStartX] = useState(null); // Gesture swipe flick
  const [isSmartControlOpen, setIsSmartControlOpen] = useState(true);
  const [isMonitorOpen, setIsMonitorOpen] = useState(true);
  const [activeLeftDock, setActiveLeftDock] = useState('ai');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const lastDispatchedRef = useRef({ text: '', time: 0 });
  const chatScrollRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Live Clock & Telemetry Simulation
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
      // Gentle realistic telemetry pulse (matching 50-60% range seen in HUD)
      setCpuUsage((prev) => Math.min(72, Math.max(45, prev + (Math.random() * 4 - 2))));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Canvas 3D Holographic Wireframe Orb (Iron Man Mark III Engine)
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
      const radius = 95;

      const isLive = hudState === 'LISTENING' || hudState === 'SPEAKING' || hudState === 'SEARCHING';
      const mainColor = isLive ? '#38bdf8' : '#06b6d4';
      const glowColor = isLive ? 'rgba(56, 189, 248, 0.45)' : 'rgba(6, 182, 212, 0.22)';

      ctx.save();

      // Outer Concentric Degrees / Tick Ring
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 32, 0, Math.PI * 2);
      ctx.stroke();

      // Segmented Rotating Gyro Rings
      ctx.beginPath();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.arc(centerX, centerY, radius + 24, angle, angle + Math.PI * 0.75);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 24, angle + Math.PI, angle + Math.PI * 1.75);
      ctx.stroke();

      // Inner Counter-Rotating Orbit Ring
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.arc(centerX, centerY, radius + 12, -angle * 1.2, -angle * 1.2 + Math.PI * 0.6);
      ctx.stroke();

      // 3D Spherical Wireframe Lattice
      ctx.shadowBlur = isLive ? 22 : 12;
      ctx.shadowColor = mainColor;

      const numLat = 8;
      for (let i = 1; i < numLat; i++) {
        const latAngle = (i / numLat) * Math.PI - Math.PI / 2;
        const latR = radius * Math.cos(latAngle);
        const yOffset = radius * Math.sin(latAngle);

        ctx.beginPath();
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 1;
        ctx.ellipse(centerX, centerY + yOffset, latR, latR * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const numLong = 10;
      for (let i = 0; i < numLong; i++) {
        const longAngle = angle + (i / numLong) * Math.PI;
        ctx.beginPath();
        ctx.strokeStyle = isLive ? 'rgba(56, 189, 248, 0.5)' : 'rgba(6, 182, 212, 0.28)';
        ctx.lineWidth = 1;
        ctx.ellipse(centerX, centerY, radius * Math.sin(longAngle), radius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Center Core Energy Reactor Glow
      ctx.beginPath();
      const coreR = isLive ? 16 + Math.sin(angle * 7) * 3 : 12;
      const gradient = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, coreR * 2.2);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.35, mainColor);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.arc(centerX, centerY, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting AI Squad Satellite Nodes (Multi-AI Live Delegation Matrix)
      const aiSquadNodes = [
        { id: 'mkt', label: 'AI-MKT', color: '#06b6d4' },
        { id: 'sales', label: 'AI-SALES', color: '#10b981' },
        { id: 'eng', label: 'AI-ENG', color: '#8b5cf6' },
        { id: 'fin', label: 'AI-FIN', color: '#f59e0b' },
        { id: 'sec', label: 'AI-SEC', color: '#f43f5e' },
        { id: 'ops', label: 'AI-OPS', color: '#0ea5e9' },
      ];

      const orbitRadius = radius + 62;
      aiSquadNodes.forEach((node, i) => {
        const nodeAngle = angle * 0.6 + (i / aiSquadNodes.length) * Math.PI * 2;
        const nx = centerX + orbitRadius * Math.cos(nodeAngle);
        const ny = centerY + orbitRadius * Math.sin(nodeAngle) * 0.58;

        const isDelegated = activeSquadId === node.id || (hudState === 'SEARCHING' && i % 2 === 0);

        // Beam glowing laser line to central core when delegated
        if (isDelegated) {
          ctx.beginPath();
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.8;
          ctx.shadowBlur = 14;
          ctx.shadowColor = node.color;
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(nx, ny);
          ctx.stroke();
        }

        // Draw satellite node dot
        ctx.beginPath();
        ctx.fillStyle = isDelegated ? '#ffffff' : node.color;
        ctx.shadowBlur = isDelegated ? 16 : 6;
        ctx.shadowColor = node.color;
        ctx.arc(nx, ny, isDelegated ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Node label
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = isDelegated ? '#ffffff' : 'rgba(255,255,255,0.65)';
        ctx.fillText(node.label, nx + 7, ny + 3);
      });

      ctx.restore();

      angle += isLive ? 0.035 : 0.012;
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [hudState, activeSquadId]);

  // Dual-Engine Thai Speech Synthesis (Primary: High-Fidelity Audio Stream, Fallback: Web Speech API)
  const speakThai = useCallback(
    (text) => {
      if (!voiceEnabled || !text || !text.trim()) return;

      // 1. Temporarily pause microphone while J.A.R.V.I.S. speaks to prevent feedback loop
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      } catch {}

      // 2. Stop any ongoing audio playback
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.currentTime = 0;
        } catch {}
      }

      setIsSpeaking(true);
      setHudState('SPEAKING');

      // Callback when speech completes
      const handleSpeechDone = () => {
        setIsSpeaking(false);
        setHudState('READY');
      };

      // Strip symbols for speech
      const cleanSpeech = text
        .replace(/[*#•_`~[\]\\/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Primary Engine: High-Fidelity Local / Vercel Proxy Endpoint (100% Thai audio, zero CORS errors)
      const encoded = encodeURIComponent(cleanSpeech.slice(0, 200));
      const audioUrl = `/api/tts?text=${encoded}`;

      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;

      audio.onended = () => {
        handleSpeechDone();
      };

      audio.onerror = () => {
        // Fallback Engine: Web Speech Synthesis API
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(cleanSpeech);
            utterance.lang = 'th-TH';
            utterance.rate = 1.0;
            const availVoices = window.speechSynthesis.getVoices();
            const thaiVoice = availVoices.find(
              (v) =>
                v.lang === 'th-TH' ||
                v.lang.toLowerCase().startsWith('th') ||
                v.name.toLowerCase().includes('thai') ||
                v.name.includes('ภาษาไทย') ||
                v.name.includes('Premwadee') ||
                v.name.includes('Niwat')
            );
            if (thaiVoice) utterance.voice = thaiVoice;
            utterance.onend = handleSpeechDone;
            utterance.onerror = handleSpeechDone;
            if (window.speechSynthesis.paused) window.speechSynthesis.resume();
            window.speechSynthesis.speak(utterance);
          } catch {
            handleSpeechDone();
          }
        } else {
          handleSpeechDone();
        }
      };

      audio.play().catch(() => {
        // Fallback if browser audio autoplay is blocked
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(cleanSpeech);
            utterance.lang = 'th-TH';
            utterance.onend = handleSpeechDone;
            utterance.onerror = handleSpeechDone;
            window.speechSynthesis.speak(utterance);
          } catch {
            handleSpeechDone();
          }
        } else {
          handleSpeechDone();
        }
      });
    },
    [voiceEnabled]
  );

  // Core Command Dispatcher & AI Squad Query Engine
  const handleDispatchCommand = useCallback(
    (text) => {
      const clean = (text || '').trim();
      if (!clean || clean.length < 2) return;

      const now = Date.now();
      // Deduplicate rapid identical commands within 3.5 seconds
      if (clean === lastDispatchedRef.current.text && now - lastDispatchedRef.current.time < 3500) {
        return;
      }
      lastDispatchedRef.current = { text: clean, time: now };

      playClickSound();
      const nowTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      // User Message to HUD Terminal
      const userMsg = {
        id: Date.now(),
        sender: 'BOSS',
        time: nowTime,
        text: clean,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      setHudState('SEARCHING');

      // Jarvis Neural Processing & AI Squad Coordination
      setTimeout(() => {
        const result = processJarvisCommand(text);

        const jarvisMsg = {
          id: Date.now() + 1,
          sender: 'JARVIS',
          time: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          }),
          text: result.reply,
          delegatedTo: result.delegatedTo,
        };

        setMessages((prev) => [...prev, jarvisMsg]);
        playSuccessSound();

        // Illuminate Delegated AI Squad Satellite Node
        setActiveSquadId(result.squadId || 'ops');
        setTimeout(() => setActiveSquadId(null), 4500);

        // Project Holographic Card on demand if payload exists
        if (result.hologram) {
          setActiveHologram(result.hologram);
        }

        // Trigger actions
        if (result.action === 'RUN_AUDIT' && onRunAudit) {
          onRunAudit();
        } else if (result.action === 'OPEN_QUOTATION' && onOpenQuotation) {
          onOpenQuotation();
        } else if (result.action === 'CHANGE_THEME' && onSelectBrandTheme) {
          onSelectBrandTheme(result.brandId);
        }

        // Voice Response
        if (result.speech) {
          speakThai(result.speech);
        } else {
          setHudState('READY');
        }
      }, 450);
    },
    [onRunAudit, onOpenQuotation, onSelectBrandTheme, speakThai]
  );

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
        const transcript = (event.results[0][0]?.transcript || '').trim();
        if (!transcript || transcript.length < 2) return;

        // Stop listening immediately upon capturing command to prevent echo loops
        try {
          recognitionRef.current?.stop();
        } catch {}
        setIsListening(false);

        const lower = transcript.toLowerCase();
        const isWakeWord =
          lower.includes('จาร์วิส') ||
          lower.includes('เฮ้ จาร์วิส') ||
          lower.includes('hey jarvis') ||
          lower.includes('jarvis');

        if (isWakeWord) {
          playSuccessSound();
          const stripped = transcript
            .replace(/เฮ้\s*จาร์วิส/gi, '')
            .replace(/จาร์วิส/gi, '')
            .replace(/hey\s*jarvis/gi, '')
            .replace(/jarvis/gi, '')
            .trim();

          if (stripped.length >= 2) {
            handleDispatchCommand(stripped);
          } else {
            speakThai('ครับ บอส มีอะไรให้ผมช่วยจัดการ หรือค้นหาข้อมูลไหมครับ?');
          }
        } else {
          handleDispatchCommand(transcript);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech error:', event.error);
        setIsListening(false);
        setHudState('READY');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          if (onShowToast) {
            onShowToast(
              'warning',
              'ไมโครโฟนถูกปิดกั้น (Mic Blocked)',
              'กรุณากดไอคอนแม่กุญแจ 🔒 หรือรูปกล้องที่ช่อง URL ด้านบน เพื่อเลือก "Allow" ให้ใช้ไมโครโฟน หรือคลิกปุ่มคำสั่งภาษาไทยด้านล่างได้ทันทีครับ'
            );
          }
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (!isSpeaking) setHudState('READY');
      };

      recognitionRef.current = recognition;
    }
  }, [isSpeaking, handleDispatchCommand, onShowToast, speakThai]);

  const toggleMic = useCallback(() => {
    playClickSound();
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      setHudState('READY');
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
        } catch {}
      }
      if (onShowToast) {
        onShowToast('info', 'ปิดไมโครโฟน', 'หยุดการรับฟังเสียงเรียบร้อยครับ กดที่ปุ่มไมค์เพื่อพูดคุยใหม่ได้ทุกเมื่อ');
      }
    } else {
      if (recognitionRef.current) {
        try {
          // Pause any ongoing audio output before listening
          if (audioPlayerRef.current) {
            try {
              audioPlayerRef.current.pause();
            } catch {}
          }
          recognitionRef.current.start();
          setIsListening(true);
          setHudState('LISTENING');
          if (onShowToast) {
            onShowToast(
              'info',
              '🎙️ กำลังรับฟังเสียงภาษาไทย',
              'พูดคำสั่งได้ทันที เช่น "สวัสดี", "ตรวจระบบ", "ดูข้อมูล POS", หรือ "ออกใบเสนอราคา"'
            );
          }
        } catch {
          try {
            recognitionRef.current.stop();
            setTimeout(() => {
              recognitionRef.current?.start();
              setIsListening(true);
              setHudState('LISTENING');
            }, 250);
          } catch {}
        }
      } else {
        if (onShowToast) {
          onShowToast(
            'warning',
            'ไมโครโฟนยังไม่พร้อมใช้งาน',
            'กรุณากดไอคอนแม่กุญแจ 🔒 ที่แถบ URL เพื่ออนุญาต (Allow) การใช้ไมโครโฟน หรือคลิกปุ่มคำสั่งภาษาไทยด้านล่างได้ทันทีครับ'
          );
        }
      }
    }
  }, [isListening, onShowToast]);

  const toggleFullscreen = () => {
    playClickSound();
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full min-h-screen overflow-hidden bg-[#02050e] text-slate-100 font-mono select-none transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 h-screen w-screen'
          : 'flex flex-col'
      }`}
    >
      {/* Sci-Fi Atmospheric Grid Lines & Vignette */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6, 182, 212, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.4) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-radial-gradient from-transparent via-transparent to-[#02050e]/90" />

      {/* ============================================================ */}
      {/* TOP HUD BAR (Matching Screenshot 1:1)                        */}
      {/* ============================================================ */}
      <div className="relative z-20 flex items-center justify-between border-b border-cyan-500/20 bg-slate-950/80 px-6 py-3 text-xs tracking-wider">
        {/* Left Brand Badge */}
        <div className="flex items-center gap-3">
          <span className="text-base font-black tracking-[0.25em] text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]">
            J . A . R . V . I . S .
          </span>
          <span className="rounded bg-cyan-950/70 px-2 py-0.5 text-[10px] font-bold text-cyan-300 border border-cyan-500/40">
            MK III
          </span>
          <div className="hidden sm:flex items-center gap-1.5 rounded bg-slate-900/80 px-2.5 py-0.5 text-[10px] text-emerald-400 border border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>2 PRINTERS / 15 APPS ONLINE</span>
          </div>
        </div>

        {/* Right Environment & Status */}
        <div className="flex items-center gap-5 text-[11px] text-slate-400">
          <div className="hidden md:flex items-center gap-4">
            <div>
              <span className="text-slate-500 text-[10px] block">ENVIRONMENT</span>
              <span className="text-cyan-300 font-bold">BANGKOK 26°C</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">HUMIDITY</span>
              <span className="text-cyan-300 font-bold">85%</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">NETWORK</span>
              <span className="text-emerald-400 font-bold">ONLINE</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">OVERCAST</span>
              <span className="text-slate-400">UPDATED 03:15</span>
            </div>
          </div>

          {/* Wake Word Standby Toggle Button */}
          <button
            type="button"
            onClick={() => {
              playClickSound();
              setWakeWordActive((w) => !w);
              if (onShowToast) {
                onShowToast(
                  'info',
                  'ระบบ Wake Word',
                  wakeWordActive
                    ? 'ปิดระบบจับเสียง "เฮ้ จาร์วิส" แล้ว'
                    : 'เปิดระบบจับเสียง "เฮ้ จาร์วิส" (Standby พร้อมเพรียง)'
                );
              }
            }}
            className={`hidden lg:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all ${
              wakeWordActive
                ? 'border-cyan-500/50 bg-cyan-950/70 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'border-slate-800 bg-slate-900 text-slate-500'
            }`}
            title="คลิกเพื่อเปิด / ปิดการดักฟัง 'เฮ้ จาร์วิส' อัตโนมัติ"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                wakeWordActive ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'
              }`}
            />
            <span>WAKE WORD: {wakeWordActive ? 'HEY JARVIS [ON]' : 'OFF'}</span>
          </button>

          {/* Time, View Switchers & Window Controls (Matching Iron Man HUD) */}
          <div className="flex items-center gap-2">
            {onOpenCompany && (
              <button
                type="button"
                onClick={onOpenCompany}
                className="hidden xl:inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-900/40 transition-all"
                title="เปิดศูนย์ AI Company Hub (6 แผนก)"
              >
                AI COMPANY
              </button>
            )}
            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-all"
                title="สลับไปยังหน้า Admin Dashboard"
              >
                ADMIN DASHBOARD
              </button>
            )}
            <div className="rounded-lg bg-slate-900/90 px-3 py-1 font-bold text-cyan-400 border border-cyan-500/30">
              {currentTime || '03:25:18 AM'}
            </div>
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsSmartControlOpen((o) => !o);
                  setIsMonitorOpen((o) => !o);
                }}
                className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-400 hover:text-white transition-colors"
                title="ยุบ/ขยายพาเนลเสริม"
              >
                -
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-400 hover:text-cyan-300 transition-colors"
                title="ขยายเต็มจอ (Fullscreen)"
              >
                ◻
              </button>
              {onOpenAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
                  title="ออกจากโหมด HUD สู่หน้า Admin Dashboard"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* COCKPIT WORKSPACE (Clean, Minimal, No Static Clutter)        */}
      {/* ============================================================ */}
      <div className="relative z-10 flex min-h-[790px] w-full p-4 lg:p-6">
        {/* ------------------------------------------------------------ */}
        {/* 1. LEFT VERTICAL TOOL DOCK (8 Icons matching screenshot)     */}
        {/* ------------------------------------------------------------ */}
        <div className="hidden md:flex flex-col items-center justify-between rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-2 shadow-xl backdrop-blur-md w-12 shrink-0 mr-4">
          <div className="space-y-3">
            {[
              { id: 'grid', icon: Layers, title: 'AI Teams & Roster' },
              { id: 'ai', icon: Bot, title: 'J.A.R.V.I.S. Neural Core' },
              { id: 'wave', icon: Radio, title: 'Audio Stream' },
              { id: 'scanner', icon: Fingerprint, title: 'Security Vault' },
              { id: 'chip', icon: Cpu, title: 'Hardware Telemetry' },
              { id: 'pulse', icon: Activity, title: 'Diagnostics' },
              { id: 'touch', icon: Sliders, title: 'Manual Overrides' },
            ].map((btn) => {
              const Icon = btn.icon;
              const isActive = activeLeftDock === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setActiveLeftDock(btn.id);
                    if (btn.id === 'grid') handleDispatchCommand('สรุปโปรเจกต์ทั้งหมด');
                    else if (btn.id === 'scanner') handleDispatchCommand('เช็คความปลอดภัย vault');
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-md shadow-cyan-500/20'
                      : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
                  }`}
                  title={btn.title}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setVoiceEnabled((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all ${
              voiceEnabled
                ? 'border-cyan-500/30 text-cyan-400 bg-cyan-950/30'
                : 'border-slate-800 text-slate-600 bg-slate-900'
            }`}
            title={voiceEnabled ? 'เปิดเสียงตอบกลับภาษาไทย' : 'ปิดเสียง'}
          >
            {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* 2. CENTER AREA: Holographic Orb + Listening Waveform         */}
        {/* ------------------------------------------------------------ */}
        <div className="relative flex-1 flex flex-col items-center justify-center">
          {/* Subtle Top Label */}
          <div className="text-[11px] font-mono tracking-[0.2em] text-cyan-500/70 mb-2">
            PROJECT : TEMP
          </div>

          {/* Hologram 3D Orb */}
          <div className="relative flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={340}
              height={340}
              onClick={toggleMic}
              className="cursor-pointer transition-transform hover:scale-105"
              title="แตะที่ลูกแก้วโฮโลแกรมเพื่อเริ่มพูดคุยสั่งการ"
            />

            {/* Center Touch Mic Orb */}
            <button
              type="button"
              onClick={toggleMic}
              className={`absolute flex h-16 w-16 items-center justify-center rounded-full transition-all shadow-2xl backdrop-blur-md ${
                isListening
                  ? 'bg-red-500/30 border-2 border-red-400 text-red-200 animate-pulse shadow-red-500/50'
                  : 'bg-cyan-500/20 border-2 border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/35 hover:scale-110 shadow-cyan-500/30'
              }`}
            >
              <Mic className={`h-7 w-7 ${isListening ? 'text-red-300' : 'text-cyan-300'}`} />
            </button>
          </div>

          {/* Dynamic State Status Label */}
          <div className="mt-3 text-center">
            <span className="text-xs font-mono font-bold tracking-[0.25em] text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.8)]">
              {hudState === 'LISTENING' && 'L I S T E N I N G . . .'}
              {hudState === 'SEARCHING' && 'S E A R C H I N G   A I   T E A M S . . .'}
              {hudState === 'SPEAKING' && 'S P E A K I N G . . .'}
              {hudState === 'READY' && 'L I S T E N I N G'}
            </span>
          </div>

          {/* Audio Waveform Visualizer Bars (Matching Screenshot) */}
          <div className="mt-4 flex items-center justify-center gap-1">
            {[16, 28, 42, 60, 36, 70, 48, 22, 54, 32, 64, 40, 24, 16].map((h, idx) => (
              <div
                key={idx}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isListening || isSpeaking
                    ? 'bg-cyan-400 shadow-[0_0_8px_#38bdf8]'
                    : 'bg-cyan-900/50'
                }`}
                style={{
                  height:
                    isListening || isSpeaking
                      ? `${Math.max(6, Math.sin((idx + Date.now() / 140) % Math.PI) * h)}px`
                      : '6px',
                }}
              />
            ))}
          </div>

          {/* Central Voice Two-Way Status / Tap-to-Talk Button */}
          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={toggleMic}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition-all shadow-lg cursor-pointer ${
                isListening
                  ? 'border border-red-500/80 bg-red-950/70 text-red-200 shadow-red-500/30 animate-pulse'
                  : isSpeaking
                  ? 'border border-sky-400 bg-sky-950/70 text-sky-200 shadow-sky-500/30 animate-pulse'
                  : 'border border-cyan-400/80 bg-cyan-950/80 text-cyan-200 hover:bg-cyan-900/90 hover:border-cyan-300 shadow-cyan-500/40 hover:scale-105'
              }`}
            >
              <Mic className="h-4 w-4" />
              <span>
                {isListening
                  ? '🎙️ กำลังรับฟังเสียงภาษาไทย... (พูดโต้ตอบได้ทันที)'
                  : isSpeaking
                  ? '🔊 กำลังพูดตอบกลับ...'
                  : '🎙️ เริ่มพูดคุยโต้ตอบภาษาไทย (คลิกเปิดไมค์)'}
              </span>
            </button>
            <span className="text-[10px] text-slate-400">
              {wakeWordActive
                ? 'ระบบโต้ตอบต่อเนื่อง: พูด "เฮ้ จาร์วิส" หรือสั่งงานได้ตลอดเวลา'
                : 'คลิกปุ่มเพื่อเริ่มพูดคุย'}
            </span>
          </div>

          {/* Bottom-Left Collapsible "SMART CONTROL" Widget (Matching Screenshot) */}
          <div
            className={`absolute bottom-2 left-0 w-72 rounded-2xl border border-cyan-500/25 bg-slate-950/85 p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 ${
              isSmartControlOpen ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-2'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                <span className="text-[11px] font-bold tracking-wider text-cyan-400">
                  SMART CONTROL
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSmartControlOpen((o) => !o)}
                className="text-slate-500 hover:text-white"
              >
                {isSmartControlOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>

            {isSmartControlOpen && (
              <div className="space-y-2 text-xs">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  No devices found. Ensure they are on the same network.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDispatchCommand('ตรวจระบบทั้งหมด')}
                    className="flex-1 rounded-xl border border-cyan-500/30 bg-cyan-950/40 py-2 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-900/40 transition-all text-center"
                  >
                    DISCOVER LIGHTS / AUDIT
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ON-DEMAND HOLOGRAPHIC PROJECTION POPUP (Appears only when Boss requests info) */}
          {activeHologram && (
            <div
              className="absolute top-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-lg animate-fade-in select-none cursor-grab active:cursor-grabbing"
              onTouchStart={(e) => setDragStartX(e.touches[0].clientX)}
              onTouchEnd={(e) => {
                if (dragStartX !== null && Math.abs(e.changedTouches[0].clientX - dragStartX) > 50) {
                  setActiveHologram(null);
                  playSuccessSound();
                }
                setDragStartX(null);
              }}
              onMouseDown={(e) => setDragStartX(e.clientX)}
              onMouseUp={(e) => {
                if (dragStartX !== null && Math.abs(e.clientX - dragStartX) > 50) {
                  setActiveHologram(null);
                  playSuccessSound();
                }
                setDragStartX(null);
              }}
            >
              <div className="rounded-2xl border-2 border-cyan-400/60 bg-slate-950/95 p-5 shadow-[0_0_50px_rgba(6,182,212,0.35)] backdrop-blur-xl">
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
                    onClick={() => setActiveHologram(null)}
                    className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white hover:border-red-500"
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

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
                  <span className="text-emerald-400 font-bold">{activeHologram.badge}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-cyan-400/80 font-mono">
                      ← ปัดซ้าย/ขวาเพื่อปิด (Gesture Flick) →
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveHologram(null)}
                      className="text-slate-400 hover:text-white underline ml-2"
                    >
                      DISMISS
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------ */}
        {/* 3. RIGHT AREA: System Monitor & J.A.R.V.I.S. Chat Terminal   */}
        {/* ------------------------------------------------------------ */}
        <div className="w-80 lg:w-96 shrink-0 flex flex-col justify-between space-y-4 ml-4">
          {/* SYSTEM MONITOR (Matching Screenshot 1:1) */}
          <div className="rounded-2xl border border-cyan-500/25 bg-slate-950/80 p-4 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-bold tracking-wider text-cyan-400">
                  SYSTEM MONITOR
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMonitorOpen((o) => !o)}
                className="text-slate-500 hover:text-white"
              >
                {isMonitorOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>

            {isMonitorOpen && (
              <div className="space-y-3 text-xs">
                {/* CPU Usage */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="h-3 w-3 text-cyan-400" />
                      CPU USAGE
                    </span>
                    <span className="text-cyan-300 font-bold">{cpuUsage.toFixed(0)}%</span>
                  </div>
                  {/* Real-time Oscillating Wave Graphic */}
                  <div className="h-6 w-full rounded-lg bg-slate-900/90 border border-slate-800 flex items-center px-1 overflow-hidden">
                    <svg className="w-full h-4 stroke-cyan-400 fill-none" viewBox="0 0 100 20">
                      <path
                        d={`M 0 10 Q 25 ${cpuUsage > 55 ? 2 : 18}, 50 10 T 100 10`}
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                </div>

                {/* Memory Bar */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="h-3 w-3 text-cyan-400" />
                      MEMORY
                    </span>
                    <span className="text-cyan-300 font-bold">16.0 / 31.9 GB</span>
                  </div>
                  <div className="flex gap-1 h-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((block) => (
                      <div
                        key={block}
                        className={`flex-1 rounded-sm ${
                          block <= 4 ? 'bg-cyan-500' : 'bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Disk Activity */}
                <div className="flex items-center justify-between text-[11px] border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <HardDrive className="h-3 w-3 text-cyan-400" />
                    DISK ACTIVITY
                  </span>
                  <span className="text-cyan-300 font-bold">{diskUsage}</span>
                </div>

                {/* Network */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Wifi className="h-3 w-3 text-cyan-400" />
                    NETWORK
                  </span>
                  <span className="text-emerald-400 font-bold">U 181KB/s // D 6KB/s</span>
                </div>

                {/* System Temp */}
                <div className="flex items-center justify-between text-[11px] rounded-lg bg-slate-900/60 p-2 border border-slate-800">
                  <span className="text-slate-400">SYSTEM TEMP</span>
                  <span className="text-rose-400 font-bold">SENSOR N/A // 42°C</span>
                </div>

                {/* Power Status */}
                <div className="flex items-center justify-between text-[11px] rounded-lg bg-emerald-950/30 p-2 border border-emerald-500/30">
                  <span className="text-emerald-300 flex items-center gap-1.5 font-bold">
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    POWER STATUS
                  </span>
                  <span className="text-emerald-400 font-bold">POWER ONLINE</span>
                </div>
              </div>
            )}
          </div>

          {/* J.A.R.V.I.S. CHAT TERMINAL (Matching Screenshot 1:1) */}
          <div className="rounded-2xl border border-cyan-500/25 bg-slate-950/85 p-4 shadow-2xl backdrop-blur-md flex flex-col h-[340px]">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
              <span className="text-xs font-bold tracking-wider text-cyan-400">
                J . A . R . V . I . S .
              </span>
              <span className="text-[10px] text-slate-500">VOICE & COMMAND</span>
            </div>

            {/* Terminal Log */}
            <div
              ref={chatScrollRef}
              className="flex-1 space-y-2.5 overflow-y-auto pr-1 text-xs scrollbar-thin scrollbar-thumb-slate-800"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl p-2.5 transition-all ${
                    m.sender === 'BOSS'
                      ? 'border border-cyan-500/50 bg-cyan-950/30 text-cyan-100 ml-3'
                      : 'border border-slate-800/90 bg-slate-900/80 text-slate-200 mr-1'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span className="font-bold text-cyan-400">
                      [ {m.time} ] {m.sender}
                    </span>
                    {m.delegatedTo && (
                      <span className="text-[9px] text-emerald-400 font-bold">
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

            {/* Quick Thai Voice & Command Chips for Instant Conversation */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 text-[10px] scrollbar-none border-t border-slate-800/80">
              <span className="text-slate-500 shrink-0 font-bold">ลองคลิก/พูด:</span>
              {[
                'สวัสดี จาร์วิส',
                'คุยภาษาไทยได้ไหม',
                'ตรวจระบบทั้งหมด',
                'ดูข้อมูลระบบ POS',
                'ออกใบเสนอราคา',
                'ทีม AI มีใครบ้าง',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleDispatchCommand(chip)}
                  className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 transition-all font-sans cursor-pointer"
                  title={`ส่งคำสั่ง "${chip}"`}
                >
                  "{chip}"
                </button>
              ))}
            </div>

            {/* Input Box (Matching `INITIALIZE COMMAND...` in screenshot) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDispatchCommand(inputText);
              }}
              className="mt-1 flex items-center gap-2 pt-1"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="พิมพ์คำสั่งภาษาไทย หรือกดไมค์พูดคุย..."
                className="flex-1 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs text-cyan-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-sans"
              />
              <button
                type="button"
                onClick={toggleMic}
                className={`rounded-xl border p-2 transition-all ${
                  isListening
                    ? 'border-red-500 bg-red-600 text-white animate-pulse'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
                title="กดเพื่อเปิด/ปิดไมโครโฟนพูดภาษาไทย"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-30"
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
