import { Capacitor } from "@capacitor/core";
import { AudioLines, FolderKanban, Globe, LogOut, MessageSquare, Mic, MicOff, NotebookPen, Settings2, Square, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { browserStore, isDesktopApp } from "./browser/browserStore";
import { AccessGate } from "./components/AccessGate";
import { FillCard } from "./components/FillCard";
import { ProjectActionCard } from "./components/ProjectActionCard";
import { ServiceBanner } from "./components/ServiceBanner";
import { ServerUnreachable, SessionSkeleton } from "./components/SessionFallback";
import { Transcript } from "./components/Transcript";
import { VoiceDock } from "./components/VoiceDock";
import { HudFrame } from "./components/hud/HudFrame";
import { LazyBoundary } from "./components/lazy/LazyBoundary";
import {
  BrowserView,
  FrameView,
  MainViewSkeleton,
  MeetingPanel,
  preloadViews,
  ProjectsPanel,
  VoiceRecorderDialog,
  VoiceSettingsDialog
} from "./components/lazy/views";
import { Stage } from "./components/hud/Stage";
import { PHASE_LABEL } from "./conversation/messages";
import { useAiStatus } from "./hooks/useAiStatus";
import { useCloudVoiceStatus } from "./hooks/useCloudVoiceStatus";
import { useConversation } from "./hooks/useConversation";
import { useHandsFree } from "./hooks/useHandsFree";
import { useHudTelemetry } from "./hooks/useHudTelemetry";
import { useSearchUsage } from "./hooks/useSearchUsage";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useMeeting } from "./hooks/useMeeting";
import { useSession } from "./hooks/useSession";
import { useSpeechBlocked } from "./hooks/useSpeechBlocked";
import { MEETING_PHASE, MEETING_STATUS_LABEL } from "./meeting/presentation";
import { appCommands } from "./conversation/appCommands";
import { matchVoiceSwitchCommand } from "./conversation/voiceCommands";
import { customVoicesStore } from "./services/customVoicesStore";
import { voiceSettingsStore } from "./services/voiceSettingsStore";
import { memoryStore } from "./memory/memoryStore";
import {
  type CapturedScreenImage,
  canCaptureScreen,
  captureScreenImage,
  isScreenCaptureVoiceCommand
} from "./services/screenCapture";

const PRIVACY_NOTE = "เสียงถูกแปลงเป็นข้อความด้วยระบบเสียงของอุปกรณ์หรือเบราว์เซอร์ และส่งเฉพาะข้อความไปยัง AI";
const HANDS_FREE_PRIVACY_NOTE =
  "ไมโครโฟนเปิดฟังตลอดเวลาที่เปิดหน้านี้ไว้ ปิดได้ที่ปุ่มไมโครโฟนด้านบน เสียงถูกแปลงเป็นข้อความด้วยระบบเสียงของเบราว์เซอร์ และส่งเฉพาะข้อความไปยัง AI";
const DESKTOP_PRIVACY_NOTE =
  "ในแอปเดสก์ท็อป เสียงที่อัดจะถูกส่งผ่านเซิร์ฟเวอร์ Javis ไปแปลงเป็นข้อความ และเมื่อเปิดหน้าเว็บ Javis จะส่งเฉพาะชื่อช่องกรอกข้อมูลของหน้านั้นให้ AI";

