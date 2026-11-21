import { describe, expect, it } from "vitest";
import { resolveAssistantIdentity } from "./cloudVoice";

describe("resolveAssistantIdentity", () => {
  it("keeps DelLuna as primary when cloud voice is active, off, or unknown", () => {
    expect(resolveAssistantIdentity({ mode: "active" })).toBe("delluna");
    expect(resolveAssistantIdentity({ mode: "off" })).toBe("delluna");
    expect(resolveAssistantIdentity(null)).toBe("delluna");
  });

  it("switches to Javis automatically when DelLuna cloud voice is paused or unavailable", () => {
    expect(resolveAssistantIdentity({ mode: "unavailable" })).toBe("javis");
    expect(resolveAssistantIdentity({ mode: "paused", reason: "quota", until: Date.now() + 60_000 })).toBe("javis");
    expect(resolveAssistantIdentity({ mode: "paused", reason: "failed", until: Date.now() + 60_000 })).toBe("javis");
  });
});
