import { AudioLines, Mic, Sparkles, Volume2 } from "lucide-react";
import type { Phase } from "../conversation/types";

interface VoiceStageProps {
  phase: Phase;
  partial: string;
  onStart: () => void;
  onFinishListening: () => void;
  onInterrupt: () => void;
}

const ORB_LABEL: Record<Phase, string> = {
  idle: "เริ่มคุยกับ Javis",
  starting: "กำลังเตรียมไมโครโฟน",
  listening: "พูดจบแล้ว ส่งคำถาม",
  thinking: "หยุดคำตอบแล้วพูดใหม่",
  speaking: "หยุดคำตอบแล้วพูดใหม่"
};

const CAPTION: Record<Phase, string> = {
  idle: "แตะเพื่อเริ่มการสนทนา",
  starting: "กำลังเตรียมไมโครโฟน…",
  listening: "กำลังฟังคุณอยู่…",
  thinking: "กำลังคิดคำตอบ…",
  speaking: "Javis กำลังตอบ แตะเพื่อพูดแทรก"
};

function OrbIcon({ phase }: { phase: Phase }) {
  if (phase === "listening") return <Mic size={46} aria-hidden />;
  if (phase === "thinking") return <Sparkles size={44} aria-hidden />;
  if (phase === "speaking") return <AudioLines size={48} aria-hidden />;
  return <Volume2 size={44} aria-hidden />;
}

export function VoiceStage({ phase, partial, onStart, onFinishListening, onInterrupt }: VoiceStageProps) {
  const handlePress = () => {
    if (phase === "idle") onStart();
    else if (phase === "listening") onFinishListening();
    else if (phase === "thinking" || phase === "speaking") onInterrupt();
  };

  const heard = phase === "listening" && partial;

  return (
    <div className={`orb-stage ${phase}`}>
      <div className="orb-ring ring-one" />
      <div className="orb-ring ring-two" />
      <button
        type="button"
        className="voice-orb"
        onClick={handlePress}
        disabled={phase === "starting"}
        aria-label={ORB_LABEL[phase]}
      >
        <OrbIcon phase={phase} />
      </button>
      <p className={heard ? "live-caption heard" : "live-caption"} aria-live="polite">
        {heard ? partial : CAPTION[phase]}
      </p>
    </div>
  );
}
