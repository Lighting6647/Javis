import { FIELD_ID_PATTERN, MAX_FILL_VALUE_LENGTH, MAX_FORM_FIELDS, type FillValue } from "../browser/types";
import { safeHttpUrl } from "../conversation/richText";
import type { CalendarChangeProposal, ChatEvent, EmailDraft, WebSource } from "../conversation/types";
import { cleanMemoryText, MEMORY_ID_PATTERN } from "../memory/memoryStore";

const MAX_SOURCES = 6;
/** จำนวนเรื่องที่ยอมให้จำหรือลืมในคำตอบเดียว */
const MAX_MEMORY_CHANGES = 5;
/** แถบคำค้นที่เกี่ยวข้องของ Google ต่อหนึ่งคำตอบ: จำนวนสูงสุด และขนาดสูงสุดของแต่ละแถบ */
const MAX_SUGGESTION_BLOCKS = 3;
const MAX_SUGGESTION_LENGTH = 20_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSource(value: unknown): WebSource | null {
  if (!isObject(value)) return null;
  const url = safeHttpUrl(value.url);
  if (!url) return null;
  return { url, title: typeof value.title === "string" && value.title ? value.title : url };
}

/**
 * แปลงหนึ่งบรรทัด NDJSON จาก backend เป็นเหตุการณ์ที่ตรวจชนิดแล้ว
 * คืน null เมื่อบรรทัดว่าง เสียหาย หรือไม่รู้จัก เพื่อไม่ให้ข้อมูลผิดรูปทำให้คำตอบล้ม
 */
export function parseChatEventLine(line: string): ChatEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;

  switch (value.type) {
    case "delta":
      return typeof value.text === "string" && value.text ? { type: "delta", text: value.text } : null;

    case "status":
      return value.status === "searching" ? { type: "status", status: "searching" } : null;

    case "sources": {
      if (!Array.isArray(value.sources)) return null;
      const sources = value.sources
        .map(readSource)
        .filter((source): source is WebSource => source !== null)
        .slice(0, MAX_SOURCES);
      return sources.length > 0 ? { type: "sources", sources } : null;
    }

    case "open": {
      const url = safeHttpUrl(value.url);
      if (!url) return null;
      return {
        type: "open",
        url,
        title: typeof value.title === "string" && value.title ? value.title : url,
        auto: value.auto === true,
        // แสดงในกรอบได้เฉพาะหน้า https เพราะหน้า Javis เป็น https และเบราว์เซอร์ไม่ยอมให้ใส่หน้า http ไว้ข้างใน
        ...(value.embed === true && url.startsWith("https://") ? { embed: true } : {})
      };
    }

    case "fill": {
      if (!Array.isArray(value.fields)) return null;
      const seen = new Set<string>();
      const fields: FillValue[] = [];
      for (const entry of value.fields) {
        if (!isObject(entry) || fields.length >= MAX_FORM_FIELDS) continue;
        const { id, label, value: text } = entry;
        if (typeof id !== "string" || !FIELD_ID_PATTERN.test(id) || seen.has(id)) continue;
        if (typeof text !== "string" || !text || text.length > MAX_FILL_VALUE_LENGTH) continue;
        seen.add(id);
        fields.push({ id, label: typeof label === "string" && label ? label : id, value: text });
      }
      return fields.length > 0 ? { type: "fill", fields } : null;
    }

    case "memory": {
      const added = Array.isArray(value.added)
        ? value.added.map(cleanMemoryText).filter(Boolean).slice(0, MAX_MEMORY_CHANGES)
        : [];
      const removed = Array.isArray(value.removed)
        ? value.removed
            .filter((id): id is string => typeof id === "string" && MEMORY_ID_PATTERN.test(id))
            .slice(0, MAX_MEMORY_CHANGES)
        : [];
      return added.length > 0 || removed.length > 0 ? { type: "memory", added, removed } : null;
    }

    case "suggestions": {
      if (!Array.isArray(value.html)) return null;
      const html = value.html
        .filter((block): block is string => typeof block === "string" && block.trim().length > 0 && block.length <= MAX_SUGGESTION_LENGTH)
        .slice(0, MAX_SUGGESTION_BLOCKS);
      return html.length > 0 ? { type: "suggestions", html } : null;
    }

    case "email_draft": {
      const draft = readEmailDraft(value.draft);
      return draft ? { type: "email_draft", draft } : null;
    }

    case "calendar_change": {
      const change = readCalendarChange(value.change);
      return change ? { type: "calendar_change", change } : null;
    }

    case "project_action": {
      if (!isObject(value.proposal)) return null;
      const { id, projectId, projectName, action, reason } = value.proposal;
      if (
        typeof id !== "string" ||
        typeof projectId !== "string" ||
        typeof projectName !== "string" ||
        (action !== "build" && action !== "test" && action !== "lint" && action !== "redeploy")
      ) {
        return null;
      }
      return {
        type: "project_action",
        proposal: {
          id,
          projectId,
          projectName,
          action,
          reason: typeof reason === "string" ? reason : ""
        }
      };
    }

    case "open_app": {
      if (!isObject(value.proposal)) return null;
      const { id, appId, appName, reason } = value.proposal;
      if (typeof id !== "string" || typeof appId !== "string" || typeof appName !== "string") {
        return null;
      }
      return {
        type: "open_app",
        proposal: {
          id,
          appId,
          appName,
          reason: typeof reason === "string" ? reason : ""
        }
      };
    }

    case "pc_action": {
      if (!isObject(value.proposal)) return null;
      const { id, kind, title, detail, buttonOnly, expiresAt } = value.proposal;
      const known = (["command", "write", "move", "click", "type", "open"] as const).find((each) => each === kind);
      if (!known || typeof id !== "string" || typeof title !== "string" || typeof detail !== "string" || typeof expiresAt !== "number") return null;
      // ค่าที่อ่านไม่ได้ให้ถือว่าต้องกดปุ่ม ซึ่งเป็นทางที่ระวังกว่า
      return { type: "pc_action", proposal: { id, kind: known, title, detail, buttonOnly: buttonOnly !== false, expiresAt } };
    }

    default:
      return null;
  }
}

