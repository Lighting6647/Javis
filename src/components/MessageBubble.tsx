import { Ban, Brain, CircleAlert, CircleCheck, ClipboardPen, ExternalLink, Globe } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { describeLinkStatus, needsPopupHelp } from "../conversation/pageLink";
import { hostOf, sourceLabel, splitLinks } from "../conversation/richText";
import type { ConversationMessage, FillRequest } from "../conversation/types";
import { PopupHelp } from "./PopupHelp";
import { SearchSuggestions } from "./SearchSuggestions";

interface MessageBubbleProps {
  message: ConversationMessage;
  /**
   * เปิดลิงก์ในเบราว์เซอร์ในตัวของแอปเดสก์ท็อป คืน true ถ้าเปิดให้แล้ว
   * ถ้าไม่ได้ส่งมาหรือคืน false ลิงก์จะเปิดแท็บใหม่ตามปกติ
   */
  onOpenLink?: (url: string) => boolean;
  /** ผู้ใช้แตะลิงก์หน้าเว็บของข้อความนี้เอง */
  onLinkOpened?: (messageId: string) => void;
  /** ผู้ใช้กดยกเลิกสิ่งที่ Javis เพิ่งจำไว้ในข้อความนี้ */
  onUndoMemory?: (messageId: string, memoryId: string) => void;
}

interface WebLinkProps {
  url: string;
  className?: string;
  title?: string;
  onOpenLink?: (url: string) => boolean;
  /** เรียกเมื่อผู้ใช้แตะลิงก์ ไม่ว่าจะเปิดในแท็บใหม่หรือในเบราว์เซอร์ในตัว */
  onOpened?: () => void;
  children: ReactNode;
}

function WebLink({ url, className, title, onOpenLink, onOpened, children }: WebLinkProps) {
  const handleClick = (event: MouseEvent) => {
    if (onOpenLink?.(url)) event.preventDefault();
    onOpened?.();
  };
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className} title={title} onClick={handleClick}>
      {children}
    </a>
  );
}

const FILL_SUMMARY: Record<FillRequest["status"], { icon: typeof Ban; text: (request: FillRequest) => string }> = {
  pending: { icon: ClipboardPen, text: (request) => `รอยืนยันการกรอก ${request.fields.length} ช่อง` },
  filled: { icon: CircleCheck, text: (request) => `กรอกแล้ว ${request.filledCount ?? request.fields.length} ช่อง` },
  cancelled: { icon: Ban, text: () => "ยกเลิกการกรอกแล้ว" },
  failed: { icon: CircleAlert, text: () => "กรอกไม่สำเร็จ" }
};

export function MessageBubble({ message, onOpenLink, onLinkOpened, onUndoMemory }: MessageBubbleProps) {
  const fromUser = message.role === "user";
  const fill = message.fill ? FILL_SUMMARY[message.fill.status] : null;

  return (
    <article className={`message ${message.role}`}>
      <span className="message-author">{fromUser ? "คุณ" : "Javis"}</span>

      {!message.text ? (
        <p className="typing" aria-label="Javis กำลังคิดคำตอบ">
          <i /><i /><i />
        </p>
      ) : fromUser ? (
        <p>{message.text}</p>
      ) : (
        <p>
          {splitLinks(message.text).map((segment, index) =>
            segment.type === "text" ? (
              segment.text
            ) : (
              <WebLink key={index} url={segment.url} className="inline-source" onOpenLink={onOpenLink}>
                {segment.label}
              </WebLink>
            )
          )}
        </p>
      )}

      {message.link && (
        <WebLink
          url={message.link.url}
          className={`page-link${message.link.blocked ? " blocked" : ""}`}
          onOpenLink={onOpenLink}
          onOpened={() => onLinkOpened?.(message.id)}
        >
          <ExternalLink size={18} aria-hidden />
          <span>
            <strong>{message.link.title}</strong>
            <small>
              {hostOf(message.link.url)} · {describeLinkStatus(message.link)}
            </small>
          </span>
        </WebLink>
      )}
      {message.link && needsPopupHelp(message.link) && <PopupHelp />}

      {message.fill && fill && (
        <span className={`fill-status ${message.fill.status}`}>
          <fill.icon size={14} aria-hidden /> {fill.text(message.fill)}
        </span>
      )}

      {message.memoryNotes?.map((note, index) => (
        <span className={`memory-note ${note.undone ? "undone" : note.kind}`} key={`${note.id ?? note.text}-${index}`}>
          <Brain size={14} aria-hidden />
          <span>
            {note.undone ? "ยกเลิกการจำแล้ว" : note.kind === "added" ? "จำไว้แล้ว" : "ลืมแล้ว"}: {note.text}
          </span>
          {note.kind === "added" && !note.undone && note.id && onUndoMemory && (
            <button type="button" onClick={() => onUndoMemory(message.id, note.id as string)}>
              ยกเลิก
            </button>
          )}
        </span>
      ))}

      {message.sources && message.sources.length > 0 && (
        <div className="sources">
          <span className="sources-label"><Globe size={12} aria-hidden /> แหล่งที่มา</span>
          <ul>
            {message.sources.map((source) => (
              <li key={source.url}>
                <WebLink url={source.url} title={source.title} onOpenLink={onOpenLink}>
                  {sourceLabel(source)}
                </WebLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      {message.suggestions && message.suggestions.length > 0 && <SearchSuggestions blocks={message.suggestions} />}
    </article>
  );
}
