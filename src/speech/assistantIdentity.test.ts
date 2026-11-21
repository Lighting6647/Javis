import { describe, expect, it } from "vitest";
import { resolveAssistantIdentity } from "./cloudVoice";

describe("resolveAssistantIdentity", () => {
  it("uses Javis as the primary assistant identity across voice states", () => {
    expect(resolveAssistantIdentity({ mode: "active" })).toBe("javis");
    expect(resolveAssistantIdentity({ mode: "off" })).toBe("javis");
    expect(resolveAssistantIdentity(null)).toBe("javis");
    expect(resolveAssistantIdentity({ mode: "unavailable" })).toBe("javis");
    expect(resolveAssistantIdentity({ mode: "paused", reason: "quota", until: Date.now() + 60_000 })).toBe("javis");
  });
});
