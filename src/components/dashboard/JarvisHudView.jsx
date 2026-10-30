import { useState, useEffect, useRef, useCallback } from 'react';
import { playClickSound, playSuccessSound } from '../../utils/soundEffects';
import { processJarvisCommand, USER_TITLE, setUserTitle } from '../../utils/jarvisBrain';
import { StarkWorkshopView } from './hud/StarkWorkshopView';

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

  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const lastDispatchedRef = useRef({ text: '', time: 0 });

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
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <StarkWorkshopView
      userTitle={userTitle}
      onCycleTitle={handleCycleTitle}
      wakeWordActive={wakeWordActive}
      onToggleWakeWord={handleToggleWakeWord}
      onTestThaiVoice={handleTestThaiVoice}
      currentTime={currentTime}
      onToggleFullscreen={toggleFullscreen}
      onOpenAdmin={onOpenAdmin}
      onOpenCompany={onOpenCompany}
      messages={messages}
      onDispatchCommand={handleDispatchCommand}
      isListening={isListening}
      isSpeaking={isSpeaking}
      hudState={hudState}
      onToggleMic={toggleMic}
      activeSquadId={activeSquadId}
      activeHologram={activeHologram}
      onDismissHologram={() => setActiveHologram(null)}
    />
  );
}
