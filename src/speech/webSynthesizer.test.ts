import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSpeechSynthesizer } from "./webSynthesizer";

describe("WebSpeechSynthesizer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves pending speak() immediately when cancel() is called even if browser omits onend", async () => {
    class FakeUtterance {
      voice: SpeechSynthesisVoice | null = null;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(public readonly text: string) {}
    }

    const synthesis = {
      paused: false,
      getVoices: () => [{ voiceURI: "th-1", name: "Premwadee", lang: "th-TH", default: true }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn(),
      cancel: vi.fn()
    };

    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: synthesis,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis)
    });

    const synth = new WebSpeechSynthesizer();
    let resolved = false;
    const speaking = synth.speak("สวัสดีค่ะคุณไลท์").then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    synth.cancel();
    await speaking;

    expect(resolved).toBe(true);
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
  });

  it("selects male Thai voice automatically when fallback gender is set to male (Javis mode)", async () => {
    const spoken: Array<{ voiceName: string; pitch: number }> = [];

    class FakeUtterance {
      voice: SpeechSynthesisVoice | null = null;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(public readonly text: string) {}
    }

    const synthesis = {
      paused: false,
      getVoices: () => [
        { voiceURI: "th-female", name: "Microsoft Premwadee Online (Natural)", lang: "th-TH", default: true },
        { voiceURI: "th-male", name: "Microsoft Niwat Online (Natural)", lang: "th-TH", default: false }
      ],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      resume: vi.fn(),
      speak: vi.fn((utterance: FakeUtterance) => {
        spoken.push({ voiceName: utterance.voice?.name ?? "", pitch: utterance.pitch });
        queueMicrotask(() => utterance.onend?.());
      }),
      cancel: vi.fn()
    };

    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: synthesis,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis)
    });

    const synth = new WebSpeechSynthesizer();
    await synth.listVoices();

    synth.setFallbackGender("male");
    await synth.speak("สวัสดีครับ จาวิสรับช่วงต่อชั่วคราวครับ");
    expect(spoken[0]?.voiceName).toContain("Niwat");
    expect(spoken[0]?.pitch).toBe(0.96);

    synth.setFallbackGender("female");
    await synth.speak("เดลลูน่ากลับมาแล้วค่ะ");
    expect(spoken[1]?.voiceName).toContain("Premwadee");
  });
});
