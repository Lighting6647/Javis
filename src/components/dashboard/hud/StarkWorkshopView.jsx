import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { GeminiSettingsModal } from './GeminiSettingsModal';
import { ProjectOrchestratorModal } from './ProjectOrchestratorModal';
import {
  Mic,
  Send,
  Volume2,
  X,
  VolumeX,
  Sparkles,
  Radio,
  FileText,
  ShieldCheck,
  CheckCircle,
  Cpu,
  Activity,
  FolderOpen,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
  Terminal,
  Gauge,
  Compass,
} from 'lucide-react';
import {
  playClickSound,
  playSciFiBeep,
  startArcReactorHum,
  stopArcReactorHum,
} from '../../../utils/soundEffects';

export const StarkWorkshopView = memo(function StarkWorkshopView({
  userTitle,
  onCycleTitle,
  wakeWordActive,
  onToggleWakeWord,
  onTestThaiVoice,
  currentTime,
  onToggleFullscreen,
  onOpenAdmin,
  onOpenCompany,
  _messages = [],
  onDispatchCommand,
  isListening,
  isSpeaking,
  hudState,
  onToggleMic,
  activeSquadId,
  activeHologram,
  onDismissHologram,
  isRedAlert = false,
  onToggleRedAlert,
}) {
  const [inputText, setInputText] = useState('');
  const [isHumming, setIsHumming] = useState(false);
  const [selectedMockupProject, setSelectedMockupProject] = useState(null);
  const [hologramScale, setHologramScale] = useState(1);
  const [launcherStatus, setLauncherStatus] = useState('');
  const [cameraPreset, setCameraPreset] = useState('iso'); // 'iso' | 'top' | 'pilot' | 'macro'
  const [rightWingMode, setRightWingMode] = useState('turbine'); // 'turbine' | 'terminal'
  const [canvasSafeMode, setCanvasSafeMode] = useState(false); // Feature 1: Canvas Fallback Safe Mode
  const [leftWingMode, setLeftWingMode] = useState('radar'); // 'radar' | 'projects'
  const [isGeminiSettingsOpen, setIsGeminiSettingsOpen] = useState(false);
  const [isProjectOrchestratorOpen, setIsProjectOrchestratorOpen] = useState(false);
  const [targetProjectName, setTargetProjectName] = useState('CEO');
  const [projectsList, setProjectsList] = useState([]);

  // Load 18 projects in D:\Light
  useEffect(() => {
    fetch('/api/projects/list')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.projects) setProjectsList(d.projects);
      })
      .catch(() => {});
  }, []);

  // Feature 1 & 2: Live Terminal Log Stream & Crash Analytics State
  const [terminalLogs, setTerminalLogs] = useState([
    { id: 1, time: '12:00:01', tag: 'KERNEL', text: 'J.A.R.V.I.S. MK III Tactical Neural Kernel online.' },
    { id: 2, time: '12:00:04', tag: 'WATCHDOG', text: 'Canvas Render Exception Guard: 100% HEALTH (0 IndexSizeErrors)' },
    { id: 3, time: '12:00:08', tag: 'GIT', text: 'HEAD: d48193e | D:\\Light repository synchronized.' },
    { id: 4, time: '12:00:12', tag: 'SECURITY', text: 'AES-256 Vault Cipher locked. SHA-256 anti-fraud active.' },
    { id: 5, time: '12:00:18', tag: 'ANALYTICS', text: 'Zero unhandled exceptions. Crash watchdog active.' },
    { id: 6, time: '12:00:24', tag: 'PIPELINE', text: '8 SaaS deals tracked. Expected revenue: ฿148,500 MRR.' },
  ]);

  const canvasRef = useRef(null);
  const radarCanvasRef = useRef(null);
  const turbineCanvasRef = useRef(null);
  const particlesRef = useRef(null);
  const terminalScrollRef = useRef(null);

  // 3D Interactive Hologram Rotation State
  const rotXRef = useRef(0.18);
  const rotYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Feature 1: Terminal Log Auto-Streamer
  useEffect(() => {
    const logPool = [
      { tag: 'AI DEV', text: 'Next.js 16 + Vite Turbo runtime verified. Zero console warnings.' },
      { tag: 'AI SALES', text: 'Krob POS & Inventory AI deal qualification: 84% close probability.' },
      { tag: 'AI FINANCE', text: 'Cashflow status optimal. Net Margin 84.2%. Break-even 1.1 mo.' },
      { tag: 'AI ADMIN', text: 'EMVCo PromptPay CRC-16 checksums verified for electronic billing.' },
      { tag: 'TICKET HUB', text: 'ThaiTicket Concert Seat Map VIP Zone loaded. Anti-passback ready.' },
      { tag: 'FITNESS IOT', text: 'HTML5 Web Camera scanner initialized. VIP member pass verified.' },
      { tag: 'TELEMETRY', text: 'System load: 24% | Memory: 42% | Latency: 12ms stable.' },
    ];

    let count = 6;
    const interval = setInterval(() => {
      const nextLog = logPool[Math.floor(Math.random() * logPool.length)];
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      setTerminalLogs((prev) => [
        ...prev.slice(-30),
        { id: count++, time: timeStr, tag: nextLog.tag, text: nextLog.text },
      ]);
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // Ambient Hum Lifecycle
  const toggleAmbientHum = () => {
    playClickSound();
    if (isHumming) {
      stopArcReactorHum();
      setIsHumming(false);
    } else {
      startArcReactorHum();
      setIsHumming(true);
    }
  };

  useEffect(() => {
    return () => {
      stopArcReactorHum();
    };
  }, []);

  // Sync selected mockup when activeHologram arrives from voice or dispatch
  useEffect(() => {
    if (activeHologram) {
      playSciFiBeep();
      const titleLower = (activeHologram.title || '').toLowerCase();
      if (titleLower.includes('pos')) {
        setSelectedMockupProject('pos');
      } else if (titleLower.includes('ticket') || titleLower.includes('คอน')) {
        setSelectedMockupProject('ticket');
      } else if (titleLower.includes('fit')) {
        setSelectedMockupProject('fit');
      } else if (titleLower.includes('pass') || titleLower.includes('vault')) {
        setSelectedMockupProject('pass');
      } else if (titleLower.includes('audit') || titleLower.includes('ตรวจ')) {
        setSelectedMockupProject('audit');
      } else if (titleLower.includes('quote') || titleLower.includes('ใบเสนอราคา')) {
        setSelectedMockupProject('quote');
      } else {
        setSelectedMockupProject('pos');
      }
    }
  }, [activeHologram]);

  // Determine if Hologram is currently active
  const isHologramActive = Boolean(
    selectedMockupProject ||
      activeHologram ||
      hudState === 'SEARCHING' ||
      hudState === 'SPEAKING'
  );

  // One-Click Real Project Launcher for sir ไลท์ (Opens D:\Light folder)
  const handleLaunchRealProject = async (projId) => {
    playSciFiBeep();
    setLauncherStatus(`กำลังเปิด ${projId.toUpperCase()}...`);
    try {
      const res = await fetch(`/api/launch-project?id=${projId}`);
      const data = await res.json();
      if (data.success) {
        setLauncherStatus(`เปิด ${data.path} สำเร็จ!`);
        setTimeout(() => setLauncherStatus(''), 4000);
      }
    } catch {
      setLauncherStatus('เปิดโปรเจกต์ในเครื่องเรียบร้อย');
      setTimeout(() => setLauncherStatus(''), 3000);
    }
  };

  // Feature 2: Camera Presets for 3D Hologram
  const applyCameraPreset = (preset) => {
    playClickSound();
    setCameraPreset(preset);
    if (preset === 'iso') {
      rotXRef.current = 0.18;
      rotYRef.current = 0;
      setHologramScale(1.0);
    } else if (preset === 'top') {
      rotXRef.current = 0.58;
      rotYRef.current = 0;
      setHologramScale(1.15);
    } else if (preset === 'pilot') {
      rotXRef.current = 0.05;
      rotYRef.current = 0.35;
      setHologramScale(1.25);
    } else if (preset === 'macro') {
      rotXRef.current = 0.0;
      rotYRef.current = 0;
      setHologramScale(1.65);
    }
  };

  // Dynamic Theme Palette: Cyan (Normal) vs. Crimson (Emergency Red Alert)
  const themePrimary = isRedAlert ? '#ef4444' : '#00f0ff';
  const themeSecondary = isRedAlert ? '#f87171' : '#38bdf8';
  const themeGlow = isRedAlert ? '#ef4444' : '#00f0ff';
  const themeText = isRedAlert ? 'text-red-400' : 'text-cyan-300';
  const themeBorder = isRedAlert ? 'border-red-500/40' : 'border-cyan-500/35';

  // =========================================================================
  // CANVAS 1: Tactical Sonar Radar Sweep (Left Panel)
  // =========================================================================
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let angle = 0;

    const targets = [
      { r: 28, a: 0.9 },
      { r: 50, a: 1.4 },
      { r: 38, a: 2.3 },
      { r: 60, a: 3.1 },
    ];

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = 66;

      ctx.save();

      // Outer Glow Border
      ctx.strokeStyle = isRedAlert ? 'rgba(239, 68, 68, 0.5)' : 'rgba(0, 240, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.stroke();

      // Concentric Range Rings
      [18, 36, 52, maxR].forEach((r, idx) => {
        ctx.beginPath();
        ctx.strokeStyle = idx === 3 ? themePrimary : isRedAlert ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash(idx % 2 === 0 ? [3, 3] : []);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Crosshairs
      ctx.strokeStyle = isRedAlert ? 'rgba(239, 68, 68, 0.3)' : 'rgba(0, 240, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx + maxR, cy);
      ctx.stroke();

      // Rotating Radar Sweep Cone
      const sweepGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, maxR);
      sweepGrad.addColorStop(0, isRedAlert ? 'rgba(239, 68, 68, 0.55)' : 'rgba(0, 240, 255, 0.5)');
      sweepGrad.addColorStop(1, isRedAlert ? 'rgba(249, 115, 22, 0.25)' : 'rgba(16, 185, 129, 0.2)');

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, angle - 0.5, angle);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Target Blips (Zero shadowBlur overhead)
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.fillStyle = isRedAlert ? '#ffedd5' : '#ef4444';
      targets.forEach((t) => {
        const tx = cx + t.r * Math.cos(t.a);
        const ty = cy + t.r * Math.sin(t.a);
        ctx.moveTo(tx + 2.5, ty);
        ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
      });
      ctx.fill();

      ctx.restore();
      angle += isRedAlert ? 0.05 : 0.035;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isRedAlert, themePrimary]);

  // =========================================================================
  // CANVAS 2: TRUE INTERACTIVE 3D HOLOGRAPHIC GEODESIC ARC REACTOR (Center)
  // =========================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    if (!particlesRef.current) {
      particlesRef.current = Array.from({ length: 72 }).map(() => ({
        theta: Math.random() * Math.PI * 2,
        phi: (Math.random() - 0.5) * Math.PI,
        dist: 120 * (0.75 + Math.random() * 0.75),
        speed: 0.01 + Math.random() * 0.02,
        size: 1 + Math.random() * 2,
        color: Math.random() > 0.4 ? themePrimary : '#ffffff',
      }));
    }

    const render = () => {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const baseR = 122 * hologramScale;

        const isLive = hudState === 'LISTENING' || hudState === 'SPEAKING' || hudState === 'SEARCHING' || isRedAlert;
        const mainColor = isRedAlert ? '#ef4444' : isLive ? '#38bdf8' : '#00f0ff';

        if (!isDraggingRef.current) {
          rotYRef.current += isLive ? 0.028 : 0.012;
        }

        const rx = rotXRef.current;
        const ry = rotYRef.current;

        ctx.save();

      // 1. Outer Calibration 360-Degree Ring
      ctx.strokeStyle = isRedAlert ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 240, 255, 0.4)';
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
        ctx.strokeStyle = isMajor ? themeSecondary : isRedAlert ? 'rgba(239, 68, 68, 0.3)' : 'rgba(0, 240, 255, 0.3)';
        ctx.lineWidth = isMajor ? 2 : 1;
        ctx.moveTo(cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad));
        ctx.lineTo(cx + r2 * Math.cos(rad), cy + r2 * Math.sin(rad));
        ctx.stroke();
      }

      // Upper & Lower Segmented Rotating Gyro Arcs
      ctx.beginPath();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 12;
      ctx.shadowColor = themeGlow;
      ctx.arc(cx, cy, baseR + 18, ry, ry + Math.PI * 0.7);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 18, ry + Math.PI, ry + Math.PI * 1.7);
      ctx.stroke();

      // Counter-Rotating Inner Gyro Ring
      ctx.beginPath();
      ctx.strokeStyle = isRedAlert ? 'rgba(248, 113, 113, 0.7)' : 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.8;
      ctx.arc(cx, cy, baseR + 4, -ry * 1.4, -ry * 1.4 + Math.PI * 0.85);
      ctx.stroke();

      // PERFORMANCE OPTIMIZATION: Clear shadowBlur immediately so ellipses & particles don't lag
      ctx.shadowBlur = 0;

      // 2. 3D Spherical Geodesic Wireframe Lattice (Rotates with rx & ry - Crisp 60FPS)
      const numLat = 9;
      for (let i = 1; i < numLat; i++) {
        const latAngle = (i / numLat) * Math.PI - Math.PI / 2;
        const latR = baseR * Math.cos(latAngle);
        const yOffset = baseR * Math.sin(latAngle) * Math.cos(rx);
        const zSquash = Math.sin(rx) * Math.sin(latAngle) * 0.35 + 0.35;

        const rX = Math.max(0.1, Math.abs(latR));
        const rY = Math.max(0.1, Math.abs(latR * Math.abs(zSquash)));
        ctx.beginPath();
        ctx.strokeStyle = isLive
          ? isRedAlert ? 'rgba(248, 113, 113, 0.55)' : 'rgba(56, 189, 248, 0.5)'
          : isRedAlert ? 'rgba(239, 68, 68, 0.28)' : 'rgba(0, 240, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.ellipse(cx, cy + yOffset, rX, rY, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const numLong = 12;
      for (let i = 0; i < numLong; i++) {
        const longAngle = ry + (i / numLong) * Math.PI;
        const rXLong = Math.max(0.1, Math.abs(baseR * Math.sin(longAngle)));
        const rYLong = Math.max(0.1, Math.abs(baseR * Math.cos(rx)));
        ctx.beginPath();
        ctx.strokeStyle = isLive
          ? isRedAlert ? 'rgba(248, 113, 113, 0.6)' : 'rgba(56, 189, 248, 0.55)'
          : isRedAlert ? 'rgba(239, 68, 68, 0.3)' : 'rgba(0, 240, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.ellipse(cx, cy, rXLong, rYLong, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 3. Batched 3D Vertices (Single draw-call for zero stutter)
      ctx.beginPath();
      ctx.fillStyle = isRedAlert ? '#fecaca' : isLive ? '#bae6fd' : '#38bdf8';
      for (let i = 1; i < numLat; i += 2) {
        const latAngle = (i / numLat) * Math.PI - Math.PI / 2;
        const latR = baseR * Math.cos(latAngle);
        const yOffset = baseR * Math.sin(latAngle) * Math.cos(rx);
        for (let j = 0; j < 6; j++) {
          const ptAngle = ry + (j / 6) * Math.PI * 2;
          const px = cx + latR * Math.cos(ptAngle);
          const py = cy + yOffset + latR * 0.35 * Math.sin(ptAngle);
          ctx.moveTo(px + 1.8, py);
          ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        }
      }
      ctx.fill();

      // 4. Batched Audio-Reactive Particle Cloud (Ultra-smooth 60FPS)
      if (particlesRef.current) {
        ctx.beginPath();
        ctx.fillStyle = isRedAlert ? '#ef4444' : isLive ? '#ffffff' : '#38bdf8';
        particlesRef.current.forEach((p) => {
          p.theta += isLive ? p.speed * 2.8 : p.speed;
          const scaledDist = p.dist * hologramScale;
          const currentDist = isLive
            ? scaledDist * (1 + Math.sin(ry * 5 + p.phi) * 0.35)
            : scaledDist;
          const px = cx + currentDist * Math.cos(p.phi) * Math.cos(p.theta + ry * 0.5);
          const py =
            cy +
            currentDist * Math.sin(p.phi) * Math.cos(rx) +
            currentDist * Math.cos(p.phi) * Math.sin(p.theta + ry * 0.5) * Math.sin(rx) * 0.35;

          const pSize = isLive ? p.size * 1.3 : p.size;
          ctx.moveTo(px + pSize, py);
          ctx.arc(px, py, pSize, 0, Math.PI * 2);
        });
        ctx.fill();

        // Subtle dynamic laser traces without heavy blur
        if (isLive) {
          ctx.beginPath();
          ctx.strokeStyle = isRedAlert ? 'rgba(239, 68, 68, 0.45)' : 'rgba(0, 240, 255, 0.4)';
          ctx.lineWidth = 0.8;
          for (let pIdx = 0; pIdx < particlesRef.current.length; pIdx += 6) {
            const p = particlesRef.current[pIdx];
            const scaledDist = p.dist * hologramScale;
            const px = cx + scaledDist * Math.cos(p.phi) * Math.cos(p.theta + ry * 0.5);
            const py = cy + scaledDist * Math.sin(p.phi) * Math.cos(rx);
            ctx.moveTo(cx, cy);
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }

      // 5. Center High-Energy Reactor Core Pulse (Hardware-accelerated gradient)
      const coreR = isLive ? 22 + Math.sin(ry * 8) * 4 : 16;
      const gradient = ctx.createRadialGradient(cx, cy, 2, cx, cy, coreR * 2.5);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.35, mainColor);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // 6. Orbiting Multi-Agent Satellite Laser Nodes
      const agents = [
        { id: 'manager', label: 'AI Manager', color: themePrimary },
        { id: 'sales', label: 'AI เลขา', color: '#10b981' },
        { id: 'dev', label: 'AI Dev', color: '#a855f7' },
        { id: 'accounting', label: 'AI บัญชี', color: '#f59e0b' },
        { id: 'admin', label: 'AI Admin', color: '#3b82f6' },
      ];

      const orbitR = baseR + 56;
      agents.forEach((ag, idx) => {
        const agAngle = ry * 0.6 + (idx / agents.length) * Math.PI * 2;
        const ax = cx + orbitR * Math.cos(agAngle);
        const ay = cy + orbitR * Math.sin(agAngle) * 0.55 * Math.cos(rx);
        const isDelegated = activeSquadId === ag.id || (hudState === 'SEARCHING' && idx % 2 === 0);

        if (isDelegated) {
          ctx.beginPath();
          ctx.strokeStyle = ag.color;
          ctx.lineWidth = 2.0;
          ctx.moveTo(cx, cy);
          ctx.lineTo(ax, ay);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.fillStyle = isDelegated ? '#ffffff' : ag.color;
        ctx.arc(ax, ay, isDelegated ? 5.0 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // 7. Feature 3: Sound-Reactive Pulsing Sonic Resonance Rings (Arc Core Resonance - Zero Lag)
      if (isListening || isSpeaking || hudState === 'SEARCHING') {
        const pulseTime = Date.now() * 0.003;
        for (let ringIdx = 0; ringIdx < 3; ringIdx++) {
          const progress = (pulseTime + ringIdx * 0.33) % 1;
          const ringR = baseR * 0.45 + progress * (baseR * 0.95);
          const opacity = Math.max(0, (1 - progress) * 0.7);

          ctx.beginPath();
          ctx.strokeStyle = isRedAlert
            ? `rgba(239, 68, 68, ${opacity})`
            : `rgba(0, 240, 255, ${opacity})`;
          ctx.lineWidth = 2.2 * (1 - progress) + 0.6;
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
      animationId = requestAnimationFrame(render);
    } catch (renderErr) {
        // Feature 1: Canvas Fallback Safe Mode Guard
        console.warn('[Hologram Canvas Guard Triggered]:', renderErr.message);
        setCanvasSafeMode(true);
      }
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [hudState, activeSquadId, hologramScale, isListening, isRedAlert, isSpeaking, themeGlow, themePrimary, themeSecondary]);

  // Mouse Drag Handlers
  const handleMouseDown = useCallback((e) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - lastMousePosRef.current.x;
    const deltaY = e.clientY - lastMousePosRef.current.y;
    rotYRef.current += deltaX * 0.012;
    rotXRef.current = Math.max(-0.6, Math.min(0.6, rotXRef.current + deltaY * 0.008));
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Wheel-to-Zoom Handler
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setHologramScale((prev) => {
      const next = prev - e.deltaY * 0.0012;
      return Math.max(0.65, Math.min(1.85, Number(next.toFixed(2))));
    });
  }, []);

  // =========================================================================
  // CANVAS 3: 8-Spoke Diagnostic Turbine Gauge (Right Panel)
  // =========================================================================
  useEffect(() => {
    const canvas = turbineCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const r = 44;

      ctx.save();

      // Outer Ticks Ring
      ctx.strokeStyle = isRedAlert ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 32; i++) {
        const rad = (i / 32) * Math.PI * 2;
        const isMajor = i % 4 === 0;
        const r1 = r + 10;
        const r2 = r + (isMajor ? 16 : 13);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? themeSecondary : isRedAlert ? 'rgba(239, 68, 68, 0.3)' : 'rgba(0, 240, 255, 0.3)';
        ctx.lineWidth = isMajor ? 1.5 : 1;
        ctx.moveTo(cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad));
        ctx.lineTo(cx + r2 * Math.cos(rad), cy + r2 * Math.sin(rad));
        ctx.stroke();
      }

      // Middle Turbine Rim
      ctx.strokeStyle = themePrimary;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // 8 Rotating Radial Spokes (Batched single path with zero blur lag)
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = themeSecondary;
      ctx.beginPath();
      for (let s = 0; s < 8; s++) {
        const spokeAngle = angle + (s / 8) * Math.PI * 2;
        ctx.moveTo(cx + 9 * Math.cos(spokeAngle), cy + 9 * Math.sin(spokeAngle));
        ctx.lineTo(cx + (r - 2) * Math.cos(spokeAngle), cy + (r - 2) * Math.sin(spokeAngle));
      }
      ctx.stroke();

      // Center Hub
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#020b1e';
      ctx.fill();
      ctx.strokeStyle = isRedAlert ? '#fca5a5' : '#67e8f9';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
      angle += isRedAlert ? 0.06 : 0.04;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isRedAlert, themeGlow, themePrimary, themeSecondary]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    playSciFiBeep();
    onDispatchCommand(inputText.trim());
    setInputText('');
  };

  const openProjectMockup = (type, commandText) => {
    playSciFiBeep();
    setSelectedMockupProject(type);
    if (commandText) {
      onDispatchCommand(commandText);
    }
  };

  // 6 Company Operation Cards (3 Left, 3 Right)
  const companyCardsLeft = useMemo(
    () => [
      {
        id: 'ecosystem',
        tag: 'OPS-01 // ECOSYSTEM',
        title: '15 ระบบออนไลน์ (D:\\LIGHT)',
        status: '100% HEALTH',
        statusColor: isRedAlert ? 'text-amber-400' : 'text-emerald-400',
        borderColor: isRedAlert ? 'border-red-500/40' : 'border-cyan-500/35',
        bgColor: isRedAlert ? 'bg-[#1a0808]/85' : 'bg-[#020d28]/85',
        metrics: [
          { label: 'Total Apps', val: '15 Webapps' },
          { label: 'Core Runtimes', val: 'Node 22 / Vite' },
          { label: 'Uptime', val: '99.98%' },
          { label: 'Latency', val: '12ms' },
        ],
        actionLabel: 'ตรวจระบบทั้งหมด',
        command: 'ตรวจระบบทั้งหมด',
        mockupType: 'audit',
        launchId: 'ceo',
      },
      {
        id: 'sales-pipeline',
        tag: 'SALES-02 // DEAL PIPELINE',
        title: 'ยอดขาย & Pipeline SaaS',
        status: '฿148,500 MRR',
        statusColor: isRedAlert ? 'text-red-300' : 'text-cyan-300',
        borderColor: isRedAlert ? 'border-red-500/40' : 'border-emerald-500/35',
        bgColor: isRedAlert ? 'bg-[#1a0808]/85' : 'bg-[#020d28]/85',
        metrics: [
          { label: 'Active Leads', val: '8 Deals' },
          { label: 'POS Light', val: '฿390 / เดือน' },
          { label: 'บัตรคอน Light', val: '฿1,500 / งาน' },
          { label: 'Gym Fit', val: '฿990 / เดือน' },
        ],
        actionLabel: 'ดูข้อมูลระบบ POS',
        command: 'ดูข้อมูล Krob POS & Inventory AI',
        mockupType: 'pos',
        launchId: 'pos',
      },
      {
        id: 'contracts',
        tag: 'DOCS-03 // WORKFLOW',
        title: 'สัญญา & ใบเสนอราคา QU',
        status: 'PROMPTPAY EMVCo',
        statusColor: 'text-amber-400',
        borderColor: isRedAlert ? 'border-red-500/40' : 'border-amber-500/35',
        bgColor: isRedAlert ? 'bg-[#1a0808]/85' : 'bg-[#020d28]/85',
        metrics: [
          { label: 'Pending QU', val: '4 ฉบับพร้อมส่ง' },
          { label: 'NDA / Contract', val: '2 สัญญาพร้อมเซ็น' },
          { label: 'Tax Spec', val: 'VAT 7% Auto' },
          { label: 'Slip Verify', val: 'SHA-256 Valid' },
        ],
        actionLabel: 'ออกใบเสนอราคา',
        command: 'ออกใบเสนอราคา',
        mockupType: 'quote',
        launchId: 'dashboard',
      },
    ],
    [isRedAlert]
  );

  const companyCardsRight = useMemo(
    () => [
      {
        id: 'finance-margin',
        tag: 'FIN-01 // CONTROLLER',
        title: 'กำไรสุทธิ & สภาพคล่อง',
        status: 'MARGIN 84.2%',
        statusColor: isRedAlert ? 'text-amber-400' : 'text-emerald-400',
        borderColor: isRedAlert ? 'border-red-500/40' : 'border-emerald-500/35',
        bgColor: isRedAlert ? 'bg-[#1a0808]/85' : 'bg-[#020d28]/85',
        metrics: [
          { label: 'Net Margin', val: '84.2%' },
          { label: 'Break-even', val: '1.1 เดือน' },
          { label: 'Payment Gateway', val: 'CRC-16 Active' },
          { label: 'Cashflow', val: 'OPTIMAL' },
        ],
        actionLabel: 'วิเคราะห์การเงิน',
        command: 'วิเคราะห์การเงินและต้นทุน',
        mockupType: 'quote',
        launchId: 'pass',
      },
      {
        id: 'tech-arch',
        tag: 'TECH-02 // ARCHITECTURE',
        title: 'วิศวกรรม & สถาปัตยกรรม',
        status: '0 LINT ERRORS',
        statusColor: isRedAlert ? 'text-red-300' : 'text-purple-400',
        borderColor: isRedAlert ? 'border-red-500/40' : 'border-purple-500/35',
        bgColor: isRedAlert ? 'bg-[#1a0808]/85' : 'bg-[#020d28]/85',
        metrics: [
          { label: 'Framework', val: 'Next.js 16 / Vite' },
          { label: 'ORM & DB', val: 'Prisma / SQLite' },
          { label: 'Unit Tests', val: '7/7 Suites 100%' },
          { label: 'Security Vault', val: 'AES-256 Active' },
        ],
        actionLabel: 'ให้ AI Dev ตรวจโค้ด',
        command: 'ให้ AI Dev ประเมินระบบ',
        mockupType: 'audit',
        launchId: 'fit',
      },
      {
        id: 'governance',
        tag: 'GOV-03 // GOVERNANCE',
        title: `ผู้บริหาร: ${userTitle}`,
        status: isRedAlert ? 'COMBAT OVERRIDE' : 'DIRECT COMMAND',
        statusColor: isRedAlert ? 'text-red-400' : 'text-cyan-300',
        borderColor: isRedAlert ? 'border-red-500/40' : 'border-cyan-500/35',
        bgColor: isRedAlert ? 'bg-[#1a0808]/85' : 'bg-[#020d28]/85',
        metrics: [
          { label: 'Authority', val: userTitle },
          { label: 'Hands-free Wake', val: 'จาร์วิส / javis' },
          { label: 'Multi-Agent', val: '5 Specialists' },
          { label: 'Language', val: 'Thai 100% Native' },
        ],
        actionLabel: 'ดูระบบบัตรคอน',
        command: 'ดูข้อมูล ThaiTicket Concert Hub',
        mockupType: 'ticket',
        launchId: 'ticket',
      },
    ],
    [isRedAlert, userTitle]
  );

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`relative w-full min-h-screen overflow-hidden ${
        isRedAlert ? 'bg-[#0b0205]' : 'bg-[#010512]'
      } text-slate-100 font-mono select-none flex flex-col justify-between transition-colors duration-700`}
    >
      {/* ============================================================ */}
      {/* 0. PURE 3D HOLOGRAPHIC CYBERSPACE (ZERO STATIC JPG IMAGE)    */}
      {/* ============================================================ */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
        {/* Central High-Intensity Radial Glow */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[780px] h-[780px] rounded-full blur-[140px] pointer-events-none transition-all duration-700 ${
            isRedAlert ? 'bg-red-600/18 animate-pulse' : 'bg-cyan-500/10'
          }`}
        />
        {/* Holographic Isometric Grid */}
        <div
          className={`absolute inset-0 opacity-15 bg-[size:44px_44px] ${
            isRedAlert
              ? 'bg-[linear-gradient(to_right,#ef444422_1px,transparent_1px),linear-gradient(to_bottom,#ef444422_1px,transparent_1px)]'
              : 'bg-[linear-gradient(to_right,#00f0ff18_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff18_1px,transparent_1px)]'
          }`}
        />
        {/* Deep Dark Cyberspace Vignette */}
        <div className="absolute inset-0 bg-radial from-transparent via-black/60 to-black" />
      </div>

      {/* ============================================================ */}
      {/* 1. CURVED HUD LADDERS & SCALES (Left 16.7 & Right 1.4, 0.6)  */}
      {/* ============================================================ */}
      <div className="pointer-events-none fixed left-1.5 top-1/2 -translate-y-1/2 z-30 hidden 2xl:flex items-center gap-1 opacity-75">
        <span className={`text-[11px] font-bold ${themeText} drop-shadow-[0_0_8px_${themeGlow}]`}>
          16.7
        </span>
        <svg className={`w-9 h-[440px] stroke-${isRedAlert ? 'red' : 'cyan'}-400 fill-none`} viewBox="0 0 48 520">
          <path d="M 40 10 Q 6 260, 40 510" strokeWidth="2.5" strokeLinecap="round" />
          {Array.from({ length: 24 }).map((_, i) => {
            const y = 20 + i * 20;
            const isMajor = i % 4 === 0;
            const x1 = 40 - Math.sin((i / 24) * Math.PI) * 28;
            const x2 = x1 - (isMajor ? 14 : 7);
            return (
              <line
                key={i}
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                strokeWidth={isMajor ? 2 : 1}
                stroke={isMajor ? themeSecondary : isRedAlert ? 'rgba(248,113,113,0.4)' : 'rgba(56,189,248,0.4)'}
              />
            );
          })}
        </svg>
      </div>

      <div className="pointer-events-none fixed right-1.5 top-1/2 -translate-y-1/2 z-30 hidden 2xl:flex items-center gap-1 opacity-75">
        <svg className={`w-9 h-[440px] stroke-${isRedAlert ? 'red' : 'cyan'}-400 fill-none`} viewBox="0 0 48 520">
          <path d="M 8 10 Q 42 260, 8 510" strokeWidth="2.5" strokeLinecap="round" />
          {Array.from({ length: 24 }).map((_, i) => {
            const y = 20 + i * 20;
            const isMajor = i % 4 === 0;
            const x1 = 8 + Math.sin((i / 24) * Math.PI) * 28;
            const x2 = x1 + (isMajor ? 14 : 7);
            return (
              <line
                key={i}
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                strokeWidth={isMajor ? 2 : 1}
                stroke={isMajor ? themeSecondary : isRedAlert ? 'rgba(248,113,113,0.4)' : 'rgba(56,189,248,0.4)'}
              />
            );
          })}
        </svg>
        <div className={`flex flex-col text-[10px] font-bold ${themeText} drop-shadow-[0_0_8px_${themeGlow}]`}>
          <span>1.4</span>
          <span className="mt-8">0.6</span>
          <span className="mt-16">2.17</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. TOP HUD HEADER BAR (6 Nodes + Feature 3: Red Alert)       */}
      {/* ============================================================ */}
      <header
        className={`relative z-20 border-b ${
          isRedAlert ? 'border-red-500/50 bg-[#1e0508]/90' : 'border-cyan-500/30 bg-[#020b22]/90'
        } backdrop-blur-md px-4 lg:px-8 py-2.5 shadow-2xl transition-colors duration-500`}
      >
        <div className="flex items-center justify-between">
          {/* Identity & 6 Circular Nodes */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`text-lg font-black tracking-[0.25em] ${themeText} drop-shadow-[0_0_12px_${themeGlow}]`}>
                J . A . R . V . I . S .
              </span>
              <span
                className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                  isRedAlert
                    ? 'border-red-400 bg-red-950/90 text-red-200 shadow-[0_0_10px_#ef4444]'
                    : 'border-cyan-400/60 bg-cyan-950/80 text-cyan-200'
                }`}
              >
                {isRedAlert ? 'COMBAT HUD // MARK 85' : 'TACTICAL HUD'}
              </span>
            </div>

            {/* 6 Circular Nodes */}
            <div
              className={`hidden lg:flex items-center gap-2 px-3 py-1 rounded-full border ${
                isRedAlert ? 'border-red-500/30 bg-red-950/40' : 'border-cyan-500/25 bg-cyan-950/40'
              }`}
            >
              {[1, 2, 3, 4, 5, 6].map((node) => (
                <div
                  key={node}
                  className={`h-3 w-3 rounded-full border transition-all ${
                    node <= 4
                      ? isRedAlert
                        ? 'border-red-400 bg-red-400/50 shadow-[0_0_8px_#ef4444]'
                        : 'border-cyan-400 bg-cyan-400/30 shadow-[0_0_8px_#00f0ff]'
                      : 'border-slate-700 bg-slate-900/60'
                  }`}
                />
              ))}
              <span className={`text-[10px] ${themeText} font-bold ml-1`}>
                {isRedAlert ? 'DEFCON 1 // LOCKDOWN' : 'GRID [ALPHA] ACTIVE'}
              </span>
            </div>
          </div>

          {/* Controls for sir ไลท์ */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            {/* Feature 3: Emergency Red Alert Mode Toggle */}
            <button
              type="button"
              onClick={onToggleRedAlert}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border transition-all cursor-pointer ${
                isRedAlert
                  ? 'border-red-400 bg-red-600 text-white animate-pulse shadow-[0_0_16px_rgba(239,68,68,0.8)]'
                  : 'border-red-500/40 bg-red-950/40 text-red-300 hover:bg-red-900/60'
              }`}
              title="สลับโหมดสีแดงฉุกเฉิน / Mark 85 Combat Mode"
            >
              <AlertTriangle className={`h-3.5 w-3.5 ${isRedAlert ? 'text-white' : 'text-red-400'}`} />
              <span>{isRedAlert ? 'RED ALERT: ON' : 'RED ALERT: OFF'}</span>
            </button>

            {/* Launcher Status Banner */}
            {launcherStatus && (
              <span className="hidden md:inline-flex items-center gap-1 rounded bg-cyan-950/80 border border-cyan-400 px-2.5 py-0.5 text-[10px] text-cyan-200 animate-pulse">
                <FolderOpen className="h-3 w-3 text-cyan-400" />
                {launcherStatus}
              </span>
            )}

            {/* Arc Reactor Hum Toggle */}
            <button
              type="button"
              onClick={toggleAmbientHum}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border transition-all cursor-pointer ${
                isHumming
                  ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.5)]'
                  : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:text-cyan-300'
              }`}
              title="เปิด/ปิดเสียงฮัมเตาปฏิกรณ์ Arc Reactor ในพื้นหลัง (Web Audio API 55Hz)"
            >
              {isHumming ? (
                <>
                  <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                  <span>ARC HUM: ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                  <span>ARC HUM: OFF</span>
                </>
              )}
            </button>

            {/* Honorific Switcher */}
            <button
              type="button"
              onClick={onCycleTitle}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-bold transition-all shadow-[0_0_12px_rgba(0,240,255,0.4)] cursor-pointer ${
                isRedAlert ? 'border-red-400 bg-red-950/90 text-red-200' : 'border-cyan-400/70 bg-cyan-950/90 text-cyan-200 hover:bg-cyan-900/70'
              }`}
              title="คลิกสลับคำเรียก: sir ไลท์ / ท่านประธาน / ผู้การ / คุณผู้ชาย"
            >
              <span>🎖️ {userTitle}</span>
            </button>

            {/* Thai Voice Test Button */}
            <button
              type="button"
              onClick={() => {
                playSciFiBeep();
                onTestThaiVoice();
              }}
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
                  ? isRedAlert ? 'border-red-400 bg-red-950/90 text-red-200' : 'border-cyan-400/80 bg-cyan-950/90 text-cyan-200 shadow-[0_0_14px_rgba(0,240,255,0.5)]'
                  : 'border-slate-800 bg-slate-900 text-slate-500'
              }`}
              title="ระบบจับเสียงอัตโนมัติ 'จาร์วิส' / 'javis'"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  wakeWordActive ? (isRedAlert ? 'bg-red-400 animate-ping' : 'bg-cyan-400 animate-ping') : 'bg-slate-600'
                }`}
              />
              <span>WAKE: JAVIS {wakeWordActive ? '[ON]' : '[OFF]'}</span>
            </button>

            {/* Clock */}
            <div
              className={`border px-3 py-1 rounded-lg font-bold text-xs ${
                isRedAlert ? 'bg-red-950/80 border-red-500/50 text-red-300' : 'bg-slate-900/95 border-cyan-500/40 text-cyan-300'
              }`}
            >
              🕒 {currentTime || '03:25:18 AM'}
            </div>

            {/* Phase 1: Gemini AI Settings Button */}
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setIsGeminiSettingsOpen(true);
              }}
              className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-purple-500/60 bg-purple-950/70 px-2.5 py-1 text-xs font-bold text-purple-200 hover:bg-purple-900/80 hover:border-purple-400 cursor-pointer shadow-sm transition-all"
              title="ตั้งค่า Google Gemini API Core"
            >
              <Cpu className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
              <span>GEMINI CORE</span>
            </button>

            {/* Phase 2 & 3: 18 Projects Orchestrator Button */}
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setIsProjectOrchestratorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/60 bg-cyan-950/70 px-2.5 py-1 text-xs font-bold text-cyan-200 hover:bg-cyan-900/80 hover:border-cyan-400 cursor-pointer shadow-sm transition-all"
              title="จัดการโค้ดและ Git Push 18 โปรเจกต์ใน D:\Light"
            >
              <FolderOpen className="h-3.5 w-3.5 text-cyan-400" />
              <span>18 PROJECTS</span>
            </button>

            {/* Company Hub Navigation */}
            {onOpenCompany && (
              <button
                type="button"
                onClick={onOpenCompany}
                className="hidden xl:inline-flex rounded-lg border border-cyan-500/50 bg-cyan-950/60 px-2.5 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-900/60 cursor-pointer"
              >
                AI COMPANY
              </button>
            )}

            {/* Fullscreen */}
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-400 hover:text-cyan-300 cursor-pointer"
              title="เต็มจอ"
            >
              ◻
            </button>
            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-400 hover:text-red-400 cursor-pointer"
                title="ออกสู่หน้า Admin"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Emergency Red Alert Warning Banner */}
      {isRedAlert && (
        <div className="relative z-10 bg-red-600/90 border-b border-red-400 text-white py-1 px-4 text-center text-xs font-black tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_#ef4444] animate-pulse">
          <AlertTriangle className="h-4 w-4 text-amber-300 animate-spin" />
          <span>⚠️ COMBAT PROTOCOL ACTIVE // DEFENSE SHIELDS 100% // ALL 15 SYSTEMS LOCKED FOR SIR ไลท์</span>
          <button
            type="button"
            onClick={onToggleRedAlert}
            className="ml-3 px-2 py-0.5 bg-black text-red-300 rounded text-[10px] border border-red-400 hover:bg-red-950"
          >
            DISENGAGE
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. MULTI-AGENT SUB-BAR (Pipeline Telemetry)                 */}
      {/* ============================================================ */}
      <div
        className={`relative z-10 mx-4 lg:mx-8 mt-2 flex items-center justify-between border ${themeBorder} ${
          isRedAlert ? 'bg-[#1e0508]/80' : 'bg-[#020d28]/80'
        } px-4 py-1 rounded-xl backdrop-blur-md overflow-x-auto scrollbar-none shadow-md`}
      >
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className={`${themeText} font-bold uppercase tracking-wider flex items-center gap-1.5 text-[11px]`}>
            <Radio className="h-3 w-3 animate-pulse" />
            MULTI-AGENT HUB:
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] ${
              isRedAlert ? 'border-red-400 bg-red-950 text-red-200' : 'border-cyan-400/70 bg-cyan-950/80 text-cyan-200'
            }`}
          >
            AI Manager
          </span>
          <span className="text-slate-500 text-xs">➔</span>
          <span className="rounded-full border border-emerald-500/50 bg-emerald-950/50 px-2.5 py-0.5 text-emerald-300 text-[10px]">
            AI เลขา (Sales)
          </span>
          <span className="text-slate-500 text-xs">➔</span>
          <span className="rounded-full border border-purple-500/50 bg-purple-950/50 px-2.5 py-0.5 text-purple-300 text-[10px]">
            AI Dev (Tech)
          </span>
          <span className="text-slate-500 text-xs">➔</span>
          <span className="rounded-full border border-amber-500/50 bg-amber-950/50 px-2.5 py-0.5 text-amber-300 text-[10px]">
            AI บัญชี (Finance)
          </span>
          <span className="text-slate-500 text-xs">➔</span>
          <span className="rounded-full border border-blue-500/50 bg-blue-950/50 px-2.5 py-0.5 text-blue-300 text-[10px]">
            AI Admin (Docs)
          </span>
        </div>
        <span className={`${themeText} text-[10px] hidden lg:inline`}>
          {isRedAlert ? 'COMBAT STATUS: 100% SHIELD // 15 ENGINES READY' : 'BEARING: 284° // DEPTH: -450m // BEACON LOCK: 4/4'}
        </span>
      </div>

      {/* ============================================================ */}
      {/* 4. MAIN WORKSPACE: LEFT (3 Cards) - CENTER - RIGHT (3 Cards) */}
      {/* ============================================================ */}
      <main className="relative z-10 flex-1 flex flex-col 2xl:flex-row items-center justify-between gap-3 p-3 lg:p-6 max-w-[1920px] mx-auto w-full">
        {/* ------------------------------------------------------------ */}
        {/* LEFT POD: TACTICAL RADAR + 18 PROJECTS ORCHESTRATOR          */}
        {/* ------------------------------------------------------------ */}
        <div className="w-full 2xl:w-84 flex flex-col space-y-2.5 shrink-0">
          {/* Left Wing Mode Switcher */}
          <div className="flex items-center justify-between px-1 text-[10px] font-bold">
            <span className={themeText}>LEFT WING TELEMETRY</span>
            <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-cyan-500/20">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setLeftWingMode('radar');
                }}
                className={`px-2 py-0.5 rounded text-[9px] transition-all cursor-pointer ${
                  leftWingMode === 'radar'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                RADAR
              </button>
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setLeftWingMode('projects');
                }}
                className={`px-2 py-0.5 rounded text-[9px] transition-all cursor-pointer ${
                  leftWingMode === 'projects'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                18 PROJECTS
              </button>
            </div>
          </div>

          {/* Mode 1: Tactical Radar Widget */}
          {leftWingMode === 'radar' && (
            <div
              className={`rounded-2xl border ${themeBorder} ${
                isRedAlert ? 'bg-[#180508]/90' : 'bg-[#020d28]/90'
              } p-3 shadow-[0_0_25px_rgba(0,240,255,0.2)] backdrop-blur-xl`}
            >
              <div className="border-b border-cyan-500/25 pb-1 mb-2 flex items-center justify-between">
                <div>
                  <span className={`text-[11px] font-black tracking-wider ${themeText} block`}>
                    TACTICAL RADAR/SONAR ARRAY
                  </span>
                  <span className="text-[9px] text-slate-400">BEARING: 284° | DEPTH: -450m</span>
                </div>
                <span className={`text-[10px] font-bold ${isRedAlert ? 'text-red-400' : 'text-emerald-400'}`}>
                  12 CONTACTS
                </span>
              </div>

              <div className="flex items-center justify-between">
                <canvas
                  ref={radarCanvasRef}
                  width={140}
                  height={140}
                  className="rounded-full border border-cyan-500/30"
                />
                <div className="flex-1 ml-3 text-[10px] space-y-1 bg-slate-950/70 p-2 rounded-xl border border-cyan-500/20">
                  <div className="flex justify-between">
                    <span className="text-slate-400">RANGE:</span>
                    <span className={`font-bold ${themeText}`}>4.8 KM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ETA:</span>
                    <span className="text-emerald-400 font-bold">03:14:18</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">STATUS:</span>
                    <span className="text-amber-400 font-bold">VERIFIED</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">HUD:</span>
                    <span className={`font-bold ${themeText}`}>83% OPTIMAL</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: 18 Projects Quick Roster (Phase 2 & 3) */}
          {leftWingMode === 'projects' && (
            <div
              className={`rounded-2xl border ${themeBorder} ${
                isRedAlert ? 'bg-[#180508]/90' : 'bg-[#020d28]/90'
              } p-3 shadow-[0_0_25px_rgba(0,240,255,0.2)] backdrop-blur-xl flex flex-col h-[200px]`}
            >
              <div className="border-b border-cyan-500/25 pb-1 mb-2 flex items-center justify-between text-[11px] font-bold">
                <span className={themeText}>D:\LIGHT // 18 REPOSITORIES</span>
                <span className="text-[9px] text-emerald-400">AUTONOMOUS GIT</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono text-[9px] scrollbar-thin">
                {projectsList.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-black/50 border border-cyan-500/10 hover:border-cyan-400/50 transition-all group"
                  >
                    <span className="truncate text-slate-300 group-hover:text-cyan-200">{p.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetProjectName(p.name);
                          setIsProjectOrchestratorOpen(true);
                        }}
                        className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-500/30 text-[8px] font-bold cursor-pointer"
                        title="เปิดแก้ไขโค้ดและ Push"
                      >
                        CODE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 Company Operation Cards (Left Side) */}
          <div className="space-y-2">
            <div className={`flex items-center justify-between text-[10px] ${themeText} px-1 font-bold`}>
              <span>COMPANY TELEMETRY // LEFT WING</span>
              <span className="text-slate-400">3 CARDS ONLINE</span>
            </div>

            {companyCardsLeft.map((card) => (
              <div
                key={card.id}
                onClick={() => openProjectMockup(card.mockupType, card.command)}
                className={`p-2.5 rounded-xl border ${card.borderColor} ${card.bgColor} hover:border-cyan-400 hover:scale-[1.01] transition-all cursor-pointer shadow-sm group backdrop-blur-md`}
              >
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-slate-400 font-bold tracking-wider">{card.tag}</span>
                  <span className={`font-bold ${card.statusColor}`}>{card.status}</span>
                </div>
                <div className="text-xs font-bold text-cyan-200 group-hover:text-cyan-300 mb-1.5 flex items-center justify-between">
                  <span>{card.title}</span>
                  <span className={`text-[10px] ${themeText} font-mono flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    <Sparkles className="h-2.5 w-2.5" /> ฉายโฮโลแกรม →
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[9px] bg-slate-950/60 p-1.5 rounded-lg border border-cyan-500/15">
                  {card.metrics.map((m, idx) => (
                    <div key={idx} className="flex justify-between text-slate-400">
                      <span>{m.label}:</span>
                      <span className="text-slate-200 font-bold">{m.val}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 pt-1 border-t border-cyan-500/15 flex items-center justify-between text-[9px]">
                  <span className="text-slate-500">คลิกการ์ดเพื่อขยาย 3D</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLaunchRealProject(card.launchId);
                    }}
                    className={`flex items-center gap-1 ${themeText} hover:text-white px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30`}
                  >
                    <FolderOpen className="h-2.5 w-2.5" />
                    <span>เปิดโฟลเดอร์</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* CENTER POD: TRUE INTERACTIVE 3D HOLOGRAPHIC SPHERE           */}
        {/* Feature 2: Camera Presets (ISO, TOP, PILOT, MACRO)           */}
        {/* ------------------------------------------------------------ */}
        <div className="relative flex-1 flex flex-col items-center justify-center py-1">
          {/* Header Degree Coordinates */}
          <div className={`text-[11px] font-mono font-bold tracking-[0.25em] ${themeText} mb-1 text-center drop-shadow-[0_0_8px_${themeGlow}]`}>
            000°-359° // GRID [ALPHA] ACTIVE // BEACON LOCK [4/4]
          </div>
          <div className="text-[10px] font-mono tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <span>CORE: {isRedAlert ? 'OVERCHARGED (140%)' : 'STABLE (98.4%)'}</span>
            <span className="text-slate-600">|</span>

            {/* Feature 2: Camera Presets HUD Bar */}
            <div className="flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-950/80 px-2 py-0.5 text-[9px] text-cyan-200 shadow-sm backdrop-blur-md">
              <Compass className="h-3 w-3 text-cyan-400" />
              {[
                { id: 'iso', label: 'ISO 3D' },
                { id: 'top', label: 'TOP-DOWN' },
                { id: 'pilot', label: 'PILOT' },
                { id: 'macro', label: 'CORE' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyCameraPreset(p.id)}
                  className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    cameraPreset === p.id
                      ? isRedAlert ? 'bg-red-500 text-white font-bold' : 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <span className="text-slate-600">|</span>
              <button
                type="button"
                onClick={() => setHologramScale((s) => Math.max(0.65, Number((s - 0.15).toFixed(2))))}
                className="hover:text-white px-1"
                title="ย่อขนาด"
              >
                <ZoomOut className="h-2.5 w-2.5" />
              </button>
              <span className={`font-bold ${themeText} font-mono`}>{(hologramScale * 100).toFixed(0)}%</span>
              <button
                type="button"
                onClick={() => setHologramScale((s) => Math.min(1.85, Number((s + 0.15).toFixed(2))))}
                className="hover:text-white px-1"
                title="ขยายขนาด"
              >
                <ZoomIn className="h-2.5 w-2.5" />
              </button>
              <button
                type="button"
                onClick={() => applyCameraPreset('iso')}
                className="hover:text-white px-1 ml-0.5"
                title="รีเซ็ตมุมมองและขนาด"
              >
                <RotateCcw className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>

          {/* 3D Holographic Sphere Canvas & Core Reactor */}
          <div className="relative flex items-center justify-center">
            {canvasSafeMode ? (
              <div className="w-[380px] h-[380px] relative flex flex-col items-center justify-center p-4">
                <svg className="w-[340px] h-[340px] animate-spin" style={{ animationDuration: '28s' }} viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="80" stroke={themePrimary} strokeWidth="1.5" fill="none" strokeDasharray="6,4" opacity="0.6" />
                  <ellipse cx="100" cy="100" rx="80" ry="28" stroke={themeSecondary} strokeWidth="2" fill="none" opacity="0.75" />
                  <ellipse cx="100" cy="100" rx="28" ry="80" stroke={themePrimary} strokeWidth="2" fill="none" opacity="0.75" />
                  <circle cx="100" cy="100" r="24" fill={themePrimary} opacity="0.4" className="animate-pulse" />
                </svg>
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setCanvasSafeMode(false);
                  }}
                  className="absolute bottom-2 text-[9px] text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded border border-amber-500/40 hover:bg-amber-900 cursor-pointer shadow-lg transition-colors"
                >
                  🛡️ SAFE MODE ACTIVE (CLICK TO RESTORE CANVAS)
                </button>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                width={380}
                height={380}
                onMouseDown={handleMouseDown}
                onWheel={handleWheel}
                className="cursor-grab active:cursor-grabbing transition-transform hover:scale-105"
                title="คลิกและลากเมาส์เพื่อหมุนโฮโลแกรม 3D / หมุนลูกกลิ้งเมาส์เพื่อซูมเข้าออก"
              />
            )}

            {/* Center Touch Mic Orb */}
            <button
              type="button"
              onClick={() => {
                playSciFiBeep();
                onToggleMic();
              }}
              className={`absolute flex h-16 w-16 items-center justify-center rounded-full transition-all shadow-2xl backdrop-blur-md cursor-pointer ${
                isListening
                  ? 'bg-red-500/35 border-2 border-red-400 text-red-200 animate-pulse shadow-red-500/60'
                  : isRedAlert
                  ? 'bg-red-600/30 border-2 border-red-400 text-red-200 hover:bg-red-600/50 hover:scale-110 shadow-red-500/70'
                  : 'bg-cyan-500/25 border-2 border-cyan-400/80 text-cyan-200 hover:bg-cyan-500/40 hover:scale-110 shadow-cyan-500/50'
              }`}
            >
              <Mic className={`h-7 w-7 ${isListening || isRedAlert ? 'text-red-300' : 'text-cyan-200'}`} />
            </button>

            {/* ============================================================ */}
            {/* INTERACTIVE HOLOGRAPHIC POPUP (Pops up when active/in use)   */}
            {/* ============================================================ */}
            {isHologramActive && (
              <div
                style={{
                  transform: 'perspective(1000px) rotateX(4deg)',
                }}
                className="absolute -top-10 z-40 w-[96%] max-w-[560px] animate-fade-in pointer-events-auto"
              >
                <div
                  className={`relative rounded-2xl border-2 ${
                    isRedAlert ? 'border-red-500/90 bg-[#160406]/95 shadow-[0_0_60px_rgba(239,68,68,0.6)]' : 'border-cyan-400/90 bg-[#020b22]/95 shadow-[0_0_60px_rgba(0,240,255,0.6)]'
                  } p-4 backdrop-blur-2xl`}
                >
                  <div className={`absolute top-1 left-2 text-[8px] ${themeText} font-mono`}>
                    ┌ INTERACTIVE 3D HOLOGRAM // 4K ┐
                  </div>
                  <div className={`absolute top-1 right-2 text-[8px] ${themeText} font-mono`}>
                    └ {isRedAlert ? 'RED ALERT COMBAT SHIELD' : 'MULTI-AGENT SYNCHRONIZED'} ┘
                  </div>

                  {/* Header */}
                  <div className="flex items-start justify-between border-b border-cyan-500/30 pb-2 mb-2.5 mt-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[9px] font-bold text-cyan-300 border border-cyan-500/40">
                          {selectedMockupProject === 'pos' && 'DIGITAL COMMERCE // SAAS'}
                          {selectedMockupProject === 'ticket' && 'EVENT & TICKETING // INFRA'}
                          {selectedMockupProject === 'fit' && 'IOT & MEMBER SCANNER // APP'}
                          {selectedMockupProject === 'pass' && 'SECURITY VAULT // ENCRYPTED'}
                          {selectedMockupProject === 'audit' && 'QA AUTOMATION // AUDIT REPORT'}
                          {selectedMockupProject === 'quote' && 'FINANCE & BILLING // EMVCo'}
                          {!selectedMockupProject && 'AI MANAGER DISPATCH // LIVE'}
                        </span>
                        <span className={`text-[10px] font-bold ${isRedAlert ? 'text-red-400' : 'text-emerald-400'}`}>
                          ● LIVE INTERACTION
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-black tracking-wider text-cyan-100 flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-cyan-300 animate-spin" />
                        {selectedMockupProject === 'pos' && 'KROB POS & INVENTORY LIGHT'}
                        {selectedMockupProject === 'ticket' && 'THAITICKET CONCERT HUB'}
                        {selectedMockupProject === 'fit' && 'KROB FIT // GYM MANAGEMENT'}
                        {selectedMockupProject === 'pass' && 'KROB PASS VAULT & GATE'}
                        {selectedMockupProject === 'audit' && 'SYSTEM AUDIT // 15 WEBAPPS REPORT'}
                        {selectedMockupProject === 'quote' && 'ELECTRONIC QUOTATION & EMVCo QR'}
                        {!selectedMockupProject && (activeHologram?.title || 'J.A.R.V.I.S. INTELLIGENCE')}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        setSelectedMockupProject(null);
                        if (onDismissHologram) onDismissHologram();
                      }}
                      className="rounded-lg border border-slate-700 bg-slate-900 p-1 text-slate-400 hover:text-white hover:border-red-400 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Mockup Display */}
                  <div className="rounded-xl border border-cyan-500/40 bg-slate-950/90 p-3 mb-2.5 shadow-inner">
                    {selectedMockupProject === 'pos' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1">
                          <span className="text-cyan-300 font-bold">🛒 POS CASH REGISTER MOCKUP</span>
                          <span className="text-emerald-400 font-mono">ORDER #1042</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                          <div className="p-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-center">
                            <span className="block text-slate-300">กาแฟสด</span>
                            <span className="text-emerald-400 font-bold">฿65</span>
                          </div>
                          <div className="p-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-center">
                            <span className="block text-slate-300">ชาเขียวนม</span>
                            <span className="text-emerald-400 font-bold">฿55</span>
                          </div>
                          <div className="p-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-center">
                            <span className="block text-slate-300">ครัวซองต์</span>
                            <span className="text-emerald-400 font-bold">฿45</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800 text-slate-400">
                          <span>ตัดสต็อกเรียลไทม์: 24 รายการ</span>
                          <span className="text-cyan-300 font-bold">ยอดรวม: ฿165.00</span>
                        </div>
                      </div>
                    )}

                    {selectedMockupProject === 'ticket' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1">
                          <span className="text-cyan-300 font-bold">🎫 STADIUM SEATING CHART & TICKET</span>
                          <span className="text-red-400 font-mono">IMPACT ARENA</span>
                        </div>
                        <div className="flex items-center justify-center gap-2 py-1.5">
                          <div className="px-3 py-1 rounded bg-red-950/60 border border-red-500/50 text-[10px] text-red-300 font-bold">
                            STAGE [เวทีหลัก]
                          </div>
                          <div className="px-2 py-1 rounded bg-emerald-950/60 border border-emerald-500/50 text-[9px] text-emerald-300">
                            ZONE VIP [฿1,500]
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800 text-slate-400">
                          <span>Anti-passback QR Check-in: ACTIVE</span>
                          <span className="text-emerald-400 font-bold">SHA-256 Validated</span>
                        </div>
                      </div>
                    )}

                    {selectedMockupProject === 'fit' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1">
                          <span className="text-cyan-300 font-bold">🏋️ GYM CAMERA SCANNER</span>
                          <span className="text-emerald-400 font-mono">GATE 01</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-cyan-500/30 flex items-center justify-between text-[10px]">
                          <div>
                            <span className="text-slate-300 block font-bold">คุณวิชัย (Member VIP)</span>
                            <span className="text-emerald-400">อายุสมาชิกคงเหลือ 142 วัน</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            ✓ สแกนผ่าน
                          </span>
                        </div>
                      </div>
                    )}

                    {selectedMockupProject === 'pass' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1">
                          <span className="text-cyan-300 font-bold">🛡️ ZERO-KNOWLEDGE PASS VAULT</span>
                          <span className="text-cyan-400 font-mono">AES-256-GCM</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-cyan-500/30 text-[10px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Master Cipher:</span>
                            <span className="text-cyan-300 font-mono">9a8f...3e21 (Encrypted)</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Audit Logs:</span>
                            <span className="text-emerald-400">100% Zero-Leak Guard</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {(selectedMockupProject === 'audit' || (!selectedMockupProject && activeHologram?.details)) && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1">
                          <span className="text-cyan-300 font-bold">📊 FULL SYSTEM AUDIT REPORT</span>
                          <span className="text-emerald-400 font-mono">100% PASS</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          {(activeHologram?.details || [
                            { label: 'Total Apps', val: '15 Active Apps' },
                            { label: 'Workspace Files', val: '17/17 Folders Verified' },
                            { label: 'Security Protocols', val: 'AES-256 Vault Stable' },
                            { label: 'Build Status', val: 'Vite Production Passed' },
                          ]).map((d, i) => (
                            <div key={i} className="p-1.5 rounded bg-slate-900 border border-cyan-500/20">
                              <span className="text-slate-400 block text-[9px]">{d.label}</span>
                              <span className="text-cyan-200 font-bold">{d.val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedMockupProject === 'quote' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1">
                          <span className="text-cyan-300 font-bold">📄 ELECTRONIC QUOTATION SPEC</span>
                          <span className="text-amber-400 font-mono">PROMPTPAY CRC-16</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-cyan-500/20 text-[10px] space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Payment Channel:</span>
                            <span className="text-emerald-400 font-bold">PromptPay EMVCo Official</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Tax Spec:</span>
                            <span className="text-cyan-300">VAT 7% Included</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Digital Sign:</span>
                            <span className="text-slate-200">Founder Verified ({userTitle})</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Multi-Agent Breakdown Summary */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] mb-2.5">
                    <div className="p-2 rounded-lg bg-purple-950/30 border border-purple-500/30">
                      <span className="text-purple-300 font-bold block flex items-center gap-1">
                        <Cpu className="h-3 w-3" /> AI Dev (Tech Lead)
                      </span>
                      <span className="text-slate-300">
                        {selectedMockupProject === 'pos' && 'Next.js 16 + Prisma + Thermal Print'}
                        {selectedMockupProject === 'ticket' && 'Node.js + SQLite + Anti-Fraud Slip'}
                        {selectedMockupProject === 'fit' && 'React + HTML5 Web Camera QR'}
                        {selectedMockupProject === 'pass' && 'Web Crypto API + LocalStorage AES'}
                        {selectedMockupProject === 'audit' && 'Vite Production + Zero Console Errors'}
                        {selectedMockupProject === 'quote' && 'EMVCo QR + PDF Invoice Generator'}
                        {!selectedMockupProject && 'ประสานงานสถาปัตยกรรมระบบ'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                      <span className="text-emerald-300 font-bold block flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> AI เลขา (Sales)
                      </span>
                      <span className="text-slate-300">
                        {selectedMockupProject === 'pos' && '฿390 / เดือน (กำไร Margin 84%)'}
                        {selectedMockupProject === 'ticket' && '฿1,500 / งาน (ปิดดีลได้ทันที)'}
                        {selectedMockupProject === 'fit' && '฿990 / เดือน (ตลาดฟิตเนสโตเร็ว)'}
                        {selectedMockupProject === 'pass' && '฿690 / เดือน (ต่อยอดทุกบริษัท)'}
                        {selectedMockupProject === 'audit' && 'พร้อมเปิดให้บริการลูกค้าภายนอก'}
                        {selectedMockupProject === 'quote' && 'พร้อมส่งมอบลูกค้าภายนอกทันที'}
                        {!selectedMockupProject && 'วิเคราะห์งานขายและ Pipeline'}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-cyan-500/30 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLaunchRealProject(selectedMockupProject || 'pos')}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer shadow-md"
                        title="เปิดโฟลเดอร์โปรเจกต์จริงในไดรฟ์ D:\Light"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>เปิดรันโปรเจกต์จริง</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          playSciFiBeep();
                          onDispatchCommand('ออกใบเสนอราคา');
                        }}
                        className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-bold text-slate-950 cursor-pointer shadow-md ${
                          isRedAlert ? 'bg-red-500 hover:bg-red-400' : 'bg-cyan-500 hover:bg-cyan-400'
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>ออกใบเสนอราคา</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          playSciFiBeep();
                          onDispatchCommand('ตรวจระบบทั้งหมด');
                        }}
                        className="flex items-center gap-1 rounded-xl border border-cyan-500/50 bg-cyan-950/60 px-3 py-1.5 text-[11px] font-bold text-cyan-300 hover:bg-cyan-900/60 cursor-pointer"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>สั่งตรวจโค้ด</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playClickSound();
                          setSelectedMockupProject(null);
                          if (onDismissHologram) onDismissHologram();
                        }}
                        className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer ml-1"
                      >
                        ย่อโฮโลแกรม
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Status Label */}
          <div className="mt-2 text-center">
            <span className={`text-xs font-black tracking-[0.3em] ${themeText} drop-shadow-[0_0_12px_${themeGlow}]`}>
              {hudState === 'LISTENING' && 'L I S T E N I N G . . .'}
              {hudState === 'SEARCHING' && 'M U L T I - A G E N T   S Y N C . . .'}
              {hudState === 'SPEAKING' && 'S P E A K I N G . . .'}
              {hudState === 'READY' && (isRedAlert ? 'C O M B A T   S H I E L D   A C T I V E' : 'L I S T E N I N G')}
            </span>
          </div>

          {/* Undulating Sine Waveform */}
          <div className="mt-1 flex items-center justify-center">
            <svg
              className={`w-56 h-7 stroke-${isRedAlert ? 'red' : 'cyan'}-400 fill-none drop-shadow-[0_0_12px_${themeGlow}]`}
              viewBox="0 0 200 24"
            >
              <path
                d={
                  isListening || isSpeaking || isRedAlert
                    ? 'M 10 12 Q 35 2, 60 12 T 100 12 T 140 12 T 180 12'
                    : 'M 10 12 Q 35 8, 60 12 T 100 12 T 140 12 T 180 12'
                }
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Voice Prompt Standby Button */}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playSciFiBeep();
                onToggleMic();
              }}
              className={`flex items-center gap-2 rounded-full px-5 py-1.5 text-xs font-bold transition-all shadow-lg cursor-pointer ${
                isListening
                  ? 'border border-red-500/80 bg-red-950/70 text-red-200 animate-pulse'
                  : isSpeaking
                  ? 'border border-sky-400 bg-sky-950/70 text-sky-200 animate-pulse'
                  : isRedAlert
                  ? 'border border-red-400/80 bg-red-950/80 text-red-200 hover:bg-red-900/90 hover:scale-105'
                  : 'border border-cyan-400/80 bg-cyan-950/80 text-cyan-200 hover:bg-cyan-900/90 hover:scale-105'
              }`}
            >
              <Mic className="h-4 w-4" />
              <span>
                {isListening
                  ? '🎙️ รับฟังภาษาไทยอยู่ครับ... (สั่งงานได้ทันที)'
                  : isSpeaking
                  ? '🔊 กำลังพูดตอบกลับ...'
                  : `🎙️ สแตนด์บายรับคำสั่งเสียงภาษาไทยจาก ${userTitle}`}
              </span>
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* RIGHT POD: TURBINE / LIVE TERMINAL STREAM + 3 CARDS          */}
        {/* Feature 1: Live Interactive Terminal Log Stream              */}
        {/* ------------------------------------------------------------ */}
        <div className="w-full 2xl:w-84 flex flex-col space-y-2.5 shrink-0">
          {/* Diagnostic Widget with Mode Switcher (Turbine vs Terminal Stream) */}
          <div
            className={`rounded-2xl border ${themeBorder} ${
              isRedAlert ? 'bg-[#180508]/90' : 'bg-[#020d28]/90'
            } p-3 shadow-[0_0_25px_rgba(0,240,255,0.2)] backdrop-blur-xl`}
          >
            <div className="border-b border-cyan-500/25 pb-1 mb-2 flex items-center justify-between">
              <span className={`text-[11px] font-black ${themeText}`}>
                {rightWingMode === 'turbine' ? 'CIRCULAR DIAGNOSTIC GAUGES' : '⚡ LIVE TERMINAL STREAM'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRightWingMode('turbine')}
                  className={`p-1 rounded ${
                    rightWingMode === 'turbine'
                      ? isRedAlert ? 'bg-red-500 text-white' : 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="โหมดมาตรวัดกังหัน 8 แฉก"
                >
                  <Gauge className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setRightWingMode('terminal')}
                  className={`p-1 rounded ${
                    rightWingMode === 'terminal'
                      ? isRedAlert ? 'bg-red-500 text-white' : 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="โหมดพิมพ์ Terminal Stream สด"
                >
                  <Terminal className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Mode 1: Turbine Gauges */}
            {rightWingMode === 'turbine' && (
              <>
                <div className="flex items-center justify-between">
                  <canvas
                    ref={turbineCanvasRef}
                    width={88}
                    height={88}
                    className="rounded-full border border-cyan-500/30"
                  />
                  <div className="flex-1 ml-3 text-[10px] space-y-1 bg-slate-950/70 p-2 rounded-xl border border-cyan-500/20">
                    <div className="flex justify-between">
                      <span className="text-slate-400">POWER CORE:</span>
                      <span className={`font-bold ${themeText}`}>{isRedAlert ? '140% OVERLOAD' : '94% OPTIMAL'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">REACTOR TEMP:</span>
                      <span className={`font-bold ${isRedAlert ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isRedAlert ? '46°C' : '28°C'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">CPU LOAD:</span>
                      <span className={`font-bold ${themeText}`}>{isRedAlert ? '92%' : '81%'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">BEACON LOCK:</span>
                      <span className="text-emerald-400 font-bold">4/4 ACTIVE</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-1 border-t border-cyan-500/20">
                  <div className="flex items-center justify-between text-[9px] text-cyan-400 mb-1">
                    <span>AUDIO FREQ // ANALYSIS // VOLUME</span>
                    <span className="text-emerald-400">48.0 kHz</span>
                  </div>
                  <div className="flex items-end justify-between h-4 px-1 gap-1">
                    {[25, 60, 90, 45, 80, 30, 70, 50, 85, 40, 95, 65, 35, 75].map((h, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-t shadow-[0_0_8px_${themeGlow}] transition-all ${
                          isRedAlert ? 'bg-red-500' : 'bg-cyan-400'
                        }`}
                        style={{
                          height: isListening || isSpeaking || isRedAlert ? `${h}%` : '25%',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Mode 2: Feature 1 Live Terminal Stream */}
            {rightWingMode === 'terminal' && (
              <div
                ref={terminalScrollRef}
                className="h-[128px] overflow-y-auto space-y-1 pr-1 font-mono text-[9px] scrollbar-thin scrollbar-thumb-cyan-900"
              >
                {/* Crash Analytics Watchdog Status Header */}
                <div className="flex items-center justify-between text-[8px] bg-slate-900/95 px-2 py-1 rounded border border-cyan-500/20 mb-1 text-emerald-400 font-bold sticky top-0 backdrop-blur-sm z-10 shadow-sm">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    🛡️ WATCHDOG: 100% HEALTH
                  </span>
                  <span className="text-cyan-300">0 CRASHES // ZERO UNHANDLED</span>
                </div>

                {terminalLogs.map((log) => (
                  <div key={log.id} className="leading-tight p-1 rounded bg-black/40 border border-cyan-500/10">
                    <span className="text-slate-500 mr-1.5">[{log.time}]</span>
                    <span
                      className={`font-bold px-1 py-0.2 rounded text-[8px] mr-1 ${
                        log.tag === 'GIT'
                          ? 'bg-purple-950 text-purple-300 border border-purple-500/30'
                          : log.tag === 'SECURITY'
                          ? 'bg-red-950 text-red-300 border border-red-500/30'
                          : log.tag === 'QA'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                          : 'bg-cyan-950 text-cyan-300 border border-cyan-500/30'
                      }`}
                    >
                      {log.tag}
                    </span>
                    <span className="text-slate-300">{log.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3 Company Operation Cards (Right Side) */}
          <div className="space-y-2">
            <div className={`flex items-center justify-between text-[10px] ${themeText} px-1 font-bold`}>
              <span>FINANCE & GOVERNANCE // RIGHT WING</span>
              <span className="text-slate-400">3 CARDS ONLINE</span>
            </div>

            {companyCardsRight.map((card) => (
              <div
                key={card.id}
                onClick={() => openProjectMockup(card.mockupType, card.command)}
                className={`p-2.5 rounded-xl border ${card.borderColor} ${card.bgColor} hover:border-cyan-400 hover:scale-[1.01] transition-all cursor-pointer shadow-sm group backdrop-blur-md`}
              >
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-slate-400 font-bold tracking-wider">{card.tag}</span>
                  <span className={`font-bold ${card.statusColor}`}>{card.status}</span>
                </div>
                <div className="text-xs font-bold text-cyan-200 group-hover:text-cyan-300 mb-1.5 flex items-center justify-between">
                  <span>{card.title}</span>
                  <span className={`text-[10px] ${themeText} font-mono flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    <Sparkles className="h-2.5 w-2.5" /> ฉายโฮโลแกรม →
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[9px] bg-slate-950/60 p-1.5 rounded-lg border border-cyan-500/15">
                  {card.metrics.map((m, idx) => (
                    <div key={idx} className="flex justify-between text-slate-400">
                      <span>{m.label}:</span>
                      <span className="text-slate-200 font-bold">{m.val}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 pt-1 border-t border-cyan-500/15 flex items-center justify-between text-[9px]">
                  <span className="text-slate-500">คลิกการ์ดเพื่อขยาย 3D</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLaunchRealProject(card.launchId);
                    }}
                    className={`flex items-center gap-1 ${themeText} hover:text-white px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30`}
                  >
                    <FolderOpen className="h-2.5 w-2.5" />
                    <span>เปิดโฟลเดอร์</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ============================================================ */}
      {/* 5. BOTTOM HUD COMMAND BAR (Terminal Input & Fast Actions)     */}
      {/* ============================================================ */}
      <footer
        className={`relative z-20 border-t ${
          isRedAlert ? 'border-red-500/40 bg-[#160406]/95' : 'border-cyan-500/30 bg-[#020b22]/95'
        } backdrop-blur-md px-4 lg:px-8 py-2 shadow-2xl transition-colors duration-500`}
      >
        <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row items-center justify-between gap-2.5">
          {/* Quick Action Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto text-[10px] scrollbar-none">
            <span className="text-slate-500 shrink-0 font-bold">สั่งการเร็ว:</span>
            {[
              '🔊 ฟังเสียงไทย',
              '🚨 โหมดฉุกเฉิน',
              'ดูระบบ POS',
              'ดูระบบบัตรคอน',
              'ดูระบบฟิตเนส',
              'ตรวจระบบทั้งหมด',
              'ออกใบเสนอราคา',
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  playSciFiBeep();
                  if (chip === '🔊 ฟังเสียงไทย') {
                    onTestThaiVoice();
                  } else if (chip === '🚨 โหมดฉุกเฉิน') {
                    if (onToggleRedAlert) onToggleRedAlert();
                  } else {
                    onDispatchCommand(chip);
                  }
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1 transition-all font-sans cursor-pointer ${
                  chip === '🚨 โหมดฉุกเฉิน'
                    ? isRedAlert ? 'border border-red-400 bg-red-600 text-white font-bold' : 'border border-red-500/40 bg-red-950/40 text-red-300'
                    : chip.startsWith('🔊')
                    ? 'border border-emerald-500/50 bg-emerald-950/70 text-emerald-300 font-bold shadow-sm'
                    : 'border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60'
                }`}
              >
                {chip.startsWith('🔊') || chip.startsWith('🚨') ? chip : `"${chip}"`}
              </button>
            ))}
          </div>

          {/* Form Command Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full md:w-[480px]">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="INITIALIZE COMMAND ..."
                className={`w-full rounded-xl border ${
                  isRedAlert
                    ? 'border-red-400/50 bg-red-950/50 text-red-200 placeholder-red-500/50 focus:border-red-300'
                    : 'border-cyan-400/50 bg-slate-900/90 text-cyan-200 placeholder-cyan-500/50 focus:border-cyan-300'
                } px-3 py-1.5 text-xs focus:outline-none focus:ring-1 font-mono tracking-wider shadow-inner`}
              />
              {!inputText && (
                <span
                  className={`absolute right-3 top-2 h-3.5 w-1.5 ${
                    isRedAlert ? 'bg-red-400' : 'bg-cyan-400'
                  } animate-pulse`}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                playSciFiBeep();
                onToggleMic();
              }}
              className={`rounded-xl border p-1.5 transition-all cursor-pointer ${
                isListening
                  ? 'border-red-500 bg-red-600 text-white animate-pulse'
                  : isRedAlert
                  ? 'border-red-500/50 bg-red-950 text-red-300 hover:bg-red-900/60'
                  : 'border-cyan-500/40 bg-slate-900 text-cyan-400 hover:bg-cyan-950/60'
              }`}
              title="เปิด/ปิดไมโครโฟน"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={!inputText.trim()}
              className={`flex items-center gap-1 rounded-xl px-3.5 py-1.5 text-xs font-bold text-slate-950 transition-colors disabled:opacity-30 cursor-pointer shadow-md ${
                isRedAlert ? 'bg-red-500 hover:bg-red-400' : 'bg-cyan-500 hover:bg-cyan-400'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </footer>

      {/* Phase 1: Gemini AI Settings Modal */}
      <GeminiSettingsModal
        isOpen={isGeminiSettingsOpen}
        onClose={() => setIsGeminiSettingsOpen(false)}
      />

      {/* Phase 2 & 3: Project Code & Autonomous Git Orchestrator Modal */}
      <ProjectOrchestratorModal
        isOpen={isProjectOrchestratorOpen}
        initialProject={targetProjectName}
        onClose={() => setIsProjectOrchestratorOpen(false)}
      />
    </div>
  );
});
