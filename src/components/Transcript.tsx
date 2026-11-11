import { AudioLines, Send } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MESSAGE_LENGTH_LIMIT } from "../conversation/controller";
import type { ConversationMessage } from "../conversation/types";

interface TranscriptProps {
  messages: ConversationMessage[];
  onSend: (text: string) => void;
}

export function Transcript({ messages, onSend }: TranscriptProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // เลื่อนตามข้อความล่าสุดเสมอ รวมถึงตอนคำตอบกำลังทยอยเข้ามา
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="transcript">
      <div className="section-heading">
        <span>บทสนทนา</span>
        <span>{messages.length ? `${messages.length} ข้อความ` : "ยังไม่มีข้อความ"}</span>
      </div>

      <div className="messages" ref={listRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <AudioLines size={24} aria-hidden />
            <p>บทสนทนาจะปรากฏที่นี่เมื่อคุณเริ่มพูดหรือพิมพ์</p>
          </div>
        ) : (
          messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              <span>{message.role === "user" ? "คุณ" : "Javis"}</span>
              {message.text ? (
                <p>{message.text}</p>
              ) : (
                <p className="typing" aria-label="Javis กำลังคิดคำตอบ">
                  <i /><i /><i />
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <form className="text-input" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="พิมพ์ข้อความถึง Javis…"
          aria-label="ข้อความถึง Javis"
          maxLength={MESSAGE_LENGTH_LIMIT}
          enterKeyHint="send"
        />
        <button type="submit" disabled={!input.trim()} aria-label="ส่งข้อความ">
          <Send size={19} aria-hidden />
        </button>
      </form>
    </div>
  );
}
