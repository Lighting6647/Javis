import { CloudSun, ListChecks, Newspaper } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ConversationMessage } from "../conversation/types";
import { MessageBubble } from "./MessageBubble";

interface TranscriptProps {
  messages: ConversationMessage[];
  /** ผู้ใช้เลือกคำถามตัวอย่าง */
  onSuggest: (text: string) => void;
  /** เปิดลิงก์ในเบราว์เซอร์ในตัว (เฉพาะแอปเดสก์ท็อป) */
  onOpenLink?: (url: string) => boolean;
  /** ผู้ใช้แตะลิงก์หน้าเว็บของข้อความหนึ่งเอง */
  onLinkOpened: (messageId: string) => void;
  /** ผู้ใช้กดยกเลิกสิ่งที่ Javis เพิ่งจำไว้ */
  onUndoMemory: (messageId: string, memoryId: string) => void;
  /** ข้อความท้ายหน้าเริ่มต้นที่บอกว่าเสียงถูกประมวลผลที่ใด */
  privacyNote: string;
}

const SUGGESTIONS = [
  { icon: Newspaper, text: "ข่าวเด่นวันนี้มีอะไรบ้าง" },
  { icon: CloudSun, text: "เปิดเว็บกรมอุตุนิยมวิทยาให้หน่อย" },
  { icon: ListChecks, text: "ช่วยวางแผนงานสัปดาห์นี้" }
];

export function Transcript({ messages, onSuggest, onOpenLink, onLinkOpened, onUndoMemory, privacyNote }: TranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // เลื่อนตามข้อความล่าสุดเสมอ รวมถึงตอนคำตอบกำลังทยอยเข้ามา
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <section className="welcome">
        {/* ลูกแก้วของธีมเรียบ ธีมโฮโลแกรมมีแกนกลางอยู่บนแผงสถานะแล้ว จึงซ่อนอันนี้ */}
        <div className="core large" aria-hidden>
          <span className="core-heart" />
        </div>
        <span className="welcome-kicker">พร้อมรับคำสั่ง</span>
        <h1>สวัสดีครับ ให้ Javis ช่วยอะไรดี</h1>
        <p>ถามได้ทุกเรื่อง Javis ค้นข้อมูลล่าสุดจากเว็บและเปิดหน้าเว็บให้ได้</p>

        <ul className="suggestions" aria-label="คำถามตัวอย่าง">
          {SUGGESTIONS.map(({ icon: Icon, text }) => (
            <li key={text}>
              <button type="button" onClick={() => onSuggest(text)}>
                <Icon size={17} aria-hidden />
                {text}
              </button>
            </li>
          ))}
        </ul>

        <small>{privacyNote}</small>
      </section>
    );
  }

  return (
    <section className="thread" role="log" aria-live="polite" aria-label="บทสนทนา">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onOpenLink={onOpenLink}
          onLinkOpened={onLinkOpened}
          onUndoMemory={onUndoMemory}
        />
      ))}
      <div ref={endRef} />
    </section>
  );
}
