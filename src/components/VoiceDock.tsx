import { AudioLines, LoaderCircle, Mic, Monitor, SendHorizontal, ShieldCheck, Square } from "lucide-react";
import { type FormEvent, useState } from "react";
import { MESSAGE_LENGTH_LIMIT } from "../conversation/controller";
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
   * จึงแสดงเฉพาะตอนไมโครโฟนปิดหรือใช้ไม่ได้ เพื่อให้ผู้ใช้เปิดไมโครโฟนหรือพิมพ์แทนได้
   */
  alwaysOn: boolean;
  onStart: () => void;
  onStop: () => void;
  onInterrupt: () => void;
  onFinishListening: () => void;
  onSend: (text: string) => void;
  /** อุปกรณ์นี้จับภาพหน้าจอ/หน้าต่างอื่นได้ */
  canCaptureScreen?: boolean;
  /** จับภาพหน้าจอหรือโปรแกรมอื่นให้ AI ช่วยอ่าน */
  onCaptureScreen?: () => Promise<void> | void;
  /** กำลังจับภาพหน้าจออยู่ */
  capturingScreen?: boolean;
  /** มีภาพหน้าจอแนบอยู่และพร้อมส่งกับข้อความถัดไป */
  hasAttachment?: boolean;
}

const ORB_LABEL: Record<Phase, string> = {
  idle: "เริ่มพูดกับนีน่า",
  starting: "กำลังเตรียมไมโครโฟน",
  listening: "พูดจบแล้ว ส่งคำถาม",
  thinking: "หยุดคำตอบแล้วพูดใหม่",
  speaking: "หยุดคำตอบแล้วพูดใหม่"
};

const CAPTION: Record<Phase, string> = {
  idle: "แตะไมโครโฟนเพื่อพูด หรือพิมพ์ข้อความ",
  starting: "กำลังเตรียมไมโครโฟน…",
  listening: "กำลังฟังคุณอยู่…",
  thinking: "กำลังคิดคำตอบ…",
  speaking: "นีน่ากำลังตอบ แตะเพื่อพูดแทรก"
};

function OrbIcon({ phase }: { phase: Phase }) {
  if (phase === "starting") return <LoaderCircle size={24} className="spin" aria-hidden />;
  if (phase === "listening") return <AudioLines size={24} aria-hidden />;
  if (phase === "thinking" || phase === "speaking") return <Square size={18} fill="currentColor" aria-hidden />;
  return <Mic size={24} aria-hidden />;
}

/** แถบควบคุมด้านล่าง: ปุ่มเสียงหนึ่งปุ่มทำทุกจังหวะ (เริ่ม ส่ง พูดแทรก) คู่กับช่องพิมพ์ */
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
  onSend,
  canCaptureScreen,
  onCaptureScreen,
  capturingScreen,
  hasAttachment
}: VoiceDockProps) {
  const [input, setInput] = useState("");

  const handleOrb = () => {
    if (phase === "idle") onStart();
    else if (phase === "listening") onFinishListening();
    else if (phase === "thinking" || phase === "speaking") onInterrupt();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim() || (hasAttachment ? "ช่วยอ่านและอธิบายสิ่งที่เห็นในภาพหน้าจอนี้ให้ฟังหน่อย" : "");
    if (!text) return;
    onSend(text);
    setInput("");
  };

  const heard = phase === "listening" && partial;
  const idle = phase === "idle";
  const caption =
    phase === "thinking" && searching
      ? "กำลังค้นข้อมูลจากเว็บ…"
      : idle && alwaysOn
        ? "แตะไมโครโฟนหนึ่งครั้ง แล้วนีน่าจะฟังตลอดเวลา หรือพิมพ์ข้อความ"
        : CAPTION[phase];
  const orbLabel = idle && alwaysOn ? "เปิดไมโครโฟนให้นีน่าฟังตลอดเวลา" : ORB_LABEL[phase];

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

      <div className="dock-row">
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

        <form className="composer" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={hasAttachment ? "พิมพ์คำถามเกี่ยวกับภาพ หรือกดส่งเพื่อให้นีน่าอ่านเลย…" : "พิมพ์ข้อความถึงนีน่า…"}
            aria-label="ข้อความถึงนีน่า"
            maxLength={MESSAGE_LENGTH_LIMIT}
            enterKeyHint="send"
          />
          {canCaptureScreen && onCaptureScreen && (
            <button
              type="button"
              className="dock-capture-btn"
              onClick={() => void onCaptureScreen()}
              disabled={capturingScreen}
              aria-label="จับภาพหน้าจอหรือโปรแกรมอื่นให้นีน่าอ่าน"
              title="ส่องหน้าจอ / แท็บ / โปรแกรมอื่นให้นีน่าอ่าน"
            >
              <Monitor size={17} aria-hidden />
            </button>
          )}
          <button type="submit" disabled={!input.trim() && !hasAttachment} aria-label="ส่งข้อความ">
            <SendHorizontal size={18} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
