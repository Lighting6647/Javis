import { describe, expect, it } from "vitest";
import type { SavedMeetingRecord } from "./meetingHistory";
import { mergeMeetings, startMeetingSync, toRemoteMeetings, type MeetingSyncDeps } from "./meetingSync";

const meeting = (id: string, startedAt: number, extra: Partial<SavedMeetingRecord> = {}): SavedMeetingRecord => ({
  id,
  startedAt,
  endedAt: startedAt,
  minutes: 1,
  summary: `สรุป ${id}`,
  transcript: "",
  ...extra
});

describe("mergeMeetings", () => {
  it("รวมสองฝั่ง ใหม่สุดก่อน และใช้ของในเครื่องเมื่อมีทั้งสองฝั่ง", () => {
    const merged = mergeMeetings(
      [meeting("mtg-2", 2, { transcript: "บันทึกเต็มในเครื่อง" })],
      [meeting("mtg-1", 1), meeting("mtg-2", 2, { transcript: "ตัดสั้น" })],
      new Set(),
      "light"
    );
    expect(merged.map((item) => item.id)).toEqual(["mtg-2", "mtg-1"]);
    expect(merged[0]?.transcript).toBe("บันทึกเต็มในเครื่อง");
    expect(merged.every((item) => item.owner === "light")).toBe(true);
  });

  it("ไม่นำรายการที่ลบในเครื่องกลับมา และเก็บไม่เกิน 15 ครั้ง", () => {
    const remote = Array.from({ length: 20 }, (_, index) => meeting(`mtg-${index}`, index));
    const merged = mergeMeetings([], remote, new Set(["mtg-19"]), "light");
    expect(merged).toHaveLength(15);
    expect(merged[0]?.id).toBe("mtg-18");
  });

  it("คงเจ้าของเดิมของการประชุมที่เป็นของผู้ใช้อื่นบนเครื่องนี้", () => {
    const merged = mergeMeetings([meeting("mtg-1", 1, { owner: "nurse" })], [], new Set(), "light");
    expect(merged[0]?.owner).toBe("nurse");
  });
});

describe("toRemoteMeetings", () => {
  it("ส่งเฉพาะการประชุมของผู้ใช้คนนี้และรายการรุ่นเก่า ตัดบันทึกเหลือ 20,000 ตัวอักษร", () => {
    const remote = toRemoteMeetings(
      [meeting("mtg-1", 1, { owner: "light", transcript: "ก".repeat(25_000) }), meeting("mtg-2", 2, { owner: "nurse" }), meeting("mtg-3", 3)],
      "light"
    );
    expect(remote.map((item) => item.id)).toEqual(["mtg-1", "mtg-3"]);
    expect(remote[0]?.transcript.length).toBe(20_000);
  });
});

describe("startMeetingSync", () => {
  it("ดึงประวัติจากเซิร์ฟเวอร์มารวม และส่งเฉพาะของผู้ใช้คนนี้ขึ้นไป", async () => {
    let local: SavedMeetingRecord[] = [meeting("mtg-5", 5, { owner: "nurse" }), meeting("mtg-3", 3)];
    const saved: SavedMeetingRecord[][] = [];
    const deps: MeetingSyncDeps = {
      fetchRemote: async () => [meeting("mtg-1", 1)],
      saveRemote: async (items) => {
        saved.push(items);
      },
      store: {
        get: () => local,
        replace: (next) => {
          local = next;
        },
        owner: () => "light",
        subscribeMutations: () => () => undefined
      },
      onSessionChange: () => () => undefined,
      canSync: async () => true
    };
    await startMeetingSync(deps).ready;
    expect(local.map((item) => item.id)).toEqual(["mtg-5", "mtg-3", "mtg-1"]);
    expect(local.find((item) => item.id === "mtg-3")?.owner).toBe("light");
    expect(saved.at(-1)?.map((item) => item.id)).toEqual(["mtg-3", "mtg-1"]);
  });
});
