import { describe, expect, it } from "vitest";
import { audioExtension } from "./transcribe.js";

describe("audioExtension", () => {
  it("รู้จักชนิดไฟล์เสียงที่รองรับ รวมถึงเมื่อมีพารามิเตอร์ต่อท้าย", () => {
    expect(audioExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExtension("Audio/WebM")).toBe("webm");
    expect(audioExtension("audio/mp4")).toBe("mp4");
    expect(audioExtension("audio/mpeg")).toBe("mp3");
    expect(audioExtension("audio/wav")).toBe("wav");
  });

  it.each([undefined, "", "application/json", "video/webm", "audio/x-unknown", "text/html"])(
    "ปฏิเสธชนิดที่ไม่รองรับ: %s",
    (contentType) => {
      expect(audioExtension(contentType)).toBeNull();
    }
  );
});
