import { Capacitor } from "@capacitor/core";
import { AudioLines, Brain, Briefcase, FolderKanban, GitBranch, Globe, Hand, LogOut, Mic, MicOff, NotebookPen, Settings2, Sparkles, Square, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { browserStore, isDesktopApp } from "./browser/browserStore";
import { AccessGate } from "./components/AccessGate";
import { FillCard } from "./components/FillCard";
import { AppLaunchCard } from "./components/AppLaunchCard";
import { MeetingSummaryCard } from "./components/MeetingSummaryCard";
import { ProjectActionCard } from "./components/ProjectActionCard";
import { ServiceBanner } from "./components/ServiceBanner";
import { ServerUnreachable, SessionSkeleton } from "./components/SessionFallback";
import { VoiceDock } from "./components/VoiceDock";
import { BootSequence } from "./components/hud/BootSequence";
import { HandPointer } from "./components/hud/HandPointer";
import { HudFrame } from "./components/hud/HudFrame";
import { Reactor3D } from "./components/hud/Reactor3D";
import { LazyBoundary } from "./components/lazy/LazyBoundary";
import {
  BrowserView,
  FrameView,
  MainViewSkeleton,
  MeetingPanel,
  preloadViews,
  ProjectsPanel,
  RouterPanel,
  VoiceRecorderDialog,
  VoiceSettingsDialog,
  WorkspacePanel
} from "./components/lazy/views";
import { Stage } from "./components/hud/Stage";
import { buildMorningBriefingPrompt, isMorningBriefingCommand } from "./conversation/morningBriefing";
import { pickThaiFiller } from "./conversation/fillers";
import { PHASE_LABEL, WAITING_FOR_WAKE_LABEL } from "./conversation/messages";
import { fetchMorningBriefing } from "./services/workspaceApi";
import { useAiStatus } from "./hooks/useAiStatus";
import { useCalendarReminder } from "./hooks/useCalendarReminder";
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
import { matchAssistantVoiceCommand } from "./conversation/assistantVoiceCommands";
import { matchVoiceSwitchCommand } from "./conversation/voiceCommands";
import { launchAllowedApp } from "./services/appLauncher";
import { contactsStore } from "./services/contactsStore";
import { customAppsStore } from "./services/customAppsStore";
import { customVoicesStore } from "./services/customVoicesStore";
import { startWorkspacePreferencesSync } from "./services/preferencesSync";
import { type HandPointerState, startHandControl } from "./services/handControl";
import { hudEffectsStore } from "./services/hudEffectsStore";
import { sfx } from "./services/sfx";
import { themeStore } from "./services/themeStore";
import { thinkHardStore } from "./services/thinkHardStore";
import { voiceSettingsStore } from "./services/voiceSettingsStore";
import { startClapDetector } from "./speech/clapDetector";
import { resolveAssistantIdentity } from "./speech/cloudVoice";
import { memoryStore } from "./memory/memoryStore";
import {
  type CapturedScreenImage,
  canCaptureScreen,
  captureScreenImage,
  isScreenCaptureVoiceCommand
} from "./services/screenCapture";

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
    confirmAppLaunch,
    cancelAppLaunch
  } = useConversation({ ready });
  const installPrompt = useInstallPrompt();
  const browser = useSyncExternalStore(browserStore.subscribe, browserStore.get);
  const { phase, wake, active, messages, partial, notice, onDeviceListening, searching, pendingFillId, pendingProjectAction, pendingAppLaunch, lastReplyMs } = state;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [routerOpen, setRouterOpen] = useState(false);
  const [dismissedMeetingId, setDismissedMeetingId] = useState<string | null>(null);
  // หน้าตั้งค่าแยกไฟล์โหลด จึงสร้างเมื่อเปิดครั้งแรก แล้วคงไว้ให้ <dialog> คืนโฟกัสให้ปุ่มที่กดเปิดตอนปิด
  const [settingsUsed, setSettingsUsed] = useState(false);
  const [recorderUsed, setRecorderUsed] = useState(false);
  const [metricsHidden] = useState(false);
  const [desktop] = useState(isDesktopApp);
  const [screenCaptureAvailable] = useState(canCaptureScreen);
  const [capturingScreen, setCapturingScreen] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [pendingCapture, setPendingCapture] = useState<CapturedScreenImage | null>(null);
  const pendingCaptureRef = useRef<CapturedScreenImage | null>(null);
  const captureHandlerRef = useRef<() => Promise<void>>(async () => undefined);
  const memories = useSyncExternalStore(memoryStore.subscribe, memoryStore.get);
  const thinkHard = useSyncExternalStore(thinkHardStore.subscribe, thinkHardStore.get);
  const hudVisual = useSyncExternalStore(hudEffectsStore.subscribe, hudEffectsStore.get);
  const [bootDone, setBootDone] = useState(() => {
    if (typeof navigator !== "undefined" && navigator.webdriver) return true;
    try {
      return sessionStorage.getItem("javis.booted") === "1";
    } catch {
      return true;
    }
  });
  const [clapEnabled, setClapEnabled] = useState(false);
  const [handControlEnabled, setHandControlEnabled] = useState(false);
  const [sensorNotice, setSensorNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [handPointer, setHandPointer] = useState<HandPointerState>({
    active: false,
    x: 0,
    y: 0,
    pinching: false,
    openPalm: false
  });
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
  const showingWorkspace = ready && workspaceOpen && !showingWeb && !showingProjects && !inMeeting;
  const showingRouter = ready && routerOpen && !showingWeb && !showingProjects && !showingWorkspace && !inMeeting;
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
          : phase === "listening" && wake === "waiting"
            ? WAITING_FOR_WAKE_LABEL
            : PHASE_LABEL[phase];
  const platformLabel = desktop ? "แอปเดสก์ท็อป" : Capacitor.isNativePlatform() ? "แอปมือถือ" : "เว็บ";
  const cloudVoiceStatus = useCloudVoiceStatus(synthesizer);
  const assistantIdentity = resolveAssistantIdentity(cloudVoiceStatus);

  const pushDesktopNotification = useCallback((title: string, body: string) => {
    const desktopApi = (window as unknown as { javisDesktop?: { notify?: (t: string, b: string) => Promise<unknown> } }).javisDesktop;
    if (desktopApi?.notify) {
      void desktopApi.notify(title, body).catch(() => undefined);
    }
  }, []);

  useCalendarReminder({
    enabled: ready && !inMeeting,
    phase,
    identity: assistantIdentity,
    onReminder: (spokenText, eventTitle) => {
      controller.addExchange("แจ้งเตือนนัดหมาย Google Calendar", { text: spokenText });
      pushDesktopNotification(eventTitle ? `นัดหมาย: ${eventTitle}` : "แจ้งเตือนนัดหมาย", spokenText);
      void synthesizer.speak(spokenText).catch(() => undefined);
    }
  });

  useEffect(() => {
    if (!ready) return;
    return startWorkspacePreferencesSync();
  }, [ready]);

  useEffect(() => {
    if (!ready || !desktop) return;
    const bridge = (window as unknown as {
      javisDesktop?: { onHotkeyListen?: (cb: () => void) => () => void };
    }).javisDesktop;
    if (!bridge?.onHotkeyListen) return;

    return bridge.onHotkeyListen(() => {
      if (inMeeting) return;
      setProjectsOpen(false);
      setWorkspaceOpen(false);
      setRouterOpen(false);
      browserStore.hide();
      if (!active) void start();
    });
  }, [ready, desktop, inMeeting, active, start]);
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
  // ซ่อนแผง HUD เก่าด้านซ้ายเมื่อเปิดหน้าเว็บ/งาน/โปรเจกต์/Router เพื่อให้แสดงผลเต็มพื้นที่
  const stageShown = ready && !showingWeb && !showingProjects && !showingWorkspace && !showingRouter;
  const latestMeetingMessage = [...messages].reverse().find((message) => Boolean(message.meeting && message.text));
  const shownMeeting =
    latestMeetingMessage && latestMeetingMessage.id !== dismissedMeetingId ? latestMeetingMessage : null;

  // คำที่กำลังได้ยิน: แถบสั่งงานเคยแสดงให้ เมื่อไม่มีแถบจึงแสดงเป็นบรรทัดเดียวเฉพาะตอนผู้ใช้กำลังพูด
  const heard = alwaysListening && phase === "listening" ? partial : "";
  const speechHint = alwaysListening && speechBlocked;
  const elsewhereHint = handsFree.heldElsewhere && !active;
  // เริ่มจดการประชุมไม่สำเร็จ: ไม่มีแผงการประชุมให้แสดงสาเหตุ จึงแจ้งที่แถบล่าง
  const meetingNotice = inMeeting ? null : meeting.state.notice;
  const shownCapture = ready && !inMeeting ? pendingCapture : null;
  const showMainContent =
    !ready ||
    showingWeb ||
    showingProjects ||
    showingWorkspace ||
    showingRouter ||
    inMeeting ||
    Boolean(shownMeeting || pendingFill || pendingProjectAction || pendingAppLaunch || shownCapture || captureError || notice || meetingNotice || speechHint);
  // ตลอดการประชุมไม่มีแถบล่าง: ปุ่มและข้อความแจ้งทั้งหมดอยู่ในแผงการประชุม
  const footerShown =
    !inMeeting &&
    (dockShown ||
      Boolean(
        pendingFill || pendingProjectAction || pendingAppLaunch || shownCapture || captureError || sensorNotice || notice || meetingNotice || speechHint || heard
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
        : showingRouter
          ? "แผง JEV Agent-Router Telemetry"
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
      lines.push(`คำตอบล่าสุดจาก ลูน่า: ${lastReply.slice(0, 400)}`);
    }
    return lines.join("\n").slice(0, 2500);
  }, [ready, showingWeb, showingProjects, showingRouter, browser.title, browser.requestedUrl, inMeeting, messages.length, metricsHidden, readouts, statusLabel, memories, lastReply]);

  useEffect(() => {
    controller.setScreenContextProvider(buildScreenSummary);
    return () => controller.setScreenContextProvider(undefined);
  }, [controller, buildScreenSummary]);

  // เข้าใช้งานได้แล้ว: โหลดหน้าตั้งค่า แผงการประชุม และตัวแสดงหน้าเว็บล่วงหน้าตอนเครื่องว่าง กดเปิดแล้วจึงขึ้นทันที
  useEffect(() => {
    if (!ready) return;
    return preloadViews({ desktop, meeting: meeting.capable });
  }, [ready, desktop, meeting.capable]);

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
      setCaptureError(error instanceof Error ? error.message : "ไม่สามารถจับภาพหน้าจอได้ค่ะ");
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

  const runMorningBriefing = useCallback(async () => {
    setWorkspaceOpen(false);
    setProjectsOpen(false);
    setRouterOpen(false);
    browserStore.hide();
    try {
      const briefing = await fetchMorningBriefing();
      sendMessage(buildMorningBriefingPrompt(briefing), { speak: true });
    } catch {
      sendMessage("ช่วยสรุปงาน เมลสำคัญ ปฏิทิน และโน้ตเช้านี้ให้ฟังหน่อย", { speak: true });
    }
  }, [sendMessage]);

  useEffect(() => {
    if (!ready || inMeeting) return;
    return appCommands.register({
      matches: isMorningBriefingCommand,
      run: () => {
        void runMorningBriefing();
      }
    });
  }, [ready, inMeeting, runMorningBriefing]);

  useEffect(() => {
    if (!ready || inMeeting) return;
    return appCommands.register({
      matches: (text) => /(?:จดจำ|บันทึก)\s*เสียง/i.test(text),
      run: () => openRecorder()
    });
  }, [ready, inMeeting, openRecorder]);

  const voiceTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current !== null) window.clearTimeout(voiceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ready || inMeeting) return;
    return appCommands.register({
      matches: (text) => matchAssistantVoiceCommand(text, customAppsStore.get(), new Date(), contactsStore.get()) !== null,
      run: (text) => {
        const command = matchAssistantVoiceCommand(text, customAppsStore.get(), new Date(), contactsStore.get());
        if (!command) return "keep-listening";

        const speakInstant = (replyText: string) => {
          synthesizer.cancel();
          controller.addExchange(text, { text: replyText });
          void synthesizer.speak(replyText).catch(() => undefined);
        };

        switch (command.kind) {
          case "time":
          case "date":
            speakInstant(command.reply);
            return "keep-listening";

          case "timer-set": {
            if (voiceTimerRef.current !== null) window.clearTimeout(voiceTimerRef.current);
            voiceTimerRef.current = window.setTimeout(() => {
              voiceTimerRef.current = null;
              const alertText = `ครบเวลา ${command.label} ที่ตั้งไว้แล้วค่ะ`;
              controller.addExchange(`ครบเวลา ${command.label}`, { text: alertText });
              pushDesktopNotification("ตัวจับเวลาครบกำหนด", alertText);
              void synthesizer.speak(alertText).catch(() => undefined);
            }, command.durationMs);
            speakInstant(command.reply);
            return "keep-listening";
          }

          case "timer-cancel":
            if (voiceTimerRef.current !== null) {
              window.clearTimeout(voiceTimerRef.current);
              voiceTimerRef.current = null;
            }
            speakInstant(command.reply);
            return "keep-listening";

          case "navigate":
            setProjectsOpen(command.target === "projects");
            setWorkspaceOpen(command.target === "workspace");
            setRouterOpen(false);
            if (command.target === "settings") setSettingsOpen(true);
            browserStore.hide();
            speakInstant(command.reply);
            return "keep-listening";

          case "speech-rate": {
            const current = voiceSettingsStore.get();
            const nextRate =
              command.delta === "normal"
                ? 1
                : command.delta === "faster"
                  ? Math.min(1.4, Number((current.rate + 0.15).toFixed(2)))
                  : Math.max(0.8, Number((current.rate - 0.15).toFixed(2)));
            voiceSettingsStore.update({ rate: nextRate });
            synthesizer.applySettings({ ...current, rate: nextRate });
            speakInstant(command.reply);
            return "keep-listening";
          }

          case "theme":
            themeStore.set(command.theme);
            speakInstant(command.reply);
            return "keep-listening";

          case "clear-chat":
            reset();
            speakInstant(command.reply);
            return "keep-listening";

          case "think-hard":
            thinkHardStore.set(command.enabled);
            sfx.click();
            speakInstant(command.reply);
            return "keep-listening";

          case "hud-accent":
            hudEffectsStore.setAccent(command.accent);
            sfx.effect();
            speakInstant(command.reply);
            return "keep-listening";

          case "hud-style":
            hudEffectsStore.setStyle(command.style);
            sfx.effect();
            speakInstant(command.reply);
            return "keep-listening";

          case "hud-effect":
            hudEffectsStore.triggerEffect(command.effect);
            sfx.effect();
            speakInstant(command.reply);
            return "keep-listening";

          case "hand-control":
            setHandControlEnabled(command.enabled);
            sfx.click();
            speakInstant(command.reply);
            return "keep-listening";

          case "clap-wake":
            setClapEnabled(command.enabled);
            sfx.click();
            speakInstant(command.reply);
            return "keep-listening";

          case "open-url":
            if (command.url.startsWith("tel:") || command.url.startsWith("mailto:")) {
              window.location.href = command.url;
            } else if (desktop) {
              browserStore.open(command.url);
            } else {
              browserStore.showFramed(command.url, "หน้าเว็บ");
            }
            speakInstant(command.reply);
            return "keep-listening";

          case "launch-custom-app":
            void launchAllowedApp(command.app.id, command.app.name).then((res) => {
              controller.addExchange(text, { text: res.message });
              void synthesizer.speak(res.message).catch(() => undefined);
            });
            return "keep-listening";
        }
      }
    });
  }, [ready, inMeeting, controller, synthesizer, desktop, reset, pushDesktopNotification]);

  // ตบมือ 2 ครั้งปลุก Javis
  useEffect(() => {
    if (!ready || !clapEnabled || inMeeting || active) return;
    let cancelled = false;
    let stopClap: (() => void) | undefined;
    void startClapDetector(() => {
      if (cancelled) return;
      sfx.wake();
      if (handsFree.capable) handsFree.enable();
      else void start();
    })
      .then((handle) => {
        if (cancelled) handle.stop();
        else stopClap = handle.stop;
      })
      .catch((error) => {
        if (cancelled) return;
        setClapEnabled(false);
        setSensorNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "เปิดไมโครโฟนตรวจจับเสียงตบมือไม่ได้"
        });
      });
    return () => {
      cancelled = true;
      stopClap?.();
    };
  }, [ready, clapEnabled, inMeeting, active, handsFree, start]);

  // ควบคุมด้วยท่ามือผ่านกล้อง (MediaPipe)
  useEffect(() => {
    if (!ready || !handControlEnabled || inMeeting) return;
    let cancelled = false;
    let stopHands: (() => void) | undefined;
    void startHandControl(
      (next) => {
        if (!cancelled) setHandPointer(next);
      },
      (x, y) => {
        if (cancelled) return;
        const target = document.elementFromPoint(x, y);
        const btn = target instanceof HTMLElement ? target.closest("button, a, [role='button']") : null;
        if (btn instanceof HTMLElement) {
          sfx.click();
          btn.click();
        }
      },
      (message) => {
        if (cancelled) return;
        setHandControlEnabled(false);
        setSensorNotice({ tone: "error", text: message });
      }
    )
      .then((handle) => {
        if (cancelled) handle.stop();
        else stopHands = handle.stop;
      })
      .catch((error) => {
        if (cancelled) return;
        setHandControlEnabled(false);
        setSensorNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "เปิดกล้องควบคุมท่ามือไม่ได้"
        });
      });
    return () => {
      cancelled = true;
      stopHands?.();
    };
  }, [ready, handControlEnabled, inMeeting]);

  useEffect(() => {
    if (!sensorNotice) return;
    const timer = window.setTimeout(() => setSensorNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [sensorNotice]);

  // เสียงตอบรับสั้นๆ ระหว่างรอ AI คิดคำตอบ (Filler)
  useEffect(() => {
    if (!ready || inMeeting || phase !== "thinking" || !active) return;
    const timer = window.setTimeout(() => {
      void synthesizer.speak(pickThaiFiller()).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [ready, inMeeting, phase, active, synthesizer]);

  return (
    <div
      className={`app${stageShown ? " has-stage" : ""}${showMainContent ? " show-main" : ""}${hudVisual.effect !== "none" ? ` hud-effect-${hudVisual.effect}` : ""}`}
      data-hud-accent={hudVisual.accent}
    >
      <HudFrame />
      {stageShown && !showMainContent && (
        <Reactor3D
          phase={shownPhase}
          offline={aiDown}
          thinkHard={thinkHard}
          accent={hudVisual.accent}
          style={hudVisual.style}
          fallback={null}
        />
      )}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>LU</span>
          <div className="brand-title">
            <strong>LUNA</strong>
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
              aria-label="หน้าหลักเสียง"
              aria-pressed={!showingWeb && !showingProjects && !showingWorkspace && !showingRouter}
              onClick={() => {
                setProjectsOpen(false);
                setWorkspaceOpen(false);
                setRouterOpen(false);
                browserStore.hide();
              }}
            >
              <AudioLines size={15} aria-hidden /> หน้าหลัก
            </button>
            <button
              type="button"
              aria-label="Workspace Hub"
              aria-pressed={showingWorkspace}
              onClick={() => {
                setProjectsOpen(false);
                setWorkspaceOpen((prev) => !prev);
                setRouterOpen(false);
                browserStore.hide();
              }}
            >
              <Briefcase size={15} aria-hidden /> งาน
            </button>
            <button
              type="button"
              aria-label="โปรเจกต์"
              aria-pressed={showingProjects}
              onClick={() => {
                setProjectsOpen((prev) => !prev);
                setWorkspaceOpen(false);
                setRouterOpen(false);
                browserStore.hide();
              }}
            >
              <FolderKanban size={15} aria-hidden /> โปรเจกต์
            </button>
            <button
              type="button"
              aria-label="เราเตอร์"
              aria-pressed={showingRouter}
              onClick={() => {
                setProjectsOpen(false);
                setWorkspaceOpen(false);
                setRouterOpen((prev) => !prev);
                browserStore.hide();
              }}
            >
              <GitBranch size={15} aria-hidden /> Router
            </button>
            {pageOpen && (
              <button
                type="button"
                aria-label="หน้าเว็บ"
                aria-pressed={showingWeb}
                onClick={() => {
                  setProjectsOpen(false);
                  setWorkspaceOpen(false);
                  setRouterOpen(false);
                  if (showingWeb) browserStore.hide();
                  else browserStore.show();
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
              title="โหมดสรุปการประชุม: ลูน่า ฟังเงียบ ๆ จดคำพูดทั้งหมด แล้วสรุปให้ครั้งเดียวตอนจบ"
            >
              <NotebookPen size={16} aria-hidden />
              <span>ประชุม</span>
            </button>
          )}
          {ready && !inMeeting && (
            <button
              type="button"
              className={`voice-enroll-entry${thinkHard ? " active" : ""}`}
              onClick={() => {
                sfx.click();
                thinkHardStore.set(!thinkHard);
              }}
              aria-pressed={thinkHard}
              aria-label="โหมดคิดลึก"
              title={thinkHard ? "กำลังเปิดโหมดคิดลึก (วิเคราะห์เชิงลึก) แตะเพื่อสลับกลับโหมดปกติ" : "เปิดโหมดคิดลึกสำหรับการวิเคราะห์ปัญหาซับซ้อน"}
            >
              <Brain size={16} aria-hidden />
              <span>คิดลึก</span>
            </button>
          )}
          {ready && !inMeeting && (
            <button
              type="button"
              className={`voice-enroll-entry${handControlEnabled ? " active" : ""}`}
              onClick={() => {
                sfx.click();
                setHandControlEnabled((prev) => {
                  const next = !prev;
                  setSensorNotice({
                    tone: "info",
                    text: next
                      ? "กำลังเปิดกล้องจับท่ามือ: ชี้นิ้วเพื่อเลื่อน และจีบนิ้วเพื่อคลิก"
                      : "ปิดโหมดควบคุมด้วยท่ามือแล้ว"
                  });
                  return next;
                });
              }}
              aria-pressed={handControlEnabled}
              aria-label="ควบคุมด้วยท่ามือ"
              title={handControlEnabled ? "กำลังเปิดกล้องจับท่ามือ แตะเพื่อปิด" : "เปิดกล้องควบคุมหน้าจอด้วยท่ามือ (จีบนิ้วเพื่อคลิก)"}
            >
              <Hand size={16} aria-hidden />
              <span>ท่ามือ</span>
            </button>
          )}
          {ready && !inMeeting && (
            <button
              type="button"
              className={`voice-enroll-entry${clapEnabled ? " active" : ""}`}
              onClick={() => {
                sfx.click();
                setClapEnabled((prev) => {
                  const next = !prev;
                  setSensorNotice({
                    tone: "info",
                    text: next
                      ? active
                        ? "เปิดโหมดตบมือแล้ว (จะทำงานเมื่อปิดไมโครโฟนพักอยู่)"
                        : "เปิดโหมดตบมือ 2 ครั้งเพื่อปลุกลูน่าแล้ว"
                      : "ปิดโหมดตบมือปลุกแล้ว"
                  });
                  return next;
                });
              }}
              aria-pressed={clapEnabled}
              aria-label="ตบมือปลุก"
              title={clapEnabled ? "เปิดโหมดตบมือ 2 ครั้งเพื่อปลุกลูน่าอยู่ แตะเพื่อปิด" : "เปิดโหมดตบมือ 2 ครั้งเพื่อปลุกลูน่า"}
            >
              <Sparkles size={16} aria-hidden />
              <span>ตบมือ</span>
            </button>
          )}
          {ready && !inMeeting && (
            <button
              type="button"
              className="voice-enroll-entry"
              onClick={openRecorder}
              aria-label="บันทึกเสียงของไลท์"
              title="เมนูบันทึกเสียง: อัดเสียงของไลท์เพื่อให้ ลูน่า จดจำและใช้เสียงนี้พูดตอบกลับ"
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
              title={micOn ? "ไมโครโฟนเปิดอยู่ ลูน่า ฟังตลอดเวลา แตะเพื่อปิด" : "ไมโครโฟนปิดอยู่ แตะเพื่อให้ ลูน่า ฟังตลอดเวลา"}
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
          compact={showingWeb || showingProjects || showingWorkspace || showingRouter || inMeeting || Boolean(shownMeeting)}
          offline={aiDown}
          metricsHidden={metricsHidden}
          platformLabel={platformLabel}
          thinkHard={thinkHard}
          waitingForWake={!meetingStatus && phase === "listening" && wake === "waiting"}
        />
      )}

      <main className="app-main">
        {ai.problem && (
          <ServiceBanner key={`${ai.problem.scope}:${ai.problem.reason}`} problem={ai.problem} onRecheck={ai.recheck} />
        )}
        <div className="scroll-area" hidden={showingWeb || showingProjects || showingWorkspace || showingRouter || inMeeting || (ready && !shownMeeting)}>
          {session.phase === "checking" && <SessionSkeleton />}
          {session.phase === "unreachable" && <ServerUnreachable onRetry={session.retry} />}
          {session.phase === "signed-out" && <AccessGate onSignIn={session.signIn} />}
          {ready && shownMeeting?.meeting && (
            <MeetingSummaryCard
              summary={shownMeeting.text}
              meeting={shownMeeting.meeting}
              onDismiss={() => setDismissedMeetingId(shownMeeting.id)}
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
        {showingWorkspace && (
          <LazyBoundary
            label="Workspace Hub"
            retry={WorkspacePanel.preload}
            fallback={<MainViewSkeleton label="Workspace Hub" />}
            onDismiss={() => setWorkspaceOpen(false)}
          >
            <WorkspacePanel
              onClose={() => setWorkspaceOpen(false)}
              onRunBriefing={() => void runMorningBriefing()}
            />
          </LazyBoundary>
        )}
        {showingRouter && (
          <LazyBoundary
            label="แผง JEV Router"
            retry={RouterPanel.preload}
            fallback={<MainViewSkeleton label="แผง JEV Router" />}
            onDismiss={() => setRouterOpen(false)}
          >
            <RouterPanel onClose={() => setRouterOpen(false)} />
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
              onRelabelSpeaker={meeting.relabelSpeaker}
            />
          </LazyBoundary>
        )}
      </main>

      {ready && footerShown && (
        <footer className={`dock${dockShown ? "" : " bare"}`}>
          {pendingFill && <FillCard request={pendingFill} onConfirm={confirmFill} onCancel={cancelFill} />}
          {pendingProjectAction && (
            <ProjectActionCard
              proposal={pendingProjectAction}
              onConfirm={confirmProjectAction}
              onCancel={cancelProjectAction}
            />
          )}
          {pendingAppLaunch && (
            <AppLaunchCard
              proposal={pendingAppLaunch}
              onConfirm={confirmAppLaunch}
              onCancel={cancelAppLaunch}
            />
          )}
          {shownCapture && (
            <div className="capture-preview-card" role="region" aria-label="ภาพหน้าจอที่แนบไว้">
              <img
                src={`data:${shownCapture.mimeType};base64,${shownCapture.data}`}
                alt="ภาพหน้าจอที่เลือกไว้สำหรับให้ ลูน่า วิเคราะห์"
                className="capture-preview-thumb"
              />
              <div className="capture-preview-meta">
                <strong>พร้อมวิเคราะห์ภาพหน้าจอ</strong>
                <span>
                  {shownCapture.width}×{shownCapture.height} — พูดถามหรือกดอ่านภาพทันที
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
          {sensorNotice && (
            <div className={`toast ${sensorNotice.tone}`} role={sensorNotice.tone === "error" ? "alert" : "status"}>
              {sensorNotice.text}
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
              ลูน่ากำลังฟังอยู่ในอีกแท็บหนึ่ง แตะปุ่มไมโครโฟนที่แท็บนี้ถ้าต้องการให้ฟังที่นี่แทน
            </div>
          )}
          {speechHint && (
            <div className="toast info" role="status">
              เบราว์เซอร์ยังไม่ให้ลูน่าพูดจนกว่าจะมีการแตะหน้านี้ แตะที่ใดก็ได้หนึ่งครั้งเพื่อเปิดเสียงตอบ
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
              canCaptureScreen={screenCaptureAvailable}
              onCaptureScreen={handleCaptureScreen}
              capturingScreen={capturingScreen}
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
      {ready && !bootDone && (
        <BootSequence
          onComplete={() => {
            try {
              sessionStorage.setItem("javis.booted", "1");
            } catch {
              // ignore storage restrictions
            }
            setBootDone(true);
          }}
        />
      )}
      {handControlEnabled && <HandPointer pointer={handPointer} />}
    </div>
  );
}
