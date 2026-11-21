import { describe, expect, it } from "vitest";
import { customAppsStore, validateCustomAppPath } from "./customAppsStore";

describe("customAppsStore", () => {
  it("validates safe absolute desktop paths and blocks shell injection", () => {
    expect(validateCustomAppPath("C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe").ok).toBe(true);
    expect(validateCustomAppPath("C:\\Users\\HP\\Desktop\\trade.bat").ok).toBe(true);
    expect(validateCustomAppPath("relative\\app.exe").ok).toBe(false);
    expect(validateCustomAppPath("C:\\app.exe & calc.exe").ok).toBe(false);
    expect(validateCustomAppPath("C:\\notes.txt").ok).toBe(false);
  });

  it("adds, finds, and removes custom desktop apps", () => {
    customAppsStore.resetForTests();
    const added = customAppsStore.add({
      name: "OBS Studio",
      path: "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe"
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(customAppsStore.find("OBS Studio")?.id).toBe(added.app.id);
    expect(customAppsStore.find(added.app.id)?.path).toContain("obs64.exe");

    customAppsStore.remove(added.app.id);
    expect(customAppsStore.get()).toHaveLength(0);
  });
});
