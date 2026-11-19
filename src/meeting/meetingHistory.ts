/** ประวัติสรุปการประชุมที่บันทึกไว้ในเครื่อง (LocalStorage) */
export interface SavedMeetingRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  summary: string;
  transcript: string;
}

const STORAGE_KEY = "javis.meetingHistory";
const MAX_HISTORY_ITEMS = 15;

function isValidRecord(item: unknown): item is SavedMeetingRecord {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<SavedMeetingRecord>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.startedAt === "number" &&
    Number.isFinite(candidate.startedAt) &&
    typeof candidate.minutes === "number" &&
    Number.isFinite(candidate.minutes) &&
    typeof candidate.summary === "string" &&
    candidate.summary.trim().length > 0 &&
    typeof candidate.transcript === "string"
  );
}

function loadHistory(): SavedMeetingRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidRecord)
      .slice(0, MAX_HISTORY_ITEMS)
      .map((item) => ({
        ...item,
        endedAt: typeof item.endedAt === "number" && Number.isFinite(item.endedAt) ? item.endedAt : item.startedAt
      }));
  } catch {
    return [];
  }
}

let history: SavedMeetingRecord[] = loadHistory();
const listeners = new Set<() => void>();

function commitHistory(next: SavedMeetingRecord[]): void {
  history = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ข้ามได้หากพื้นที่จัดเก็บในเบราว์เซอร์เต็ม
  }
  listeners.forEach((l) => l());
}

/** ที่เก็บประวัติสรุปการประชุมย้อนหลังในเครื่อง รองรับการลบรายรายการและล้างทั้งหมด */
export const meetingHistoryStore = {
  get: (): readonly SavedMeetingRecord[] => history,
  add: (entry: { startedAt: number; minutes: number; summary: string; transcript: string; endedAt?: number }): SavedMeetingRecord => {
    const now = entry.endedAt ?? Date.now();
    const record: SavedMeetingRecord = {
      id: `mtg-${entry.startedAt}`,
      startedAt: entry.startedAt,
      endedAt: now,
      minutes: Math.max(0, Math.round(entry.minutes)),
      summary: entry.summary.trim(),
      transcript: entry.transcript.trim()
    };
    const deduplicated = history.filter((item) => item.startedAt !== record.startedAt && item.id !== record.id);
    const next = [record, ...deduplicated].slice(0, MAX_HISTORY_ITEMS);
    commitHistory(next);
    return record;
  },
  remove: (id: string): void => {
    const next = history.filter((item) => item.id !== id);
    if (next.length === history.length) return;
    commitHistory(next);
  },
  clear: (): void => {
    if (history.length === 0) return;
    commitHistory([]);
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};

/**
 * ค้นหาบันทึกการประชุมในเครื่องตามคำสำคัญ ชื่อผู้พูด หรือหัวข้องาน
 * คำถามทั่วไปเช่น "ครั้งก่อน" หรือข้อความว่างจะคืนรายการล่าสุดทั้งหมด
 */
export function searchMeetingHistory(query: string, records: readonly SavedMeetingRecord[] = history): SavedMeetingRecord[] {
  const cleaned = query.trim().toLowerCase();
  if (!cleaned || /^(?:ล่าสุด|ครั้งก่อน|ครั้งที่แล้ว|ทั้งหมด)$/.test(cleaned)) {
    return [...records];
  }
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return records
    .map((record) => {
      const haystack = `${record.summary}\n${record.transcript}`.toLowerCase();
      const hits = tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);
      return { record, hits };
    })
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.record.startedAt - a.record.startedAt)
    .map((item) => item.record);
}
