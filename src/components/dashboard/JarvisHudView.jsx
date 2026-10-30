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
  Bot,
  Radio,
  Sliders,
  X,
  ChevronDown,
  ChevronUp,
  Grid,
  Box,
  Scan,
  Hand,
  Printer,
} from 'lucide-react';
import { playClickSound, playSuccessSound } from '../../utils/soundEffects';
import { processJarvisCommand, USER_TITLE, setUserTitle } from '../../utils/jarvisBrain';

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
  const [userTitle, setUserTitleState] = useState(USER_TITLE);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'JARVIS',
      time: '03:25:18 AM',
      text: `สวัสดีครับ, ${USER_TITLE} มีอะไรให้ผม ช่วยจัดการ หรือค้นหา ข้อมูลไหมครับ?`,
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hudState, setHudState] = useState('READY'); // 'READY' | 'LISTENING' | 'SEARCHING' | 'SPEAKING'
  const [currentTime, setCurrentTime] = useState('');
  const [cpuUsage, setCpuUsage] = useState(50);
  const [diskUsage] = useState('R 32KB/s // W 2.4MB/s');
  const [networkUsage] = useState('U 181KB/s // D 6KB/s');
  const [activeHologram, setActiveHologram] = useState(null); // On-demand holographic projection payload
  const [activeSquadId, setActiveSquadId] = useState(null); // Currently delegated AI Squad satellite node
  const [wakeWordActive, setWakeWordActive] = useState(true); // Always-on Hands-free Wake Word "javis" / "จาร์วิส"
  const [dragStartX, setDragStartX] = useState(null); // Gesture swipe flick
  const [isSmartControlOpen, setIsSmartControlOpen] = useState(true);
  const [isMonitorOpen, setIsMonitorOpen] = useState(true);
  const [activeLeftDock, setActiveLeftDock] = useState('power'); // Highlighted golden lightning bolt in Mark III screenshot
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
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 32, 0, Math.PI * 2);
      ctx.stroke();

      // Degree Tick Marks around outer ring
      for (let t = 0; t < 36; t++) {
        const tickAngle = (t / 36) * Math.PI * 2;
        const isMajor = t % 3 === 0;
        const r1 = radius + 32;
        const r2 = radius + (isMajor ? 38 : 35);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? 'rgba(56, 189, 248, 0.6)' : 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.moveTo(centerX + r1 * Math.cos(tickAngle), centerY + r1 * Math.sin(tickAngle));
        ctx.lineTo(centerX + r2 * Math.cos(tickAngle), centerY + r2 * Math.sin(tickAngle));
        ctx.stroke();
      }

      // Segmented Rotating Gyro Rings
      ctx.beginPath();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.arc(centerX, centerY, radius + 22, angle, angle + Math.PI * 0.7);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 22, angle + Math.PI, angle + Math.PI * 1.7);
      ctx.stroke();

      // Inner Counter-Rotating Orbit Ring
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.arc(centerX, centerY, radius + 10, -angle * 1.3, -angle * 1.3 + Math.PI * 0.6);
      ctx.stroke();

      // 3D Spherical Wireframe Lattice (Geodesic Mark III Mesh)
      ctx.shadowBlur = isLive ? 22 : 12;
      ctx.shadowColor = mainColor;

      const numLat = 9;
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

      const numLong = 12;
      for (let i = 0; i < numLong; i++) {
        const longAngle = angle + (i / numLong) * Math.PI;
        ctx.beginPath();
        ctx.strokeStyle = isLive ? 'rgba(56, 189, 248, 0.55)' : 'rgba(6, 182, 212, 0.3)';
        ctx.lineWidth = 1;
        ctx.ellipse(centerX, centerY, radius * Math.sin(longAngle), radius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Geodesic Faceted Vertices (Glowing cyan nodes at intersections)
      for (let i = 1; i < numLat; i += 2) {
        const latAngle = (i / numLat) * Math.PI - Math.PI / 2;
        const latR = radius * Math.cos(latAngle);
        const yOffset = radius * Math.sin(latAngle);
        for (let j = 0; j < 8; j++) {
          const ptAngle = angle + (j / 8) * Math.PI * 2;
          const px = centerX + latR * Math.cos(ptAngle);
          const py = centerY + yOffset + (latR * 0.35) * Math.sin(ptAngle);
          ctx.beginPath();
          ctx.fillStyle = isLive ? '#bae6fd' : '#38bdf8';
          ctx.arc(px, py, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
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

  // Triple-Layered Pure Thai Speech Synthesis (Zero English Voice Guarantee)
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

      // Callback when speech completes: auto-resume hands-free Wake Word standby
      const handleSpeechDone = () => {
        setIsSpeaking(false);
        setHudState('READY');
        if (wakeWordActive) {
          setTimeout(() => {
            try {
              if (wakeWordActive && recognitionRef.current) {
                recognitionRef.current.start();
                setIsListening(true);
                setHudState('LISTENING');
              }
            } catch {}
          }, 350);
        }
      };

      // Strip symbols for speech
      const cleanSpeech = text
        .replace(/[*#•_`~[\]\\/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const encoded = encodeURIComponent(cleanSpeech.slice(0, 200));

      // Attempt 3: Web Speech API - STRICTLY ENFORCING ONLY NATIVE THAI VOICES
      const tryWebSpeech = () => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const availVoices = window.speechSynthesis.getVoices() || [];
            const thaiVoice = availVoices.find(
              (v) =>
                v.lang === 'th-TH' ||
                v.lang.toLowerCase().startsWith('th') ||
                v.name.toLowerCase().includes('thai') ||
                v.name.includes('ภาษาไทย') ||
                v.name.includes('Premwadee') ||
                v.name.includes('Niwat')
            );

            // STRICT GUARD: If no Thai voice found in system, NEVER let an English voice speak Thai!
            if (thaiVoice) {
              const utterance = new SpeechSynthesisUtterance(cleanSpeech);
              utterance.voice = thaiVoice;
              utterance.lang = 'th-TH';
              utterance.rate = 1.0;
              utterance.onend = handleSpeechDone;
              utterance.onerror = handleSpeechDone;
              if (window.speechSynthesis.paused) window.speechSynthesis.resume();
              window.speechSynthesis.speak(utterance);
            } else {
              // No Thai voice installed on OS - complete cleanly without speaking English
              handleSpeechDone();
            }
          } catch {
            handleSpeechDone();
          }
        } else {
          handleSpeechDone();
        }
      };

      // Attempt 2: Direct Google Neural Thai Stream
      const tryDirectGoogleTts = () => {
        try {
          const directUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encoded}`;
          const directAudio = new Audio(directUrl);
          audioPlayerRef.current = directAudio;
          directAudio.onended = handleSpeechDone;
          directAudio.onerror = tryWebSpeech;
          directAudio.play().catch(tryWebSpeech);
        } catch {
          tryWebSpeech();
        }
      };

      // Attempt 1: Server Proxy (/api/tts)
      try {
        const proxyUrl = `/api/tts?text=${encoded}`;
        const proxyAudio = new Audio(proxyUrl);
        audioPlayerRef.current = proxyAudio;
        proxyAudio.onended = handleSpeechDone;
        proxyAudio.onerror = tryDirectGoogleTts;
        proxyAudio.play().catch(tryDirectGoogleTts);
      } catch {
        tryDirectGoogleTts();
      }
    },
    [voiceEnabled, wakeWordActive]
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
        sender: userTitle.toUpperCase(),
        time: nowTime,
        text: clean,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      setHudState('SEARCHING');

      // Jarvis Neural Processing & AI Squad Coordination
      setTimeout(() => {
        const result = processJarvisCommand(clean);

        // Update Persona Title dynamically if requested
        if (result.action === 'SET_TITLE' && result.title) {
          setUserTitle(result.title);
          setUserTitleState(result.title);
        }

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
    [onRunAudit, onOpenQuotation, onSelectBrandTheme, speakThai, userTitle]
  );

  // Web Speech Recognition (Always-On Hands-free Wake Word: "javis" / "จาร์วิส")
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'th-TH';

      recognition.onstart = () => {
        setIsListening(true);
        setHudState('LISTENING');
      };

      recognition.onresult = (event) => {
        const lastResultIndex = event.results.length - 1;
        const transcript = (event.results[lastResultIndex][0]?.transcript || '').trim();
        if (!transcript || transcript.length < 2) return;

        const lower = transcript.toLowerCase();

        // 1. Iron Man Wake Word Check: "javis", "jarvis", "จาร์วิส", "จาวิส"
        const isWakeWord =
          lower.includes('javis') ||
          lower.includes('jarvis') ||
          lower.includes('จาร์วิส') ||
          lower.includes('จาวิส') ||
          lower.includes('เฮ้ จาร์วิส') ||
          lower.includes('เฮ้ จาวิส') ||
          lower.includes('เฮ้จาร์วิส') ||
          lower.includes('เฮ้จาวิส') ||
          lower.includes('hey javis') ||
          lower.includes('hey jarvis');

        // STRICT FILTER: If speech does NOT call "javis" / "จาร์วิส", IGNORE IT COMPLETELY!
        if (!isWakeWord) {
          return;
        }

        // Stop listening temporarily during command processing to avoid feedback
        try {
          recognitionRef.current?.stop();
        } catch {}
        setIsListening(false);

        playSuccessSound();

        const stripped = transcript
          .replace(/เฮ้\s*จาร์วิส/gi, '')
          .replace(/เฮ้\s*จาวิส/gi, '')
          .replace(/เฮ้จาร์วิส/gi, '')
          .replace(/เฮ้จาวิส/gi, '')
          .replace(/hey\s*javis/gi, '')
          .replace(/hey\s*jarvis/gi, '')
          .replace(/จาร์วิส/gi, '')
          .replace(/จาวิส/gi, '')
          .replace(/javis/gi, '')
          .replace(/jarvis/gi, '')
          .trim();

        if (stripped.length >= 2) {
          handleDispatchCommand(stripped);
        } else {
          speakThai(`ครับ${userTitle} มีอะไรให้ผมช่วยจัดการ หรือค้นหาข้อมูลไหมครับ?`);
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
              'กรุณากดไอคอนแม่กุญแจ 🔒 ที่แถบ URL เพื่อเลือก "Allow" ให้ใช้ไมโครโฟนเพื่อเปิดระบบจับเสียง "javis" อัตโนมัติครับ'
            );
          }
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (!isSpeaking) {
          setHudState('READY');
          // Hands-free Standby: Automatically re-arms to wait for next "javis" call
          if (wakeWordActive) {
            setTimeout(() => {
              try {
                if (wakeWordActive && !isSpeaking && recognitionRef.current) {
                  recognitionRef.current.start();
                  setIsListening(true);
                  setHudState('LISTENING');
                }
              } catch {}
            }, 300);
          }
        }
      };

      recognitionRef.current = recognition;
    }
  }, [isSpeaking, handleDispatchCommand, onShowToast, speakThai, userTitle, wakeWordActive]);

  // Hands-free Voice Engine: Auto-start Wake Word standby on mount or user gesture
  useEffect(() => {
    const startStandby = () => {
      try {
        if (recognitionRef.current && !isListening && !isSpeaking) {
          recognitionRef.current.start();
          setIsListening(true);
          setHudState('LISTENING');
        }
      } catch {}
    };

    const timer = setTimeout(startStandby, 800);
    const handleFirstGesture = () => {
      startStandby();
      window.removeEventListener('click', handleFirstGesture);
    };
    window.addEventListener('click', handleFirstGesture);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleFirstGesture);
    };
  }, [isListening, isSpeaking]);

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
          <span className="text-base font-black tracking-[0.25em] text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] font-mono">
            J . A . R . V . I . S .
          </span>
          <span className="rounded bg-cyan-950/70 px-2 py-0.5 text-[10px] font-bold text-cyan-300 border border-cyan-500/40 font-mono">
            MK III
          </span>
          <div className="hidden sm:flex items-center gap-1.5 rounded bg-slate-900/80 px-2.5 py-0.5 text-[10px] text-slate-300 border border-slate-700/80 font-mono">
            <Printer className="h-3 w-3 text-emerald-400" />
            <span>2 Printers</span>
          </div>
        </div>

        {/* Right Environment & Status (Matching Screenshot 1:1) */}
        <div className="flex items-center gap-5 text-[11px] text-slate-400">
          <div className="hidden md:flex items-center gap-4 font-mono text-[10px]">
            <div>
              <span className="text-slate-500 text-[9px] block">ENVIRONMENT</span>
              <span className="text-slate-200 font-bold">BANGKOK <span className="text-cyan-400">26°C</span></span>
              <div className="text-[9px] text-slate-400">HUMIDITY <span className="text-cyan-400">85%</span></div>
              <div className="text-[9px] text-slate-400">NETWORK <span className="text-emerald-400 font-bold">ONLINE</span></div>
            </div>
            <div className="border-l border-slate-800/90 pl-3">
              <span className="text-slate-300 font-bold block">OVERCAST</span>
              <span className="text-slate-500 text-[9px]">UPDATED 03:25</span>
            </div>
          </div>

          {/* Executive Honorific Title Switcher */}
          <button
            type="button"
            onClick={() => {
              playClickSound();
              const titles = ['คุณผู้ชาย', 'ท่านประธาน', 'ผู้การ', 'คุณไลท์'];
              const currentIndex = titles.indexOf(userTitle);
              const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % titles.length;
              const nextTitle = titles[nextIndex];
              setUserTitle(nextTitle);
              setUserTitleState(nextTitle);
              speakThai(`รับทราบครับ ${nextTitle} ต่อจากนี้ผมจะเรียกท่านว่า ${nextTitle} ครับ`);
              if (onShowToast) {
                onShowToast('info', 'เปลี่ยนคำเรียก', `J.A.R.V.I.S. จะเรียกท่านว่า "${nextTitle}"`);
              }
            }}
            className="hidden md:flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-950/40 px-2.5 py-1 text-[10px] font-bold text-sky-300 hover:bg-sky-900/50 hover:border-sky-400 transition-all shadow-sm cursor-pointer"
            title="คลิกเพื่อสลับคำเรียก: คุณผู้ชาย / ท่านประธาน / ผู้การ / คุณไลท์"
          >
            <span>🎖️ เรียก: {userTitle}</span>
          </button>

          {/* Thai Voice Sound Test Button */}
          <button
            type="button"
            onClick={() => {
              playClickSound();
              speakThai(`สวัสดีครับ ${userTitle} ผม จาร์วิส มาร์คทรี เสียงภาษาไทยพร้อมใช้งานแล้วครับ`);
              if (onShowToast) {
                onShowToast('info', 'ทดสอบเสียงภาษาไทย', 'กำลังเล่นเสียงสังเคราะห์ภาษาไทยออกลำโพงครับ');
              }
            }}
            className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-400 transition-all shadow-sm cursor-pointer"
            title="คลิกเพื่อทดสอบฟังเสียงพูดภาษาไทยของจาร์วิส"
          >
            <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>🇹🇭 เสียงไทย (THAI VOICE)</span>
          </button>

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
                    ? 'ปิดระบบจับเสียงอัตโนมัติแล้ว'
                    : 'เปิดระบบจับเสียงอัตโนมัติ (เรียก "javis" หรือ "จาร์วิส" ได้ทันที)'
                );
              }
            }}
            className={`hidden lg:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all ${
              wakeWordActive
                ? 'border-cyan-500/50 bg-cyan-950/70 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'border-slate-800 bg-slate-900 text-slate-500'
            }`}
            title="คลิกเพื่อเปิด / ปิดการดักฟัง 'javis' อัตโนมัติ"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                wakeWordActive ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'
              }`}
            />
            <span>WAKE WORD: {wakeWordActive ? 'JAVIS [ON]' : 'OFF'}</span>
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
            <div className="rounded-lg bg-slate-900/90 px-3 py-1 font-bold text-cyan-400 border border-cyan-500/30 font-mono">
              {currentTime || '03:25:18 AM'}
            </div>
            <div className="flex items-center gap-1 text-xs font-mono">
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
        {/* 1. LEFT VERTICAL TOOL DOCK (9 Icons matching screenshot 1:1) */}
        {/* ------------------------------------------------------------ */}
        <div className="hidden md:flex flex-col items-center justify-between rounded-2xl border border-cyan-500/20 bg-slate-950/70 p-2 shadow-xl backdrop-blur-md w-12 shrink-0 mr-4">
          <div className="space-y-2.5">
            {[
              { id: 'grid', icon: Grid, title: 'App Launcher & 15 Projects Suite', cmd: 'สรุปโปรเจกต์ทั้งหมด' },
              { id: 'ai', icon: Bot, title: 'J.A.R.V.I.S. Neural Core', cmd: 'สถานะทีม AI' },
              { id: 'wave', icon: Radio, title: 'Audio Stream & Waveform', cmd: 'ฟังเสียงภาษาไทย' },
              { id: 'scan', icon: Scan, title: 'Vision & Security Scan', cmd: 'เช็คความปลอดภัย vault' },
              { id: 'box', icon: Box, title: '3D Hologram & Specs', cmd: 'เปิดโฮโลแกรม' },
              { id: 'pulse', icon: Activity, title: 'Hardware Telemetry & Pulse', cmd: 'ตรวจระบบทั้งหมด' },
              { id: 'hand', icon: Hand, title: 'Hand Gesture Controls', cmd: 'เปิดการควบคุมด้วยมือ' },
              { id: 'power', icon: Zap, title: 'Arc Reactor / Mark III Power Online', cmd: 'พลังงานระบบ' },
              { id: 'settings', icon: Sliders, title: 'System Configuration', cmd: 'ตั้งค่าระบบ' },
            ].map((btn) => {
              const Icon = btn.icon;
              const isActive = activeLeftDock === btn.id;
              const isPower = btn.id === 'power';
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setActiveLeftDock(btn.id);
                    if (btn.cmd) handleDispatchCommand(btn.cmd);
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                    isPower && isActive
                      ? 'border-2 border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_14px_rgba(245,158,11,0.6)]'
                      : isActive
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

          {/* Audio Waveform Visualizer (Undulating Sine Curve matching Screenshot 1:1) */}
          <div className="mt-2.5 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <svg
                className="w-56 h-8 stroke-cyan-400 fill-none drop-shadow-[0_0_10px_rgba(56,189,248,0.85)]"
                viewBox="0 0 200 28"
              >
                <path
                  d={
                    isListening || isSpeaking
                      ? "M 10 14 Q 35 2, 60 14 T 100 14 T 140 14 T 180 14"
                      : "M 10 14 Q 35 8, 60 14 T 100 14 T 140 14 T 180 14"
                  }
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
              {/* Subtle pulsing glow aura */}
              <div
                className={`absolute inset-0 rounded-full blur-md transition-opacity ${
                  isListening || isSpeaking ? 'bg-cyan-500/20 opacity-100' : 'opacity-0'
                }`}
              />
            </div>
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
                  <span className="text-emerald-400 font-bold">{networkUsage}</span>
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
                '🔊 ฟังเสียงภาษาไทย',
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
                  onClick={() => {
                    if (chip === '🔊 ฟังเสียงภาษาไทย') {
                      playClickSound();
                      speakThai(`สวัสดีครับ ${userTitle} ผม จาร์วิส มาร์คทรี เสียงภาษาไทยพร้อมใช้งาน 100% แล้วครับ`);
                    } else {
                      handleDispatchCommand(chip);
                    }
                  }}
                  className={`shrink-0 rounded-lg px-2 py-0.5 transition-all font-sans cursor-pointer ${
                    chip.startsWith('🔊')
                      ? 'border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60 font-bold shadow-sm'
                      : 'border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400'
                  }`}
                  title={`ส่งคำสั่ง "${chip}"`}
                >
                  {chip.startsWith('🔊') ? chip : `"${chip}"`}
                </button>
              ))}
            </div>

            {/* Input Box (Matching `INITIALIZE COMMAND...` in screenshot 1:1) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDispatchCommand(inputText);
              }}
              className="mt-1 flex items-center gap-2 pt-1"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="INITIALIZE COMMAND ..."
                  className="w-full rounded-xl border border-cyan-500/40 bg-slate-900/90 px-3 py-2 text-xs text-cyan-200 placeholder-cyan-500/50 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 font-mono tracking-wider"
                />
                {!inputText && (
                  <span className="absolute right-3 top-2.5 h-3.5 w-1.5 bg-cyan-400 animate-pulse" />
                )}
              </div>
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
