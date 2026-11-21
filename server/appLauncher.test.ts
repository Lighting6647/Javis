import { describe, expect, it } from "vitest";
import { resolveAllowedApp } from "./appLauncher.js";

describe("appLauncher allowlist", () => {
  it("resolves exact IDs and Thai/English aliases", () => {
    expect(resolveAllowedApp("vscode")?.id).toBe("vscode");
    expect(resolveAllowedApp("เครื่องคิดเลข")?.id).toBe("calculator");
    expect(resolveAllowedApp("ไลน์")?.id).toBe("line");
    expect(resolveAllowedApp("Google Calendar")?.id).toBe("calendar");
  });

  it("rejects arbitrary shell commands or unknown apps", () => {
    expect(resolveAllowedApp("rm -rf /")).toBeNull();
    expect(resolveAllowedApp("powershell -c whoami")).toBeNull();
    expect(resolveAllowedApp("")).toBeNull();
    expect(resolveAllowedApp(null)).toBeNull();
  });
});