const EMAIL_ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const str = (value: unknown, max: number): string | null => (typeof value === "string" && value.length <= max ? value : null);

/** ตรวจร่างอีเมลจากเซิร์ฟเวอร์ ผิดรูปแบบส่วนใดก็ทิ้งทั้งร่าง (ไม่แสดงการ์ดที่ข้อมูลไม่ครบ) */
export function readEmailDraft(value: unknown): EmailDraft | null {
  if (!isObject(value)) return null;
  const id = str(value.id, 100);
  const subject = str(value.subject, 300);
  const body = str(value.body, 6000);
  const mode = value.mode === "reply" || value.mode === "new" ? value.mode : null;
  const to = Array.isArray(value.to) ? value.to.filter((each): each is string => typeof each === "string" && EMAIL_ADDRESS.test(each)) : [];
  if (!id || subject === null || !body || !mode || to.length === 0 || to.length !== (value.to as unknown[]).length || to.length > 5) return null;
  const original =
    isObject(value.original) && typeof value.original.from === "string" && typeof value.original.subject === "string"
      ? { from: value.original.from.slice(0, 300), subject: value.original.subject.slice(0, 300) }
      : undefined;
  const optional = (key: "threadId" | "inReplyTo" | "references", max: number) => {
    const text = str(value[key], max);
    return text ? { [key]: text } : {};
  };
  return {
    id,
    mode,
    to,
    subject,
    body,
    ...(original ? { original } : {}),
    ...optional("threadId", 64),
    ...optional("inReplyTo", 300),
    ...optional("references", 2000)
  };
}

/** ตรวจข้อเสนอแก้หรือยกเลิกนัดจากเซิร์ฟเวอร์ */
export function readCalendarChange(value: unknown): CalendarChangeProposal | null {
  if (!isObject(value)) return null;
  const slot = (raw: unknown) =>
    isObject(raw) && typeof raw.title === "string" && typeof raw.start === "string" && typeof raw.end === "string"
      ? { title: raw.title.slice(0, 200), start: raw.start.slice(0, 60), end: raw.end.slice(0, 60) }
      : null;
  const id = str(value.id, 100);
  const eventId = str(value.eventId, 1024);
  const action = value.action === "update" || value.action === "delete" ? value.action : null;
  const before = slot(value.before);
  const after = value.after === undefined ? undefined : slot(value.after);
  if (!id || !eventId || !action || !before || after === null || (action === "update" && !after)) return null;
  return { id, action, eventId, before, ...(after ? { after } : {}) };
}
