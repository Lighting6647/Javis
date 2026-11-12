import { FIELD_ID_PATTERN, MAX_FILL_VALUE_LENGTH, MAX_FORM_FIELDS, type FillValue } from "../browser/types";
import { safeHttpUrl } from "../conversation/richText";
import type { ChatEvent, WebSource } from "../conversation/types";
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
        auto: value.auto === true
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

    default:
      return null;
  }
}
