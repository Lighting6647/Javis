import { Mail, PencilLine, Send, X } from "lucide-react";
import { useId, useState } from "react";
import type { EmailDraft } from "../conversation/types";

interface EmailDraftCardProps {
  draft: EmailDraft;
  onSend: (edited: { subject: string; body: string }) => void;
  onCancel: () => void;
}

/**
 * การ์ดร่างอีเมลที่ลูน่าเขียนให้: ผู้ใช้ตรวจผู้รับ แก้หัวเรื่องหรือเนื้อหาได้ แล้วกดส่งเอง
 * อีเมลไม่ถูกส่งจนกว่าจะกดปุ่ม "ส่งอีเมล" ผู้รับแก้ไม่ได้ในการ์ด (มาจากคำสั่งของผู้ใช้หรือผู้ส่งของอีเมลต้นฉบับเท่านั้น)
 */
export function EmailDraftCard({ draft, onSend, onCancel }: EmailDraftCardProps) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const subjectId = useId();
  const bodyId = useId();
  const canSend = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="fill-card email-draft-card" role="group" aria-label="ตรวจร่างอีเมลก่อนส่ง">
      <div className="fill-card-head">
        <Mail size={17} aria-hidden />
        <strong>{draft.mode === "reply" ? "ร่างอีเมลตอบกลับ" : "ร่างอีเมลใหม่"} รอคุณกดส่ง</strong>
      </div>

      {draft.original && (
        <p className="email-draft-original">
          ตอบอีเมลของ {draft.original.from} เรื่อง “{draft.original.subject || "(ไม่มีหัวเรื่อง)"}”
        </p>
      )}

      <dl className="email-draft-fields">
        <dt>ถึง</dt>
        <dd>{draft.to.join(", ")}</dd>
        <dt>
          <label htmlFor={subjectId}>เรื่อง</label>
        </dt>
        <dd>
          {editing ? (
            <input id={subjectId} value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
          ) : (
            <span id={subjectId}>{subject}</span>
          )}
        </dd>
      </dl>

      {editing ? (
        <>
          <label htmlFor={bodyId} className="visually-hidden">
            เนื้อหาอีเมล
          </label>
          <textarea id={bodyId} value={body} rows={6} maxLength={5000} onChange={(event) => setBody(event.target.value)} />
        </>
      ) : (
        <p className="email-draft-body">{body}</p>
      )}

      <p className="settings-note">ลูน่าจะส่งเมื่อคุณกดปุ่มส่งเท่านั้น ส่งแล้วเรียกคืนไม่ได้</p>

      <div className="fill-card-actions">
        <button type="button" className="btn btn-primary" onClick={() => onSend({ subject, body })} disabled={!canSend}>
          <Send size={16} aria-hidden /> ส่งอีเมล
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing((value) => !value)} aria-pressed={editing}>
          <PencilLine size={16} aria-hidden /> {editing ? "แก้เสร็จแล้ว" : "แก้"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <X size={16} aria-hidden /> ยกเลิก
        </button>
      </div>
    </div>
  );
}
