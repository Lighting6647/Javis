import { LogOut, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AccessGate } from "./components/AccessGate";
import { ConversationControls } from "./components/ConversationControls";
import { ServerUnreachable, SessionSkeleton } from "./components/SessionFallback";
import { Transcript } from "./components/Transcript";
import { VoiceSettingsDialog } from "./components/VoiceSettingsDialog";
import { VoiceStage } from "./components/VoiceStage";
import { PHASE_LABEL } from "./conversation/messages";
import { useConversation } from "./hooks/useConversation";
import { useSession } from "./hooks/useSession";

export default function App() {
  const session = useSession();
  const { state, synthesizer, voiceSettings, start, stop, reset, interrupt, finishListening, sendText } =
    useConversation();
  const { phase, active, messages, partial, notice, onDeviceListening } = state;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const ready = session.phase === "signed-in" || session.phase === "open";

  const openSettings = () => {
    // หยุดสนทนาก่อน ไม่เช่นนั้นไมโครโฟนจะได้ยินเสียงตัวอย่าง
    stop();
    setSettingsOpen(true);
  };

  // ออกจากระบบหรือเซสชันหมดอายุ: หยุดเสียงและล้างบทสนทนาของผู้ใช้คนก่อน
  useEffect(() => {
    if (!ready) reset();
  }, [ready, reset]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={19} aria-hidden /></div>
          <div><strong>Javis</strong><span>Thai Voice Agent</span></div>
        </div>
        <div className="topbar-actions">
          {ready && (
            <div className={`status-pill ${phase}`} role="status">
              <span className="status-dot" />
              {PHASE_LABEL[phase]}
            </div>
          )}
          {ready && (
            <button type="button" className="icon-button" onClick={openSettings} aria-label="ตั้งค่าเสียง">
              <SlidersHorizontal size={17} aria-hidden />
            </button>
          )}
          {session.userName && (
            <div className="user-chip">
              <span title={session.userName}>{session.userName}</span>
              <button type="button" onClick={session.signOut} aria-label="ออกจากระบบ">
                <LogOut size={16} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">
          <ShieldCheck size={16} aria-hidden />
          {onDeviceListening
            ? "เสียงของคุณถูกแปลงเป็นข้อความในเครื่อง ไม่ออกจากอุปกรณ์"
            : "ฟังและพูดด้วยระบบเสียงของอุปกรณ์"}
        </div>
        <h1>ผู้ช่วยที่พร้อมฟัง<br /><em>และเข้าใจภาษาไทย</em></h1>
        <p>ถามงาน วางแผน หรือระดมความคิดได้อย่างเป็นธรรมชาติ ทั้งบนเว็บและมือถือ</p>
      </section>

      <section className="conversation-card">
        {session.phase === "checking" && <SessionSkeleton />}
        {session.phase === "unreachable" && <ServerUnreachable onRetry={session.retry} />}
        {session.phase === "signed-out" && <AccessGate onSignIn={session.signIn} />}
        {ready && (
          <>
            <VoiceStage
              phase={phase}
              partial={partial}
              onStart={start}
              onFinishListening={finishListening}
              onInterrupt={interrupt}
            />
            <ConversationControls
              phase={phase}
              active={active}
              onStart={start}
              onInterrupt={interrupt}
              onStop={stop}
            />
            {notice && (
              <div className={`notice-banner ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
                {notice.text}
              </div>
            )}
            <Transcript messages={messages} onSend={sendText} />
          </>
        )}
      </section>

      <VoiceSettingsDialog
        open={settingsOpen && ready}
        onClose={() => setSettingsOpen(false)}
        synthesizer={synthesizer}
        settings={voiceSettings}
      />

      <footer>
        เสียงถูกแปลงเป็นข้อความด้วยระบบเสียงของอุปกรณ์หรือเบราว์เซอร์ · ส่งเฉพาะข้อความไปยัง AI · API key ไม่ถูกส่งมายังอุปกรณ์
      </footer>
    </main>
  );
}
