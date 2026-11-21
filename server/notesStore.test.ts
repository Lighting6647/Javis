import { describe, expect, it } from "vitest";
import { createMemoryNotesStore } from "./notesStore.js";

describe("createMemoryNotesStore", () => {
  it("creates, searches, and deletes notes", async () => {
    const store = createMemoryNotesStore(() => 1_700_000_000_000);
    const added = await store.addNote("light", {
      title: "ประชุมทีม AI",
      content: "สรุปแผนเชื่อม Gmail และ Google Calendar สำหรับ Lighting6647@gmail.com",
      tags: ["Work", "AI"]
    });
    expect(added.rejected).toBe(false);
    expect(added.note?.title).toBe("ประชุมทีม AI");
    expect(added.note?.tags).toEqual(["work", "ai"]);

    const found = await store.searchNotes("light", "calendar");
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(added.note?.id);

    const updated = await store.updateNote("light", added.note!.id, {
      title: "ประชุมทีม AI (อัปเดต)",
      pinned: true,
      tags: ["urgent"]
    });
    expect(updated.rejected).toBe(false);
    expect(updated.note?.pinned).toBe(true);
    expect(updated.note?.tags).toEqual(["urgent"]);

    const deleted = await store.deleteNote("light", added.note!.id);
    expect(deleted).toBe(true);
    expect(await store.listNotes("light")).toHaveLength(0);
  });

  it("rejects sensitive secrets like passwords or OTP", async () => {
    const store = createMemoryNotesStore();
    const res = await store.addNote("light", {
      title: "รหัสผ่านธนาคาร",
      content: "รหัสผ่านคือ 123456"
    });
    expect(res.rejected).toBe(true);
    expect(res.note).toBeNull();
  });
});
