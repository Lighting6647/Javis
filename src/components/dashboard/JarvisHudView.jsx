import { useState, useEffect, useRef, useCallback } from 'react';
import {
  playClickSound,
  playSuccessSound,
  playSciFiBeep,
  playAlertSound,
  playJarvisStartupSound,
  attachJarvisVoiceDSP,
} from '../../utils/soundEffects';
import { processJarvisCommand, USER_TITLE, setUserTitle } from '../../utils/jarvisBrain';
import { askGemini } from '../../services/geminiService';
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
  const [continuousVoice, setContinuousVoice] = useState(true); // Continuous Auto-Listen Loop
  const [isRedAlert, setIsRedAlert] = useState(false);

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
        if (continuousVoice || wakeWordActive) {
          setTimeout(() => {
            try {
              if (recognitionRef.current) {
                recognitionRef.current.start();
                setIsListening(true);
                setHudState('LISTENING');
              }
            } catch {}
          }, 500);
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
            // Prefer deep male Thai voice, or standard Thai
            const thaiVoice =
              availVoices.find(
                (v) =>
                  (v.lang === 'th-TH' || v.lang.toLowerCase().startsWith('th')) &&
                  (v.name.toLowerCase().includes('niwat') ||
                    v.name.toLowerCase().includes('male') ||
                    v.name.includes('ผู้ชาย'))
              ) ||
              availVoices.find(
                (v) =>
                  v.lang === 'th-TH' ||
                  v.lang.toLowerCase().startsWith('th') ||
                  v.name.toLowerCase().includes('thai') ||
                  v.name.includes('ภาษาไทย')
              );

            if (thaiVoice) {
              const utterance = new SpeechSynthesisUtterance(cleanSpeech);
              utterance.voice = thaiVoice;
              utterance.lang = 'th-TH';
              // Paul Bettany J.A.R.V.I.S. Tuning: Deep baritone pitch & measured British-butler pacing
              utterance.pitch = 0.82;
              utterance.rate = 0.90;
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
          directAudio.crossOrigin = 'anonymous';
          directAudio.playbackRate = 0.90;
          audioPlayerRef.current = directAudio;
          directAudio.onended = handleSpeechDone;
          directAudio.onerror = tryWebSpeech;
          attachJarvisVoiceDSP(directAudio);
          directAudio.play().catch(tryWebSpeech);
        } catch {
          tryWebSpeech();
        }
      };

      try {
        const proxyUrl = `/api/tts?text=${encoded}`;
        const proxyAudio = new Audio(proxyUrl);
        proxyAudio.crossOrigin = 'anonymous';
        // Paul Bettany J.A.R.V.I.S. Audio Tuning: Calm, deep, measured pacing
        proxyAudio.playbackRate = 0.90;
        audioPlayerRef.current = proxyAudio;
        proxyAudio.onended = handleSpeechDone;
        proxyAudio.onerror = tryDirectGoogleTts;
        // Attach Web Audio API DSP Filter Chain (Bass Warmth + Intercom Clarity + Studio Compression)
        attachJarvisVoiceDSP(proxyAudio);
        proxyAudio.play().catch(tryDirectGoogleTts);
      } catch {
        tryDirectGoogleTts();
      }
    },
    [voiceEnabled, wakeWordActive, continuousVoice]
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
      playSciFiBeep();
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

      setTimeout(async () => {
        let result = null;

        // Phase 3: Voice-Triggered Autonomous Git Push Handler across 18 Projects
        const isVoiceGitPush =
          (clean.includes('push') || clean.includes('อัพเดท') || clean.includes('อัพขึ้น') || clean.includes('ซิงค์')) &&
          (clean.includes('github') || clean.includes('กิต') || clean.includes('โปรเจกต์') || clean.includes('โค้ด'));

        // Check for specific UI system toggle actions
        const isExplicitSystemCommand =
          clean.includes('red alert') ||
          clean.includes('แจ้งเตือนสีแดง') ||
          clean.includes('สัญญาณเตือน') ||
          clean.includes('เปลี่ยนชื่อเรียก') ||
          clean.includes('เปลี่ยนธีม') ||
          clean.includes('เปิดใบเสนอราคา') ||
          clean.includes('ตรวจสุขภาพระบบ');

        if (isVoiceGitPush) {
          let targetProj = 'CEO';
          if (clean.includes('pos') || clean.includes('สต็อก') || clean.includes('inventoty')) targetProj = 'Inventoty AI Light';
          else if (clean.includes('บัตรคอน') || clean.includes('ตั๋ว')) targetProj = 'บัตรคอน Light';
          else if (clean.includes('fitness') || clean.includes('ฟิตเนส')) targetProj = 'Fitness';
          else if (clean.includes('pass') || clean.includes('วอลท์')) targetProj = 'Pass App Light';
          else if (clean.includes('แดชบอร์ด') || clean.includes('dashboard')) targetProj = 'แดชบอร์ด Light';
          else if (clean.includes('บัญชี')) targetProj = 'บัญชี Light';
          else if (clean.includes('เทรด')) targetProj = 'เทรด Light';
          else if (clean.includes('javis') || clean.includes('จาร์วิส')) targetProj = 'Javis';

          try {
            const gitRes = await fetch('/api/projects/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'git_push',
                projectName: targetProj,
                commitMessage: `[J.A.R.V.I.S. Voice Auto-Push] by ${userTitle}`,
              }),
            });
            const gitData = await gitRes.json();
            result = {
              action: 'GIT_PUSH_RESULT',
              squadId: 'dev',
              delegatedTo: 'Autonomous Git Pipeline',
              reply: gitData.success
                ? `ดำเนินการ Push โปรเจกต์ ${targetProj} ขึ้น GitHub สำเร็จเรียบร้อยครับ ${userTitle}!\n\nOutput Log:\n${gitData.output || '(Clean commit & push)'}`
                : `พยายาม Push โปรเจกต์ ${targetProj} แล้ว แต่พบข้อความแจ้งเตือน:\n${gitData.error || gitData.output}`,
              speech: gitData.success
                ? `บันทึกและพุชโค้ดโปรเจกต์ ${targetProj} ขึ้นกิตฮับเรียบร้อยครับ ${userTitle}`
                : `ระบบพยายามพุชแล้ว กรุณาตรวจสอบการล็อกอินกิตครับ ${userTitle}`,
              hologram: {
                title: `GIT PIPELINE // ${targetProj.toUpperCase()}`,
                category: 'AUTONOMOUS REPOSITORY SYNC',
                badge: gitData.success ? 'PUSH SUCCESS' : 'AUTH REQUIRED',
                details: [
                  { label: 'Project', val: targetProj },
                  { label: 'Branch', val: 'main' },
                  { label: 'Status', val: gitData.success ? 'Synchronized' : 'Pending Auth' },
                  { label: 'Trigger', val: 'Voice Command' },
                ],
              },
            };
          } catch (err) {
            console.warn('[Voice Git Push Fallback]:', err);
          }
        } else if (isExplicitSystemCommand) {
          result = processJarvisCommand(clean);
        }

        // Natural Conversational AI Engine (Default for all speech and questions)
        if (!result) {
          try {
            const geminiRes = await askGemini(clean, userTitle);
            result = {
              action: 'GEMINI_CONVERSATION',
              squadId: 'dev',
              delegatedTo: `Google Gemini Neural Core (${geminiRes.model})`,
              reply: geminiRes.reply,
              speech: geminiRes.speech,
              hologram: geminiRes.isNews
                ? {
                    title: 'NEWS DISPATCH // DAILY INTELLIGENCE',
                    category: 'THAILAND & GLOBAL BRIEFING',
                    badge: '5 HEADLINES READY',
                    details: [
                      { label: 'เรื่องที่ 1', val: 'เศรษฐกิจและการค้า' },
                      { label: 'เรื่องที่ 2', val: 'นโยบายรัฐบาล' },
                      { label: 'เรื่องที่ 3', val: 'เทคโนโลยีและ AI' },
                      { label: 'เรื่องที่ 4', val: 'พลังงานและคมนาคม' },
                      { label: 'เรื่องที่ 5', val: 'การลงทุนต่างประเทศ' },
                    ],
                  }
                : {
                    title: 'GOOGLE GEMINI // NATURAL DIALOGUE',
                    category: 'CONVERSATIONAL NEURAL BRAIN',
                    badge: 'ONLINE',
                    details: [
                      { label: 'AI Model', val: geminiRes.model },
                      { label: 'Personality', val: 'Paul Bettany (Thai Native)' },
                      { label: 'Knowledge Base', val: '18 Projects in D:\\Light' },
                      { label: 'Dialogue Mode', val: 'Dynamic Adaptive' },
                    ],
                  },
            };
          } catch {
            result = processJarvisCommand(clean);
          }
        }

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
        } else if (result.action === 'TOGGLE_RED_ALERT') {
          setIsRedAlert(result.isAlert);
          if (result.isAlert) {
            playAlertSound();
          } else {
            playSuccessSound();
          }
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

          playSciFiBeep();

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
    playJarvisStartupSound();
    setTimeout(() => {
      speakThai(`สวัสดีครับ ${userTitle} ผม จาร์วิส มาร์คทรี ระบบเสียงโทนสุขุมลุ่มลึกพร้อมใช้งานแล้วครับ`);
    }, 650);
    if (onShowToast) {
      onShowToast('info', 'J.A.R.V.I.S. Startup Voice', 'กำลังเล่นเสียง Startup Sound และเสียงพากย์ภาษาไทยออกลำโพงครับ');
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

  const handleToggleRedAlert = () => {
    setIsRedAlert((prev) => {
      const next = !prev;
      if (next) {
        playAlertSound();
        speakThai(`เปิดระบบเตือนภัยฉุกเฉิน เรดอเลิร์ต ป้องกันทุกระดับเรียบร้อยครับ ${userTitle}`);
      } else {
        playSuccessSound();
        speakThai(`ยกเลิกเตือนภัย กลับสู่สภาวะปกติเรียบร้อยครับ ${userTitle}`);
      }
      return next;
    });
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
      isRedAlert={isRedAlert}
      onToggleRedAlert={handleToggleRedAlert}
      continuousVoice={continuousVoice}
      onToggleContinuous={() => setContinuousVoice((v) => !v)}
    />
  );
}
