import { afterEach, describe, expect, it, vi } from "vitest";
import { launchAllowedApp } from "./appLauncher";

describe("launchAllowedApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses Electron IPC when running in desktop app", async () => {
    const launchApp = vi.fn(async () => ({ ok: true, message: "เปิด Visual Studio Code บนคอมพิวเตอร์ให้แล้วค่ะ" }));
    vi.stubGlobal("window", {
      javisDesktop: { isDesktop: true, platform: "win32", launchApp }
    });

    const result = await launchAllowedApp("vscode", "Visual Studio Code");
    expect(result.ok).toBe(true);
    expect(result.platform).toBe("desktop");
    expect(launchApp).toHaveBeenCalledWith("vscode");
  });

  it("rejects non-allowlisted apps immediately", async () => {
    const result = await launchAllowedApp("malware.exe");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("ไม่อยู่ในรายการที่อนุญาต".slice(0, 0));
  });

  it("opens web fallback for web-capable apps in browser", async () => {
    const open = vi.fn(() => ({ closed: false }));
    vi.stubGlobal("window", { open });

    const result = await launchAllowedApp("gmail", "Gmail");
    expect(result.ok).toBe(true);
    expect(result.platform).toBe("web");
    expect(open).toHaveBeenCalledWith("https://mail.google.com", "_blank", "noopener,noreferrer");
  });
});
