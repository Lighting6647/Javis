import { describe, expect, it } from "vitest";
import { resolveAssistantIdentity } from "./cloudVoice";

describe("resolveAssistantIdentity", () => {
  it("uses female assistant identity across voice states", () => {
    expect(resolveAssistantIdentity({ mode: "active" })).toBe("delluna");
    expect(resolveAssistantIdentity({ mode: "off" })).toBe("delluna");
    expect(resolveAssistantIdentity(null)).toBe("delluna");
    expect(resolveAssistantIdentity({ mode: "unavailable" })).toBe("delluna");
    expect(resolveAssistantIdentity({ mode: "paused", reason: "quota", until: Date.now() + 60_000 })).toBe("delluna");
  });
});