export default function App() {
  const session = useSession();
  const ready = session.phase === "signed-in" || session.phase === "open";
  const {
    controller,
    state,
    synthesizer,
    voiceSettings,
    start,
    stop,
    reset,
    interrupt,
    finishListening,
    sendText,
    confirmFill,
    cancelFill,
    confirmProjectAction,
    cancelProjectAction,
    undoMemory,
    markLinkOpened
  } = useConversation({ ready });
  const installPrompt = useInstallPrompt();
  const browser = useSyncExternalStore(browserStore.subscribe, browserStore.get);
  const { phase, active, messages, partial, notice, onDeviceListening, searching, pendingFillId, pendingProjectAction, lastReplyMs } = state;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  // หน้าตั้งค่าแยกไฟล์โหลด จึงสร้างเมื่อเปิดครั้งแรก แล้วคงไว้ให้ <dialog> คืนโฟกัสให้ปุ่มที่กดเปิดตอนปิด
  const [settingsUsed, setSettingsUsed] = useState(false);
  const [recorderUsed, setRecorderUsed] = useState(false);
  const [metricsHidden, setMetricsHidden] = useState(false);
  const [latenciesMs, setLatenciesMs] = useState<number[]>([]);
  const [desktop] = useState(isDesktopApp);
  const [screenCaptureAvailable] = useState(canCaptureScreen);
  const [capturingScreen, setCapturingScreen] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [pendingCapture, setPendingCapture] = useState<CapturedScreenImage | null>(null);
  const pendingCaptureRef = useRef<CapturedScreenImage | null>(null);
  const captureHandlerRef = useRef<() => Promise<void>>(async () => undefined);
  const memories = useSyncExternalStore(memoryStore.subscribe, memoryStore.get);
  const meeting = useMeeting({ ready, controller });
  // โหมดสรุปการประชุมใช้ไมโครโฟนและพื้นที่หลักของจอเอง Javis ไม่ฟังคำสั่งและไม่ตอบจนกว่าการประชุมจะจบ
  const meetingStatus = ready && meeting.state.status !== "idle" ? meeting.state.status : null;
  const inMeeting = meetingStatus !== null;
  // หน้าตั้งค่า/บันทึกเสียงใช้ไมโครโฟนหรือมีเสียงตัวอย่าง จึงพักการฟังไว้ระหว่างที่เปิดอยู่ เช่นเดียวกับตลอดการประชุม
  const handsFree = useHandsFree({ ready, paused: settingsOpen || recorderOpen || meeting.active, controller });
  const speechBlocked = useSpeechBlocked(synthesizer);

  const pageOpen = ready && browser.requestedUrl !== null;
  const showingWeb = pageOpen && browser.visible && !inMeeting;
  const showingProjects = ready && projectsOpen && !showingWeb && !inMeeting;
  const pendingFill = messages.find((message) => message.id === pendingFillId)?.fill ?? null;
  const ai = useAiStatus(ready, desktop);
  // บอกสถานะจริงตอนว่างอยู่ ระหว่างฟังหรือคิดยังแสดงจังหวะการสนทนาตามปกติ
  const aiDown = ai.problem?.scope === "chat" && phase === "idle" && !inMeeting;
  // ฟังตลอดเวลาอยู่: ผู้ใช้พูดได้เลย จึงไม่มีแถบสั่งงาน แถบกลับมาเมื่อไมโครโฟนปิดหรือใช้ไม่ได้ เพื่อให้ยังพิมพ์สั่งได้เสมอ
  const alwaysListening = handsFree.capable && active;
  // ระหว่างที่กำลังจะเริ่มฟังเอง (เช่นตอนเปิดหน้า) ก็ยังไม่แสดงแถบ ไม่เช่นนั้นจะโผล่มาแวบหนึ่งแล้วหายไป
  const dockShown = !alwaysListening && !handsFree.pending;
  const micOn = active || handsFree.pending;
  const answering = phase === "thinking" || phase === "speaking";
  // ที่ที่ฟังตลอดเวลาได้ การว่างอยู่โดยไม่ได้ฟังแปลว่าไมโครโฟนปิดอยู่ ซึ่งผู้ใช้ควรรู้
  const micOff = handsFree.capable && !micOn && phase === "idle";
  // ระหว่างการประชุม แถบบนและแกนกลางบอกจังหวะของการจด แทนจังหวะของบทสนทนาซึ่งหยุดอยู่
  const shownPhase = meetingStatus ? MEETING_PHASE[meetingStatus] : phase;
  const statusLabel = meetingStatus
    ? MEETING_STATUS_LABEL[meetingStatus]
    : phase === "thinking" && searching
      ? "กำลังค้นเว็บ"
      : aiDown
        ? "AI ใช้งานไม่ได้"
        : micOff
          ? "ไมโครโฟนปิดอยู่"
          : PHASE_LABEL[phase];
  const platformLabel = desktop ? "แอปเดสก์ท็อป" : Capacitor.isNativePlatform() ? "แอปมือถือ" : "เว็บ";
  const cloudVoiceStatus = useCloudVoiceStatus(synthesizer);
  const lastReply = [...messages].reverse().find((message) => message.role === "assistant" && message.text)?.text;
  const searchUsage = useSearchUsage(ready, messages.length);
  const readouts = useHudTelemetry({
    platformLabel,
    messageCount: messages.length,
    lastReplyMs,
    cloudVoiceStatus,
    cloudVoiceName: voiceSettings.cloudVoice,
    searchUsage
  });
  // แผงสถานะหลบให้หน้าเว็บเมื่อผู้ใช้กำลังดูหน้าเว็บในแอปเดสก์ท็อป ส่วนบนเว็บ หน้าที่เปิดแสดงในพื้นที่หลักข้างแผงสถานะ
  const stageShown = ready && !(showingWeb && desktop);

  const replyStrip = showingWeb && !pendingFill ? lastReply : undefined;
  // คำที่กำลังได้ยิน: แถบสั่งงานเคยแสดงให้ เมื่อไม่มีแถบจึงแสดงเป็นบรรทัดเดียวเฉพาะตอนผู้ใช้กำลังพูด
  const heard = alwaysListening && phase === "listening" ? partial : "";
  const speechHint = alwaysListening && speechBlocked;
  const elsewhereHint = handsFree.heldElsewhere && !active;
  // เริ่มจดการประชุมไม่สำเร็จ: ไม่มีแผงการประชุมให้แสดงสาเหตุ จึงแจ้งที่แถบล่าง
  const meetingNotice = inMeeting ? null : meeting.state.notice;
  const shownCapture = ready && !inMeeting ? pendingCapture : null;
  // ตลอดการประชุมไม่มีแถบล่าง: ปุ่มและข้อความแจ้งทั้งหมดอยู่ในแผงการประชุม
  const footerShown =
    !inMeeting &&
    (dockShown ||
      Boolean(
        replyStrip || pendingFill || pendingProjectAction || shownCapture || captureError || notice || meetingNotice || speechHint || heard
      ));

  // ออกจากระบบหรือเซสชันหมดอายุ: หยุดเสียง ล้างบทสนทนา และปิดหน้าเว็บของผู้ใช้คนก่อน
  useEffect(() => {
    if (ready) return;
    reset();
    browserStore.close();
  }, [ready, reset]);

  // อัปเดตข้อมูลหน้าจอปัจจุบันให้ระบบอ่านหน้าจอใช้เมื่อผู้ใช้กดปุ่มหรือสั่งด้วยเสียง
  const buildScreenSummary = useCallback((): string | null => {
    if (!ready) return null;
    const viewName = showingWeb
      ? `หน้าเว็บ (${browser.title || browser.requestedUrl})`
      : showingProjects
        ? "ศูนย์ควบคุมโปรเจกต์ทั้งหมด (Project Control Hub)"
        : inMeeting
          ? "โหมดสรุปการประชุม"
          : messages.length === 0
            ? "หน้าหลัก Central Voice Studio"
            : "หน้าสนทนา";
    const stats = metricsHidden ? "ซ่อนค่าสถิติไว้" : readouts.map((r) => `${r.label}: ${r.value}`).join(", ");
    const lines = [`มุมมอง: ${viewName}`, `สถานะ: ${statusLabel}`, `แผงข้อมูล: ${stats}`];
    if (!metricsHidden && memories.length > 0) {
      lines.push(`ความจำที่บันทึกไว้: ${memories.slice(-3).map((m) => m.text).join(" / ")}`);
    }
    if (lastReply) {
      lines.push(`ข้อความล่าสุดจาก Javis: ${lastReply.slice(0, 400)}`);
    }
    return lines.join("\n").slice(0, 2500);
  }, [ready, showingWeb, showingProjects, browser.title, browser.requestedUrl, inMeeting, messages.length, metricsHidden, readouts, statusLabel, memories, lastReply]);

  useEffect(() => {
    controller.setScreenContextProvider(buildScreenSummary);
    return () => controller.setScreenContextProvider(undefined);
  }, [controller, buildScreenSummary]);

  // เข้าใช้งานได้แล้ว: โหลดหน้าตั้งค่า แผงการประชุม และตัวแสดงหน้าเว็บล่วงหน้าตอนเครื่องว่าง กดเปิดแล้วจึงขึ้นทันที
  useEffect(() => {
    if (!ready) return;
    return preloadViews({ desktop, meeting: meeting.capable });
  }, [ready, desktop, meeting.capable]);

  // เก็บประวัติเวลาตอบสนองจริงของแต่ละรอบในเซสชัน เพื่อวาดกราฟแนวโน้มในโหมด Studio
  useEffect(() => {
    if (!ready) return;
    let lastRecorded: number | null = controller.getState().lastReplyMs;
    let lastMsgCount = controller.getState().messages.length;
    return controller.subscribe(() => {
      const next = controller.getState();
      if (next.messages.length === 0 && lastMsgCount > 0) {
        setLatenciesMs([]);
        lastRecorded = null;
      } else if (next.lastReplyMs !== null && next.lastReplyMs !== lastRecorded) {
        lastRecorded = next.lastReplyMs;
        const recorded = next.lastReplyMs;
        setLatenciesMs((prev) => [...prev.slice(-11), recorded]);
      }
      lastMsgCount = next.messages.length;
    });
  }, [controller, ready]);

  // โหมดฟังตลอดเวลาไม่มีปุ่มไมโครโฟนให้แตะพูดแทรก: กด Esc เพื่อหยุดคำตอบแล้วกลับไปฟัง
  useEffect(() => {
    if (!alwaysListening || !answering) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") interrupt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alwaysListening, answering, interrupt]);

  const openSettings = () => {
    // หยุดสนทนาก่อน ไม่เช่นนั้นไมโครโฟนจะได้ยินเสียงตัวอย่าง
    stop();
    setSettingsUsed(true);
    setSettingsOpen(true);
  };

  // โหลดหน้าตั้งค่าไม่สำเร็จแล้วผู้ใช้กดปิด: ถอดออกทั้งหมด เปิดครั้งหน้าจะโหลดใหม่
  const dismissSettings = () => {
    setSettingsOpen(false);
    setSettingsUsed(false);
  };

  const openRecorder = useCallback(() => {
    stop();
    setSettingsOpen(false);
    setRecorderUsed(true);
    setRecorderOpen(true);
  }, [stop]);

  const dismissRecorder = () => {
    setRecorderOpen(false);
    setRecorderUsed(false);
  };

  const sendMessage = useCallback(
    (text: string, options?: Parameters<typeof sendText>[1]) => {
      if (captureError) setCaptureError(null);
      const current = pendingCaptureRef.current;
      if (current && !options?.image) {
        pendingCaptureRef.current = null;
        setPendingCapture(null);
        sendText(text, {
          ...options,
          speak: options?.speak ?? true,
          image: { mimeType: current.mimeType, data: current.data }
        });
        return;
      }
      sendText(text, options);
    },
    [captureError, sendText]
  );

  const handleCaptureScreen = useCallback(async () => {
    if (capturingScreen) return;
    setCaptureError(null);
    setCapturingScreen(true);
    try {
      const captured = await captureScreenImage();
      if (!captured) return;
      pendingCaptureRef.current = captured;
      setPendingCapture(captured);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "ไม่สามารถจับภาพหน้าจอได้ครับ");
    } finally {
      setCapturingScreen(false);
    }
  }, [capturingScreen]);

  useEffect(() => {
    pendingCaptureRef.current = pendingCapture;
  }, [pendingCapture]);

  useEffect(() => {
    captureHandlerRef.current = handleCaptureScreen;
  }, [handleCaptureScreen]);

  useEffect(() => {
    controller.setPendingImageProvider(() => {
      const current = pendingCaptureRef.current;
      if (!current) return null;
      pendingCaptureRef.current = null;
      setPendingCapture(null);
      return { mimeType: current.mimeType, data: current.data };
    });
    return () => controller.setPendingImageProvider(undefined);
  }, [controller]);

  useEffect(() => {
    if (!ready || !screenCaptureAvailable || inMeeting) return;
    return appCommands.register({
      matches: isScreenCaptureVoiceCommand,
      run: () => {
        void captureHandlerRef.current();
      }
    });
  }, [ready, screenCaptureAvailable, inMeeting]);

  useEffect(() => {
    if (!ready || inMeeting) return;
    return appCommands.register({
      matches: (text) => matchVoiceSwitchCommand(text, customVoicesStore.get()) !== null,
      run: (text) => {
        const command = matchVoiceSwitchCommand(text, customVoicesStore.get());
        if (!command) return "keep-listening";
        if (command.kind === "open-recorder") {
          controller.addExchange(text, { text: command.reply });
          openRecorder();
          return;
        }
        const current = voiceSettingsStore.get();
        const patch =
          command.kind === "custom"
            ? { cloud: true, cloudVoice: command.voice.id }
            : { cloud: true, persona: command.persona, cloudVoice: command.cloudVoice };
        const next = { ...current, ...patch };
        voiceSettingsStore.update(patch);
        synthesizer.applySettings(next);
        if ("retryCloud" in synthesizer && typeof synthesizer.retryCloud === "function") {
          synthesizer.retryCloud();
        }
        synthesizer.cancel();
        controller.addExchange(text, { text: command.reply });
        void synthesizer.speak(command.reply).catch(() => undefined);
        return "keep-listening";
      }
    });
  }, [ready, inMeeting, controller, synthesizer, openRecorder]);

  useEffect(() => {
    if (!ready || inMeeting) return;
    return appCommands.register({
      matches: (text) => /(?:จดจำ|บันทึก)\s*เสียง/i.test(text),
      run: () => openRecorder()
    });
  }, [ready, inMeeting, openRecorder]);

  return (
    <div className={`app${stageShown ? " has-stage" : ""}`}>
      <HudFrame />
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>JV</span>
          <div className="brand-title">
            <strong>Javis</strong>
            <span className="brand-sub">CENTRAL VOICE STUDIO</span>
          </div>
          {ready && !aiDown && (
            <span className="live-tag" aria-hidden>
              <i />
              LIVE
            </span>
          )}
        </div>

        {ready && !inMeeting && (
          <div className="view-switch" role="group" aria-label="สลับมุมมอง">
            <button
              type="button"
              aria-label="สนทนา"
              aria-pressed={!showingWeb && !showingProjects}
              onClick={() => {
                setProjectsOpen(false);
                browserStore.hide();
              }}
            >
              <MessageSquare size={15} aria-hidden /> สนทนา
            </button>
            <button
              type="button"
              aria-label="โปรเจกต์"
              aria-pressed={showingProjects}
              onClick={() => {
                setProjectsOpen(true);
                browserStore.hide();
              }}
            >
              <FolderKanban size={15} aria-hidden /> โปรเจกต์
            </button>
            {pageOpen && (
              <button
                type="button"
                aria-label="หน้าเว็บ"
                aria-pressed={showingWeb}
                onClick={() => {
                  setProjectsOpen(false);
                  browserStore.show();
                }}
              >
                <Globe size={15} aria-hidden /> หน้าเว็บ
              </button>
            )}
          </div>
        )}

        <div className="header-actions">
          {ready && (
            <div className={`status-pill ${shownPhase}${aiDown ? " offline" : ""}`} role="status">
              <span className="status-dot" />
              <span className="status-text">{statusLabel}</span>
            </div>
          )}
          {ready && meeting.capable && !inMeeting && (
            <button
              type="button"
              className="meeting-entry"
              onClick={meeting.begin}
              aria-label="เริ่มโหมดสรุปการประชุม"
              title="โหมดสรุปการประชุม: Javis ฟังเงียบ ๆ จดคำพูดทั้งหมด แล้วสรุปให้ครั้งเดียวตอนจบ"
            >
              <NotebookPen size={16} aria-hidden />
              <span>ประชุม</span>
            </button>
          )}
          {ready && !inMeeting && (
            <button
              type="button"
              className="voice-enroll-entry"
              onClick={openRecorder}
              aria-label="บันทึกเสียงของไลท์"
              title="เมนูบันทึกเสียง: อัดเสียงของไลท์เพื่อให้ Javis จดจำและใช้เสียงนี้พูดตอบกลับ"
            >
              <AudioLines size={16} aria-hidden />
              <span>บันทึกเสียง</span>
            </button>
          )}
          {ready && alwaysListening && answering && (
            <button type="button" className="icon-button stop-reply" onClick={interrupt} aria-label="หยุดคำตอบ" title="หยุดคำตอบแล้วกลับไปฟัง (Esc)">
              <Square size={13} fill="currentColor" aria-hidden />
            </button>
          )}
          {ready && handsFree.capable && !inMeeting && (
            <button
              type="button"
              className={`icon-button mic-toggle${micOn ? " on" : ""}`}
              onClick={micOn ? handsFree.disable : handsFree.enable}
              aria-pressed={micOn}
              aria-label="ไมโครโฟนฟังตลอดเวลา"
              title={micOn ? "ไมโครโฟนเปิดอยู่ Javis ฟังตลอดเวลา แตะเพื่อปิด" : "ไมโครโฟนปิดอยู่ แตะเพื่อให้ Javis ฟังตลอดเวลา"}
            >
              {micOn ? <Mic size={17} aria-hidden /> : <MicOff size={17} aria-hidden />}
            </button>
          )}
          {/* หน้าตั้งค่ามีเสียงตัวอย่าง ซึ่งจะถูกจดลงบันทึกการประชุม จึงเปิดไม่ได้ระหว่างประชุม */}
          {ready && !inMeeting && (
            <button type="button" className="icon-button" onClick={openSettings} aria-label="ตั้งค่า">
              <Settings2 size={18} aria-hidden />
            </button>
          )}
          {session.userName && (
            <div className="user-chip">
              <span title={session.userName}>{session.userName}</span>
              <button type="button" onClick={session.signOut} aria-label="ออกจากระบบ">
                <LogOut size={15} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </header>

      {stageShown && (
        <Stage
          phase={shownPhase}
          statusLabel={statusLabel}
          readouts={readouts}
          compact={messages.length > 0 || showingWeb || showingProjects || inMeeting}
          offline={aiDown}
          metricsHidden={metricsHidden}
          platformLabel={platformLabel}
        />
      )}

      <main className="app-main">
        {ai.problem && (
          <ServiceBanner key={`${ai.problem.scope}:${ai.problem.reason}`} problem={ai.problem} onRecheck={ai.recheck} />
        )}
        <div className="scroll-area" hidden={showingWeb || showingProjects || inMeeting}>
          {session.phase === "checking" && <SessionSkeleton />}
          {session.phase === "unreachable" && <ServerUnreachable onRetry={session.retry} />}
          {session.phase === "signed-out" && <AccessGate onSignIn={session.signIn} />}
          {ready && (
            <Transcript
              messages={messages}
              listening={alwaysListening}
              meetingAvailable={meeting.capable}
              aiReady={!aiDown}
              latenciesMs={latenciesMs}
              lastReplyMs={lastReplyMs}
              memories={memories}
              metricsHidden={metricsHidden}
              onToggleMetricsHidden={() => setMetricsHidden((prev) => !prev)}
              onRecheckAi={ai.recheck}
              onSendAndSpeak={(text) => sendMessage(text, { speak: true })}
              canCaptureScreen={screenCaptureAvailable}
              onCaptureScreen={handleCaptureScreen}
              capturingScreen={capturingScreen}
              onSuggest={sendMessage}
              onOpenLink={desktop ? browserStore.open : undefined}
              onShowFramed={desktop ? undefined : browserStore.showFramed}
              onLinkOpened={markLinkOpened}
              onUndoMemory={undoMemory}
              privacyNote={desktop ? DESKTOP_PRIVACY_NOTE : handsFree.capable ? HANDS_FREE_PRIVACY_NOTE : PRIVACY_NOTE}
            />
          )}
        </div>
        {/* แอปเดสก์ท็อปมีเบราว์เซอร์ในตัว ส่วนเว็บในเบราว์เซอร์แสดงหน้าที่เจ้าของเว็บยอมไว้ในกรอบ */}
        {pageOpen && (
          <LazyBoundary
            label="หน้าเว็บ"
            retry={desktop ? BrowserView.preload : FrameView.preload}
            // หน้าเว็บที่ซ่อนอยู่หลังบทสนทนาไม่ต้องมีโครงร่างมาบังบทสนทนา
            fallback={showingWeb ? <MainViewSkeleton label="หน้าเว็บ" /> : null}
            onDismiss={browserStore.close}
          >
            {desktop ? (
              <BrowserView
                browser={browser}
                onReadPage={() => sendMessage("ช่วยสรุปและอ่านเนื้อหาหน้าเว็บนี้ให้ฟังหน่อย", { speak: true })}
              />
            ) : (
              <FrameView
                browser={browser}
                onReadPage={() => sendMessage("ช่วยสรุปและอ่านเนื้อหาหน้าเว็บนี้ให้ฟังหน่อย", { speak: true })}
              />
            )}
          </LazyBoundary>
        )}
        {showingProjects && (
          <LazyBoundary
            label="ศูนย์ควบคุมโปรเจกต์"
            retry={ProjectsPanel.preload}
            fallback={<MainViewSkeleton label="ศูนย์ควบคุมโปรเจกต์" />}
            onDismiss={() => setProjectsOpen(false)}
          >
            <ProjectsPanel
              onClose={() => setProjectsOpen(false)}
              onAskJavis={(prompt) => {
                setProjectsOpen(false);
                sendMessage(prompt, { speak: true });
              }}
              onOpenWeb={(url) => {
                setProjectsOpen(false);
                if (desktop) browserStore.open(url);
                else browserStore.showFramed(url, "หน้าเว็บโปรเจกต์");
              }}
            />
          </LazyBoundary>
        )}
        {inMeeting && (
          <LazyBoundary label="แผงการประชุม" retry={MeetingPanel.preload} fallback={<MainViewSkeleton label="แผงการประชุม" />}>
            <MeetingPanel
              state={meeting.state}
              onPause={meeting.pause}
              onResume={meeting.resume}
              onFinish={meeting.finish}
              onCancel={meeting.cancel}
            />
          </LazyBoundary>
        )}
      </main>

      {ready && footerShown && (
        <footer className={`dock${dockShown ? "" : " bare"}`}>
          {replyStrip && (
            <p className="reply-strip"><strong>Javis</strong> {replyStrip}</p>
          )}
          {pendingFill && <FillCard request={pendingFill} onConfirm={confirmFill} onCancel={cancelFill} />}
          {pendingProjectAction && (
            <ProjectActionCard
              proposal={pendingProjectAction}
              onConfirm={confirmProjectAction}
              onCancel={cancelProjectAction}
            />
          )}
          {shownCapture && (
            <div className="capture-preview-card" role="region" aria-label="ภาพหน้าจอที่แนบไว้">
              <img
                src={`data:${shownCapture.mimeType};base64,${shownCapture.data}`}
                alt="ภาพหน้าจอที่เลือกไว้สำหรับให้ Javis วิเคราะห์"
                className="capture-preview-thumb"
              />
              <div className="capture-preview-meta">
                <strong>พร้อมวิเคราะห์ภาพหน้าจอ</strong>
                <span>
                  {shownCapture.width}×{shownCapture.height} — พิมพ์ พูดถาม หรือกดอ่านภาพทันที
                </span>
              </div>
              <div className="capture-preview-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => sendMessage("ช่วยอ่านและอธิบายสิ่งที่เห็นในภาพหน้าจอนี้ให้ฟังหน่อย", { speak: true })}
                >
                  <Volume2 size={14} aria-hidden /> อ่านภาพนี้เลย
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                    pendingCaptureRef.current = null;
                    setPendingCapture(null);
                  }}
                  aria-label="ยกเลิกภาพที่แนบไว้"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            </div>
          )}
          {captureError && (
            <div className="toast error" role="alert">
              {captureError}
            </div>
          )}
          {notice && (
            <div className={`toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
              {notice.text}
            </div>
          )}
          {meetingNotice && (
            <div className={`toast ${meetingNotice.tone}`} role={meetingNotice.tone === "error" ? "alert" : "status"}>
              {meetingNotice.text}
            </div>
          )}
          {elsewhereHint && (
            <div className="toast info" role="status">
              Javis กำลังฟังอยู่ในอีกแท็บหนึ่ง แตะปุ่มไมโครโฟนที่แท็บนี้ถ้าต้องการให้ฟังที่นี่แทน
            </div>
          )}
          {speechHint && (
            <div className="toast info" role="status">
              เบราว์เซอร์ยังไม่ให้ Javis พูดจนกว่าจะมีการแตะหน้านี้ แตะที่ใดก็ได้หนึ่งครั้งเพื่อเปิดเสียงตอบ
            </div>
          )}
          {heard && (
            <p className="heard-line" aria-live="polite">{heard}</p>
          )}
          {dockShown && (
            <VoiceDock
              phase={phase}
              active={active}
              partial={partial}
              searching={searching}
              onDeviceListening={onDeviceListening}
              alwaysOn={handsFree.capable}
              onStart={handsFree.capable ? handsFree.enable : start}
              onStop={handsFree.capable ? handsFree.disable : stop}
              onInterrupt={interrupt}
              onFinishListening={finishListening}
              onSend={sendMessage}
              canCaptureScreen={screenCaptureAvailable}
              onCaptureScreen={handleCaptureScreen}
              capturingScreen={capturingScreen}
              hasAttachment={Boolean(shownCapture)}
            />
          )}
        </footer>
      )}

      {settingsUsed && (
        <LazyBoundary label="หน้าตั้งค่า" retry={VoiceSettingsDialog.preload} onDismiss={dismissSettings}>
          <VoiceSettingsDialog
            open={settingsOpen && ready}
            onClose={() => setSettingsOpen(false)}
            onOpenRecorder={openRecorder}
            synthesizer={synthesizer}
            settings={voiceSettings}
            installPrompt={installPrompt}
            desktop={desktop}
          />
        </LazyBoundary>
      )}

      {recorderUsed && (
        <LazyBoundary label="บันทึกเสียงของไลท์" retry={VoiceRecorderDialog.preload} onDismiss={dismissRecorder}>
          <VoiceRecorderDialog
            open={recorderOpen && ready}
            onClose={() => setRecorderOpen(false)}
            synthesizer={synthesizer}
            activeCloudVoice={voiceSettings.cloudVoice}
          />
        </LazyBoundary>
      )}
    </div>
  );
}
