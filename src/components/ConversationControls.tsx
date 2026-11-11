import { CircleStop, Mic } from "lucide-react";
import type { Phase } from "../conversation/types";

interface ConversationControlsProps {
  phase: Phase;
  active: boolean;
  onStart: () => void;
  onInterrupt: () => void;
  onStop: () => void;
}

export function ConversationControls({ phase, active, onStart, onInterrupt, onStop }: ConversationControlsProps) {
  if (!active) {
    return (
      <div className="primary-controls">
        <button type="button" className="start-button" onClick={onStart}>
          <Mic size={22} aria-hidden />
          เริ่มคุยกับ Javis
        </button>
      </div>
    );
  }

  const answering = phase === "thinking" || phase === "speaking";

  return (
    <div className="primary-controls">
      <button
        type="button"
        className="round-button"
        onClick={onInterrupt}
        disabled={!answering}
        aria-label="หยุดคำตอบแล้วพูดใหม่"
      >
        <CircleStop aria-hidden />
      </button>
      <button type="button" className="end-button" onClick={onStop}>
        จบการสนทนา
      </button>
    </div>
  );
}
