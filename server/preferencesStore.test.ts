import { describe, expect, it } from "vitest";
import { createMemoryPreferencesStore } from "./preferencesStore.js";

describe("createMemoryPreferencesStore", () => {
  it("stores and sanitizes voice contacts and custom desktop apps", async () => {
    const store = createMemoryPreferencesStore(() => 1_700_000_000_000);
    const saved = await store.putPreferences("light", {
      contacts: [
        { id: "c1", name: "คุณแม่", aliases: ["แม่"], phone: "081-234-5678", createdAt: 1 },
        { id: "c-bad", name: "Invalid", phone: "not-a-phone", createdAt: 2 }
      ],
      customApps: [
        { id: "a1", name: "OBS", path: "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", createdAt: 1 },
        { id: "a-bad", name: "Bad", path: "C:\\bad.exe & calc.exe", createdAt: 2 }
      ]
    });

    expect(saved.contacts).toHaveLength(1);
    expect(saved.contacts[0]?.phone).toBe("0812345678");
    expect(saved.customApps).toHaveLength(1);
    expect(saved.customApps[0]?.name).toBe("OBS");

    const loaded = await store.getPreferences("light");
    expect(loaded.contacts).toHaveLength(1);
    expect(loaded.customApps).toHaveLength(1);
  });
});
