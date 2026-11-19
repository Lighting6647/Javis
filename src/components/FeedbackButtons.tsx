import { Check, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { sendFeedback, type FeedbackRating } from "../services/userDataApi";

interface FeedbackButtonsProps {
  /** ข้อความคำตอบที่ถูกติชม ส่งไปพร้อมคำติชมเพื่อใช้วิเคราะห์ปรับปรุงคำตอบ */
  reply: string;
  /** ส่งคำติชม (แทนที่ได้ในเทสต์) */
  submit?: typeof sendFeedback;
}

type Status = "idle" | "noting" | "sending" | "sent" | "error";

const MAX_NOTE_LENGTH = 500;

/** ปุ่ม 👍/👎 ใต้คำตอบ กด 👎 แล้วเขียนหมายเหตุสั้น ๆ ได้ (ไม่บังคับ) */
export function FeedbackButtons({ reply, submit = sendFeedback }: FeedbackButtonsProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [note, setNote] = useState("");
  const noteId = useId();

  const send = async (chosen: FeedbackRating, text = "") => {
    setRating(chosen);
    setStatus("sending");
    try {
      await submit({ rating: chosen, note: text.trim() || undefined, reply: reply.slice(0, 1200) });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  const onSubmitNote = (event: FormEvent) => {
    event.preventDefault();
    void send("down", note);
  };

  if (status === "sent") {
    return (
      <span className="feedback-status" role="status">
        <Check size={13} aria-hidden /> {rating === "up" ? "ขอบคุณสำหรับคำติชมค่ะ" : "รับทราบค่ะ จะนำไปปรับปรุงคำตอบนะคะ"}
      </span>
    );
  }

  if (status === "noting") {
    return (
      <form className="feedback-note" onSubmit={onSubmitNote}>
        <label className="visually-hidden" htmlFor={noteId}>
          บอกเพิ่มว่าคำตอบนี้ไม่ดีตรงไหน
        </label>
        <input
          id={noteId}
          value={note}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="ไม่ดีตรงไหนคะ (ไม่บังคับ)"
          onChange={(event) => setNote(event.target.value)}
          autoFocus
        />
        <button type="submit" aria-label="ส่งคำติชม">
          <Send size={14} aria-hidden />
        </button>
        <button type="button" aria-label="ยกเลิก" onClick={() => setStatus("idle")}>
          <X size={14} aria-hidden />
        </button>
      </form>
    );
  }

  const busy = status === "sending";
  return (
    <div className="feedback-buttons" role="group" aria-label="ให้คะแนนคำตอบนี้">
      <button type="button" aria-label="คำตอบนี้ดี" title="คำตอบนี้ดี" disabled={busy} onClick={() => void send("up")}>
        <ThumbsUp size={14} aria-hidden />
      </button>
      <button type="button" aria-label="คำตอบนี้ไม่ดี" title="คำตอบนี้ไม่ดี" disabled={busy} onClick={() => setStatus("noting")}>
        <ThumbsDown size={14} aria-hidden />
      </button>
      {status === "error" && (
        <span className="feedback-error" role="alert">
          ส่งคำติชมไม่สำเร็จ ลองใหม่ได้ค่ะ
        </span>
      )}
    </div>
  );
}
