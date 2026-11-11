import { Capacitor } from "@capacitor/core";
import { Globe, LogOut, MessageSquare, Settings2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { browserStore, isDesktopApp } from "./browser/browserStore";
import { AccessGate } from "./components/AccessGate";
import { BrowserView } from "./components/BrowserView";
import { FillCard } from "./components/FillCard";
import { ServerUnreachable, SessionSkeleton } from "./components/SessionFallback";
import { Transcript } from "./components/Transcript";
import { VoiceDock } from "./components/VoiceDock";
import { VoiceSettingsDialog } from "./components/VoiceSettingsDialog";
import { PHASE_LABEL } from "./conversation/messages";
import { useConversation } from "./hooks/useConversation";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useSession } from "./hooks/useSession";

const PRIVACY_NOTE = "เสียงถูกแปลงเป็นข้อความด้วยระบบเสียงของอุปกรณ์หรือเบราว์เซอร์ และส่งเฉพาะข้อความไปยัง AI";
const DESKTOP_PRIVACY_NOTE =
  "ในแอปเดสก์ท็อป เสียงที่อัดจะถูกส่งผ่านเซิร์ฟเวอร์ Javis ไปแปลงเป็นข้อความ และเมื่อเปิดหน้าเว็บ Javis จะส่งเฉพาะชื่อช่องกรอกข้อมูลของหน้านั้นให้ AI";

export default function App() {
  const session = useSession();
  const {
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
    undoMemory
  } = useConversation();
  const installPrompt = useInstallPrompt();
  const browser = useSyncExternalStore(browserStore.subscribe, browserStore.get);
  const { phase, active, messages, partial, notice, onDeviceListening, searching, pendingFillId } = state;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [desktop] = useState(isDesktopApp);

  const ready = session.phase === "signed-in" || session.phase === "open";
  const pageOpen = ready && browser.requestedUrl !== null;
  const showingWeb = pageOpen && browser.visible;
  const pendingFill = messages.find((message) => message.id === pendingFillId)?.fill ?? null;
  const statusLabel = phase === "thinking" && searching ? "กำลังค้นเว็บ" : PHASE_LABEL[phase];
  const platformLabel = desktop ? "แอปเดสก์ท็อป" : Capacitor.isNativePlatform() ? "แอปมือถือ" : "เว็บ";
  const lastReply = [...messages].reverse().find((message) => message.role === "assistant" && message.text)?.text;

  // ออกจากระบบหรือเซสชันหมดอายุ: หยุดเสียง ล้างบทสนทนา และปิดหน้าเว็บของผู้ใช้คนก่อน
  useEffect(() => {
    if (ready) return;
    reset();
    browserStore.close();
  }, [ready, reset]);

  const openSettings = () => {
    // หยุดสนทนาก่อน ไม่เช่นนั้นไมโครโฟนจะได้ยินเสียงตัวอย่าง
    stop();
    setSettingsOpen(true);
  };

  return (
    <div className="app">
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
            <div className={`status-pill ${phase}`} role="status">
              <span className="status-dot" />
              {statusLabel}
            </div>
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

      <main className="app-main">
        <div className="scroll-area" hidden={showingWeb}>
          {session.phase === "checking" && <SessionSkeleton />}
          {session.phase === "unreachable" && <ServerUnreachable onRetry={session.retry} />}
          {session.phase === "signed-out" && <AccessGate onSignIn={session.signIn} />}
          {ready && (
            <Transcript
              messages={messages}
              onSuggest={sendText}
              onOpenLink={desktop ? browserStore.open : undefined}
              onUndoMemory={undoMemory}
              privacyNote={desktop ? DESKTOP_PRIVACY_NOTE : PRIVACY_NOTE}
              phase={phase}
              statusLabel={statusLabel}
              platformLabel={platformLabel}
            />
          )}
        </div>
        {pageOpen && <BrowserView browser={browser} />}
      </main>

      {ready && (
        <footer className="dock">
          {showingWeb && lastReply && !pendingFill && (
            <p className="reply-strip"><strong>Javis</strong> {lastReply}</p>
          )}
          {pendingFill && <FillCard request={pendingFill} onConfirm={confirmFill} onCancel={cancelFill} />}
          {notice && (
            <div className={`toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
              {notice.text}
            </div>
          )}
          <VoiceDock
            phase={phase}
            active={active}
            partial={partial}
            searching={searching}
            onDeviceListening={onDeviceListening}
            onStart={start}
            onStop={stop}
            onInterrupt={interrupt}
            onFinishListening={finishListening}
            onSend={sendText}
          />
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
