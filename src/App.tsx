import { Capacitor } from "@capacitor/core";
import { Globe, LogOut, MessageSquare, Mic, MicOff, Settings2, Square } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { browserStore, isDesktopApp } from "./browser/browserStore";
import { AccessGate } from "./components/AccessGate";
import { BrowserView } from "./components/BrowserView";
import { FillCard } from "./components/FillCard";
import { FrameView } from "./components/FrameView";
import { ServiceBanner } from "./components/ServiceBanner";
import { ServerUnreachable, SessionSkeleton } from "./components/SessionFallback";
import { Transcript } from "./components/Transcript";
import { VoiceDock } from "./components/VoiceDock";
import { VoiceSettingsDialog } from "./components/VoiceSettingsDialog";
import { HudFrame } from "./components/hud/HudFrame";
import { Stage } from "./components/hud/Stage";
import { PHASE_LABEL } from "./conversation/messages";
import { useAiStatus } from "./hooks/useAiStatus";
import { useConversation } from "./hooks/useConversation";
import { useHandsFree } from "./hooks/useHandsFree";
import { useHudTelemetry } from "./hooks/useHudTelemetry";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useSession } from "./hooks/useSession";
import { useSpeechBlocked } from "./hooks/useSpeechBlocked";

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
    undoMemory,
    markLinkOpened
  } = useConversation({ ready });
  const installPrompt = useInstallPrompt();
  const browser = useSyncExternalStore(browserStore.subscribe, browserStore.get);
  const { phase, active, messages, partial, notice, onDeviceListening, searching, pendingFillId, lastReplyMs } = state;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [desktop] = useState(isDesktopApp);
  // หน้าตั้งค่ามีเสียงตัวอย่างที่ไมโครโฟนไม่ควรได้ยิน จึงพักการฟังไว้ระหว่างที่เปิดอยู่
  const handsFree = useHandsFree({ ready, paused: settingsOpen, controller });
  const speechBlocked = useSpeechBlocked(synthesizer);

  const pageOpen = ready && browser.requestedUrl !== null;
  const showingWeb = pageOpen && browser.visible;
  const pendingFill = messages.find((message) => message.id === pendingFillId)?.fill ?? null;
  const ai = useAiStatus(ready, desktop);
  // บอกสถานะจริงตอนว่างอยู่ ระหว่างฟังหรือคิดยังแสดงจังหวะการสนทนาตามปกติ
  const aiDown = ai.problem?.scope === "chat" && phase === "idle";
  // ฟังตลอดเวลาอยู่: ผู้ใช้พูดได้เลย จึงไม่มีแถบสั่งงาน แถบกลับมาเมื่อไมโครโฟนปิดหรือใช้ไม่ได้ เพื่อให้ยังพิมพ์สั่งได้เสมอ
  const alwaysListening = handsFree.capable && active;
  // ระหว่างที่กำลังจะเริ่มฟังเอง (เช่นตอนเปิดหน้า) ก็ยังไม่แสดงแถบ ไม่เช่นนั้นจะโผล่มาแวบหนึ่งแล้วหายไป
  const dockShown = !alwaysListening && !handsFree.pending;
  const micOn = active || handsFree.pending;
  const answering = phase === "thinking" || phase === "speaking";
  // ที่ที่ฟังตลอดเวลาได้ การว่างอยู่โดยไม่ได้ฟังแปลว่าไมโครโฟนปิดอยู่ ซึ่งผู้ใช้ควรรู้
  const micOff = handsFree.capable && !micOn && phase === "idle";
  const statusLabel =
    phase === "thinking" && searching ? "กำลังค้นเว็บ" : aiDown ? "AI ใช้งานไม่ได้" : micOff ? "ไมโครโฟนปิดอยู่" : PHASE_LABEL[phase];
  const platformLabel = desktop ? "แอปเดสก์ท็อป" : Capacitor.isNativePlatform() ? "แอปมือถือ" : "เว็บ";
  const lastReply = [...messages].reverse().find((message) => message.role === "assistant" && message.text)?.text;
  const readouts = useHudTelemetry({ platformLabel, messageCount: messages.length, lastReplyMs });
  // แผงสถานะหลบให้หน้าเว็บเมื่อผู้ใช้กำลังดูหน้าเว็บในแอปเดสก์ท็อป ส่วนบนเว็บ หน้าที่เปิดแสดงในพื้นที่หลักข้างแผงสถานะ
  const stageShown = ready && !(showingWeb && desktop);

  const replyStrip = showingWeb && !pendingFill ? lastReply : undefined;
  // คำที่กำลังได้ยิน: แถบสั่งงานเคยแสดงให้ เมื่อไม่มีแถบจึงแสดงเป็นบรรทัดเดียวเฉพาะตอนผู้ใช้กำลังพูด
  const heard = alwaysListening && phase === "listening" ? partial : "";
  const speechHint = alwaysListening && speechBlocked;
  const elsewhereHint = handsFree.heldElsewhere && !active;
  const footerShown = dockShown || Boolean(replyStrip || pendingFill || notice || speechHint || heard);

  // ออกจากระบบหรือเซสชันหมดอายุ: หยุดเสียง ล้างบทสนทนา และปิดหน้าเว็บของผู้ใช้คนก่อน
  useEffect(() => {
    if (ready) return;
    reset();
    browserStore.close();
  }, [ready, reset]);

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
    setSettingsOpen(true);
  };

  return (
    <div className={`app${stageShown ? " has-stage" : ""}`}>
      <HudFrame />
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <strong>Javis</strong>
        </div>

        {pageOpen && (
          <div className="view-switch" role="group" aria-label="สลับมุมมอง">
            <button type="button" aria-pressed={!showingWeb} onClick={browserStore.hide}>
              <MessageSquare size={15} aria-hidden /> สนทนา
            </button>
            <button type="button" aria-pressed={showingWeb} onClick={browserStore.show}>
              <Globe size={15} aria-hidden /> หน้าเว็บ
            </button>
          </div>
        )}

        <div className="header-actions">
          {ready && (
            <div className={`status-pill ${phase}${aiDown ? " offline" : ""}`} role="status">
              <span className="status-dot" />
              <span className="status-text">{statusLabel}</span>
            </div>
          )}
          {ready && alwaysListening && answering && (
            <button type="button" className="icon-button stop-reply" onClick={interrupt} aria-label="หยุดคำตอบ" title="หยุดคำตอบแล้วกลับไปฟัง (Esc)">
              <Square size={13} fill="currentColor" aria-hidden />
            </button>
          )}
          {ready && handsFree.capable && (
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
          {ready && (
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
        <Stage phase={phase} statusLabel={statusLabel} readouts={readouts} compact={messages.length > 0 || showingWeb} offline={aiDown} />
      )}

      <main className="app-main">
        {ai.problem && (
          <ServiceBanner key={`${ai.problem.scope}:${ai.problem.reason}`} problem={ai.problem} onRecheck={ai.recheck} />
        )}
        <div className="scroll-area" hidden={showingWeb}>
          {session.phase === "checking" && <SessionSkeleton />}
          {session.phase === "unreachable" && <ServerUnreachable onRetry={session.retry} />}
          {session.phase === "signed-out" && <AccessGate onSignIn={session.signIn} />}
          {ready && (
            <Transcript
              messages={messages}
              listening={alwaysListening}
              onSuggest={sendText}
              onOpenLink={desktop ? browserStore.open : undefined}
              onShowFramed={desktop ? undefined : browserStore.showFramed}
              onLinkOpened={markLinkOpened}
              onUndoMemory={undoMemory}
              privacyNote={desktop ? DESKTOP_PRIVACY_NOTE : handsFree.capable ? HANDS_FREE_PRIVACY_NOTE : PRIVACY_NOTE}
            />
          )}
        </div>
        {/* แอปเดสก์ท็อปมีเบราว์เซอร์ในตัว ส่วนเว็บในเบราว์เซอร์แสดงหน้าที่เจ้าของเว็บยอมไว้ในกรอบ */}
        {pageOpen && (desktop ? <BrowserView browser={browser} /> : <FrameView browser={browser} />)}
      </main>

      {ready && footerShown && (
        <footer className={`dock${dockShown ? "" : " bare"}`}>
          {replyStrip && (
            <p className="reply-strip"><strong>Javis</strong> {replyStrip}</p>
          )}
          {pendingFill && <FillCard request={pendingFill} onConfirm={confirmFill} onCancel={cancelFill} />}
          {notice && (
            <div className={`toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
              {notice.text}
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
              onSend={sendText}
            />
          )}
        </footer>
      )}

      <VoiceSettingsDialog
        open={settingsOpen && ready}
        onClose={() => setSettingsOpen(false)}
        synthesizer={synthesizer}
        settings={voiceSettings}
        installPrompt={installPrompt}
        desktop={desktop}
      />
    </div>
  );
}
