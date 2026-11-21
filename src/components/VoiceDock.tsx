import { AudioLines, LoaderCircle, Mic, Monitor, ShieldCheck, Square } from "lucide-react";
import type { Phase } from "../conversation/types";
import { HoloRings } from "./HoloCore";

interface VoiceDockProps {
  phase: Phase;
  active: boolean;
  partial: string;
  /** AI กำลังค้นข้อมูลจากเว็บก่อนตอบ */
  searching: boolean;
  /** เสียงถูกแปลงเป็นข้อความภายในอุปกรณ์ */
  onDeviceListening: boolean;
  /**
   * ที่นี่ฟังตลอดเวลาได้: ปุ่มไมโครโฟนเปิดการฟังค้างไว้ และแถบนี้จะหายไประหว่างที่ฟังอยู่
   * จึงแสดงเฉพาะตอนไมโครโฟนปิดหรือใช้ไม่ได้ เพื่อให้ผู้ใช้เปิดไมโครโฟนสั่งงานด้วยเสียง
   */
  alwaysOn: boolean;
  onStart: () => void;
  onStop: () => void;
  onInterrupt: () => void;
  onFinishListening: () => void;
  /** อุปกรณ์นี้จับภาพหน้าจอ/หน้าต่างอื่นได้ */
  canCaptureScreen?: boolean;
  /** จับภาพหน้าจอหรือโปรแกรมอื่นให้ AI ช่วยอ่าน */
  onCaptureScreen?: () => Promise<void> | void;
  /** กำลังจับภาพหน้าจออยู่ */
  capturingScreen?: boolean;
}

const ORB_LABEL: Record<Phase, string> = {
  idle: "เริ่มพูดสั่งงาน Jarvis",
  starting: "กำลังเตรียมไมโครโฟน",
  listening: "พูดจบแล้ว ส่งคำสั่งเสียง",
  thinking: "หยุดคำตอบแล้วพูดใหม่",
  speaking: "หยุดคำตอบแล้วพูดใหม่"
};

const CAPTION: Record<Phase, string> = {
  idle: "แตะไมโครโฟนเพื่อพูดสั่งงาน Jarvis",
  starting: "กำลังเตรียมไมโครโฟน…",
  listening: "กำลังฟังคำสั่งเสียงอยู่…",
  thinking: "กำลังคิดคำตอบ…",
  speaking: "Jarvis กำลังตอบ แตะเพื่อพูดแทรก"
};

function OrbIcon({ phase }: { phase: Phase }) {
  if (phase === "starting") return <LoaderCircle size={24} className="spin" aria-hidden />;
  if (phase === "listening") return <AudioLines size={24} aria-hidden />;
  if (phase === "thinking" || phase === "speaking") return <Square size={18} fill="currentColor" aria-hidden />;
  return <Mic size={24} aria-hidden />;
}

/** แถบควบคุมเสียงด้านล่าง (Pure Voice-First ไม่มีช่องพิมพ์แชท) */
export function VoiceDock({
  phase,
  active,
  partial,
  searching,
  onDeviceListening,
  alwaysOn,
  onStart,
  onStop,
  onInterrupt,
  onFinishListening,
  canCaptureScreen,
  onCaptureScreen,
  capturingScreen
}: VoiceDockProps) {
  const handleOrb = () => {
    if (phase === "idle") onStart();
    else if (phase === "listening") onFinishListening();
    else if (phase === "thinking" || phase === "speaking") onInterrupt();
  };

  const heard = phase === "listening" && partial;
  const idle = phase === "idle";
  const caption =
    phase === "thinking" && searching
      ? "กำลังค้นข้อมูลจากเว็บ…"
      : idle && alwaysOn
        ? "แตะไมโครโฟนหนึ่งครั้ง แล้ว Javis จะฟังคำสั่งเสียงตลอดเวลา"
        : CAPTION[phase];
  const orbLabel = idle && alwaysOn ? "เปิดไมโครโฟนให้ Javis ฟังตลอดเวลา" : ORB_LABEL[phase];

  return (
    <div className="dock-inner">
      <div className="dock-status">
        <p className={heard ? "caption heard" : "caption"} aria-live="polite">
          {heard ? partial : caption}
        </p>
        {onDeviceListening && (
          <span className="chip" title="เสียงของคุณถูกแปลงเป็นข้อความในเครื่อง ไม่ออกจากอุปกรณ์">
            <ShieldCheck size={13} aria-hidden /> ฟังในเครื่อง
          </span>
        )}
        {active && (
          <button type="button" className="btn btn-quiet" onClick={onStop}>
            จบการสนทนา
          </button>
        )}
      </div>

      <div className="dock-row voice-only">
        <div className={`core small ${phase}`}>
          <HoloRings />
          <button
            type="button"
            className={`orb ${phase}`}
            onClick={handleOrb}
            disabled={phase === "starting"}
            aria-label={orbLabel}
          >
            <OrbIcon phase={phase} />
          </button>
        </div>
        {canCaptureScreen && onCaptureScreen && (
          <button
            type="button"
            className="dock-capture-btn"
            onClick={() => void onCaptureScreen()}
            disabled={capturingScreen}
            aria-label="จับภาพหน้าจอหรือโปรแกรมอื่นให้ Javis อ่าน"
            title="ส่องหน้าจอ / แท็บ / โปรแกรมอื่นให้ Javis อ่าน"
          >
            <Monitor size={18} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
