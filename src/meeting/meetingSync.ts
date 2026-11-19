import { sessionStore } from "../services/sessionStore";
import { sessionAllowsSync, startListSync, type ListSyncDeps } from "../services/serverSync";
import { fetchServerMeetings, saveServerMeetings, type ServerMeeting } from "../services/userDataApi";
import { meetingHistoryStore, type SavedMeetingRecord } from "./meetingHistory";

const MAX_HISTORY_ITEMS = 15;
/** เซิร์ฟเวอร์เก็บบันทึกคำพูดไม่เกินนี้ ส่งเท่านี้ก็พอ (บันทึกเต็มยังอยู่ในเครื่อง) */
const MAX_REMOTE_TRANSCRIPT = 20_000;

/** รายการนี้เป็นของผู้ใช้คนนี้ไหม (รายการรุ่นเก่าที่ไม่มีเจ้าของถือเป็นของผู้ใช้ที่ซิงก์อยู่) */
const ownedBy = (record: SavedMeetingRecord, owner: string) => (record.owner ?? owner) === owner;

/**
 * รวมประวัติประชุมในเครื่องกับบนเซิร์ฟเวอร์: รวมตามรหัส ถ้ามีทั้งสองฝั่งใช้ของในเครื่อง (บันทึกคำพูดเต็มกว่า)
 * ตัดรายการที่ผู้ใช้ลบในเครื่องแล้ว เรียงใหม่สุดก่อน และเก็บไม่เกิน 15 ครั้ง
 */
export function mergeMeetings(
  local: readonly SavedMeetingRecord[],
  remote: readonly ServerMeeting[],
  removedIds: ReadonlySet<string>,
  owner: string
): SavedMeetingRecord[] {
  const byId = new Map<string, SavedMeetingRecord>();
  for (const record of remote) {
    if (!removedIds.has(record.id)) byId.set(record.id, { ...record, owner });
  }
  for (const record of local) {
    if (!removedIds.has(record.id)) byId.set(record.id, ownedBy(record, owner) ? { ...record, owner } : record);
  }
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_HISTORY_ITEMS);
}

const sameMeetings = (a: readonly SavedMeetingRecord[], b: readonly SavedMeetingRecord[]) =>
  a.length === b.length &&
  a.every((item, index) => {
    const other = b[index];
    return other !== undefined && item.id === other.id && item.summary === other.summary && (item.owner ?? "") === (other.owner ?? "");
  });

/** รายการที่ส่งขึ้นเซิร์ฟเวอร์ของผู้ใช้คนนี้: เฉพาะการประชุมของเขา ไม่มีช่อง owner และตัดบันทึกให้สั้นพอ */
export function toRemoteMeetings(local: readonly SavedMeetingRecord[], owner: string): SavedMeetingRecord[] {
  return local
    .filter((record) => ownedBy(record, owner))
    .map(({ id, startedAt, endedAt, minutes, summary, transcript }) => ({
      id,
      startedAt,
      endedAt,
      minutes,
      summary,
      transcript: transcript.slice(0, MAX_REMOTE_TRANSCRIPT),
      owner
    }));
}

export type MeetingSyncDeps = Omit<ListSyncDeps<SavedMeetingRecord>, "merge" | "same" | "toRemote">;

/**
 * ซิงก์ประวัติสรุปการประชุมกับเซิร์ฟเวอร์ เหมือนความจำ: รวมตอนเปิดแอป/เปลี่ยนผู้ใช้ และบันทึกกลับเมื่อเพิ่มหรือลบ
 * แต่ละผู้ใช้เห็นประวัติของตัวเองบนอุปกรณ์อื่นได้ และไม่ส่งประวัติของผู้ใช้อื่นบนเครื่องเดียวกันขึ้นบัญชีตัวเอง
 */
export function startMeetingSync(deps: MeetingSyncDeps = defaultDeps()) {
  return startListSync<SavedMeetingRecord>({
    ...deps,
    merge: (local, remote, removed) => mergeMeetings(local, remote, removed, deps.store.owner()),
    same: sameMeetings,
    toRemote: toRemoteMeetings
  });
}

function defaultDeps(): MeetingSyncDeps {
  return {
    fetchRemote: fetchServerMeetings,
    saveRemote: (items) => saveServerMeetings(items.map(({ owner: _owner, ...record }) => record)),
    store: meetingHistoryStore,
    onSessionChange: sessionStore.subscribe,
    canSync: sessionAllowsSync
  };
}
