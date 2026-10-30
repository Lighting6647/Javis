import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { playClickSound, playSuccessSound } from '../../utils/soundEffects';
import { processJarvisCommand, USER_TITLE, setUserTitle } from '../../utils/jarvisBrain';
import { CockpitCanopyFrame } from './hud/CockpitCanopyFrame';
import { TacticalRadarWidget } from './hud/TacticalRadarWidget';
import { CenterTargetingReactor } from './hud/CenterTargetingReactor';
import { TurbineDiagnosticWidget } from './hud/TurbineDiagnosticWidget';
import { CockpitChatTerminal } from './hud/CockpitChatTerminal';

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
      text: `สวัสดีครับ ${USER_TITLE} มีอะไรให้ผม ช่วยจัดการ หรือค้นหา ข้อมูลไหมครับ?`,
    },
  ]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled] = useState(true);
  const [hudState, setHudState] = useState('READY'); // 'READY' | 'LISTENING' | 'SEARCHING' | 'SPEAKING'
  const [currentTime, setCurrentTime] = useState('');
  const [activeHologram, setActiveHologram] = useState(null);
  const [activeSquadId, setActiveSquadId] = useState(null);
  const [wakeWordActive, setWakeWordActive] = useState(true); // Always-on Hands-free "javis" / "จาร์วิส"
  const [dragStartX, setDragStartX] = useState(null);
  const [_isFullscreen, setIsFullscreen] = useState(false);

  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const lastDispatchedRef = useRef({ text: '', time: 0 });
  const containerRef = useRef(null);

  // Live Clock Telemetry
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
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Triple-Layered Pure Thai Speech Synthesis (Zero English Voice Guarantee)
  const speakThai = useCallback(
    (text) => {
      if (!voiceEnabled || !text || !text.trim()) return;

      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      } catch {}

      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.currentTime = 0;
        } catch {}
      }

      setIsSpeaking(true);
      setHudState('SPEAKING');

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

      const cleanSpeech = text
        .replace(/[*#•_`~[\]\\/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const encoded = encodeURIComponent(cleanSpeech.slice(0, 200));

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
              handleSpeechDone();
            }
          } catch {
            handleSpeechDone();
          }
        } else {
          handleSpeechDone();
        }
      };

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

  // Core Command Dispatcher & Multi-Agent Coordinator
  const handleDispatchCommand = useCallback(
    (text) => {
      const clean = (text || '').trim();
      if (!clean || clean.length < 2) return;

      const now = Date.now();
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

      const userMsg = {
        id: Date.now(),
        sender: userTitle.toUpperCase(),
        time: nowTime,
        text: clean,
      };

      setMessages((prev) => [...prev, userMsg]);
      setHudState('SEARCHING');

      setTimeout(() => {
        const result = processJarvisCommand(clean);

        if (result.action === 'SET_TITLE' && result.title) {
          setUserTitle(result.title);
          setUserTitleState(result.title);
        }

        const jarvisMsg = {
          id: Date.now() + 1,
          sender: 'JARVIS (AI MANAGER)',
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

        setActiveSquadId(result.squadId || 'ops');
        setTimeout(() => setActiveSquadId(null), 4500);

        if (result.hologram) {
          setActiveHologram(result.hologram);
        }

        if (result.action === 'RUN_AUDIT' && onRunAudit) {
          onRunAudit();
        } else if (result.action === 'OPEN_QUOTATION' && onOpenQuotation) {
          onOpenQuotation();
        } else if (result.action === 'CHANGE_THEME' && onSelectBrandTheme) {
          onSelectBrandTheme(result.brandId);
        }

        if (result.speech) {
          speakThai(result.speech);
        } else {
          setHudState('READY');
        }
      }, 450);
    },
    [onRunAudit, onOpenQuotation, onSelectBrandTheme, speakThai, userTitle]
  );

  // Web Speech Recognition (Always-on Hands-free Wake Word: "javis" / "จาร์วิส")
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
        if (!transcript) return;

        const lower = transcript.toLowerCase();

        // Strict Wake Word Filter
        if (wakeWordActive) {
          const isWakeWord =
            lower.includes('javis') ||
            lower.includes('jarvis') ||
            lower.includes('จาร์วิส') ||
            lower.includes('จาวิส') ||
            lower.includes('จาวิซ') ||
            lower.includes('จาวิด') ||
            lower.includes('จาวิษ');

          if (!isWakeWord) return;

          const cleanedCommand = lower
            .replace(/^(เฮ้|ไฮ|สวัสดี|โอเค)?\s*(javis|jarvis|จาร์วิส|จาวิส|จาวิซ|จาวิด|จาวิษ)\s*/i, '')
            .trim();

          if (cleanedCommand.length > 0) {
            handleDispatchCommand(cleanedCommand);
          } else {
            speakThai(`ครับ ${userTitle} ผมจาร์วิส กำลังรับฟังคำสั่งอยู่ครับ`);
          }
        } else {
          handleDispatchCommand(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (wakeWordActive && !isSpeaking) {
          setTimeout(() => {
            try {
              if (wakeWordActive && !isSpeaking && recognitionRef.current) {
                recognitionRef.current.start();
                setIsListening(true);
                setHudState('LISTENING');
              }
            } catch {}
          }, 1200);
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch {}

      return () => {
        try {
          recognition.abort();
        } catch {}
      };
    }
  }, [handleDispatchCommand, isSpeaking, speakThai, userTitle, wakeWordActive]);

  const toggleMic = useCallback(() => {
    playClickSound();
    if (isListening) {
      try {
        recognitionRef.current?.stop();
        setIsListening(false);
        setHudState('READY');
      } catch {}
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          setHudState('LISTENING');
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
      }
    }
  }, [isListening]);

  const handleCycleTitle = () => {
    playClickSound();
    const titles = ['sir ไลท์', 'ท่านประธาน', 'ผู้การ', 'คุณผู้ชาย'];
    const currentIndex = titles.indexOf(userTitle);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % titles.length;
    const nextTitle = titles[nextIndex];
    setUserTitle(nextTitle);
    setUserTitleState(nextTitle);
    speakThai(`รับทราบครับ ${nextTitle} ต่อจากนี้ผมจะเรียกท่านว่า ${nextTitle} ครับ`);
    if (onShowToast) {
      onShowToast('info', 'เปลี่ยนคำเรียก', `J.A.R.V.I.S. จะเรียกท่านว่า "${nextTitle}"`);
    }
  };

  const handleTestThaiVoice = () => {
    playClickSound();
    speakThai(`สวัสดีครับ ${userTitle} ผม จาร์วิส มาร์คทรี เสียงภาษาไทยพร้อมใช้งานแล้วครับ`);
    if (onShowToast) {
      onShowToast('info', 'ทดสอบเสียงภาษาไทย', 'กำลังเล่นเสียงสังเคราะห์ภาษาไทยออกลำโพงครับ');
    }
  };

  const handleToggleWakeWord = () => {
    playClickSound();
    setWakeWordActive((w) => !w);
  };

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
    <CockpitCanopyFrame
      userTitle={userTitle}
      onCycleTitle={handleCycleTitle}
      wakeWordActive={wakeWordActive}
      onToggleWakeWord={handleToggleWakeWord}
      onTestThaiVoice={handleTestThaiVoice}
      currentTime={currentTime}
      onToggleFullscreen={toggleFullscreen}
      onOpenAdmin={onOpenAdmin}
      onOpenCompany={onOpenCompany}
    >
      {/* ============================================================ */}
      {/* MULTI-AGENT HUB STATUS BAR (5 Specialized Agents)           */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between border border-cyan-500/20 bg-slate-950/70 px-4 py-1.5 rounded-xl mb-4 text-[10px] backdrop-blur-md overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            MULTI-AGENT HUB:
          </span>
          {[
            { id: 'manager', label: 'AI Manager (Direct)', color: 'border-cyan-400/60 bg-cyan-950/70 text-cyan-200' },
            { id: 'sales', label: 'AI เลขา (Sales)', color: 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300' },
            { id: 'dev', label: 'AI Dev (Tech Lead)', color: 'border-purple-500/50 bg-purple-950/50 text-purple-300' },
            { id: 'accounting', label: 'AI บัญชี (Finance)', color: 'border-amber-500/50 bg-amber-950/50 text-amber-300' },
            { id: 'admin', label: 'AI Admin (Docs)', color: 'border-blue-500/50 bg-blue-950/50 text-blue-300' },
          ].map((agent) => (
            <div
              key={agent.id}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 border text-[10px] font-sans ${agent.color}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <span>{agent.label}</span>
            </div>
          ))}
        </div>
        <div className="hidden lg:flex items-center gap-2 text-slate-400 text-[10px]">
          <span className="text-cyan-400/80 font-mono">🎯 Webapp Sales & Dev Orchestrator</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MAIN 3-POD COCKPIT LAYOUT (Matching Reference Image)        */}
      {/* ============================================================ */}
      <div className="flex flex-col 2xl:flex-row items-center justify-between gap-4 lg:gap-6 w-full max-w-[1880px] mx-auto">
        {/* Left Wing: Tactical Sonar / Radar Sweep & Holo Globe */}
        <TacticalRadarWidget onDispatchCommand={handleDispatchCommand} />

        {/* Center: Massive Arc Reactor Targeting Crosshair Reticle */}
        <CenterTargetingReactor
          hudState={hudState}
          isListening={isListening}
          isSpeaking={isSpeaking}
          onToggleMic={toggleMic}
          activeSquadId={activeSquadId}
          wakeWordActive={wakeWordActive}
        />

        {/* Right Wing: Turbine Reactor Engine & System Diagnostics + Chat Terminal */}
        <div className="flex flex-col space-y-4 w-72 xl:w-80 shrink-0">
          <TurbineDiagnosticWidget />
          <CockpitChatTerminal
            messages={messages}
            userTitle={userTitle}
            onDispatchCommand={handleDispatchCommand}
            onToggleMic={toggleMic}
            isListening={isListening}
            onTestThaiVoice={handleTestThaiVoice}
          />
        </div>
      </div>

      {/* Holographic Projection Modal */}
      {activeHologram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in select-none cursor-grab"
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
          <div className="w-full max-w-lg rounded-2xl border-2 border-cyan-400/60 bg-slate-950/95 p-5 shadow-[0_0_50px_rgba(6,182,212,0.4)] backdrop-blur-xl">
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

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
              <span className="text-emerald-400 font-bold">{activeHologram.badge}</span>
              <button
                type="button"
                onClick={() => setActiveHologram(null)}
                className="text-slate-400 hover:text-white underline cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}
    </CockpitCanopyFrame>
  );
}
