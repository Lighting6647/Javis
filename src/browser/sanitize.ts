import { safeHttpUrl } from "../conversation/richText";
import {
  FIELD_ID_PATTERN,
  MAX_FIELD_LABEL_LENGTH,
  MAX_FORM_FIELDS,
  type FillResult,
  type FormField,
  type PageContext
} from "./types";

const MAX_OPTIONS = 30;
const MAX_OPTION_LENGTH = 60;
const MAX_TITLE_LENGTH = 120;
const MAX_TYPE_LENGTH = 20;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readField(value: unknown): FormField | null {
  if (!isObject(value)) return null;
  const { id, label, type, options } = value;
  if (typeof id !== "string" || !FIELD_ID_PATTERN.test(id)) return null;
  if (typeof label !== "string" || !label.trim()) return null;

  const field: FormField = {
    id,
    label: label.trim().slice(0, MAX_FIELD_LABEL_LENGTH),
    type: typeof type === "string" && type ? type.slice(0, MAX_TYPE_LENGTH) : "text"
  };
  if (Array.isArray(options)) {
    field.options = options
      .filter((option): option is string => typeof option === "string" && option.trim().length > 0)
      .slice(0, MAX_OPTIONS)
      .map((option) => option.trim().slice(0, MAX_OPTION_LENGTH));
  }
  return field;
}

/**
 * ตรวจข้อมูลที่อ่านกลับมาจากหน้าเว็บภายนอกก่อนนำไปใช้
 * หน้าเว็บนั้นไม่น่าไว้ใจ จึงรับเฉพาะรูปแบบที่กำหนดและตัดส่วนเกินทิ้ง
 */
export function sanitizePageContext(value: unknown): PageContext | null {
  if (!isObject(value)) return null;

  const url = safeHttpUrl(value.url);
  if (!url || !Array.isArray(value.fields)) return null;

  const seen = new Set<string>();
  const fields: FormField[] = [];
  for (const raw of value.fields) {
    const field = readField(raw);
    if (!field || seen.has(field.id) || fields.length >= MAX_FORM_FIELDS) continue;
    seen.add(field.id);
    fields.push(field);
  }

  return {
    url,
    title: typeof value.title === "string" ? value.title.trim().slice(0, MAX_TITLE_LENGTH) : "",
    fields
  };
}

export function sanitizeFillResult(value: unknown, requestedIds: string[]): FillResult {
  if (!isObject(value)) return { filled: 0, missing: requestedIds, failure: "unavailable" };

  const missing = Array.isArray(value.missing)
    ? value.missing.filter((id): id is string => typeof id === "string" && requestedIds.includes(id))
    : [];
  const filled =
    typeof value.filled === "number" && Number.isInteger(value.filled)
      ? Math.min(Math.max(value.filled, 0), requestedIds.length)
      : 0;

  return value.failure === "page-changed" ? { filled: 0, missing: requestedIds, failure: "page-changed" } : { filled, missing };
}
