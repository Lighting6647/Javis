import { afterEach, describe, expect, it, vi } from "vitest";
import { canCaptureScreen, captureScreenImage, encodeCanvasFrame, fitCaptureDimensions, isScreenCaptureVoiceCommand } from "./screenCapture";

const originalMediaDevices = navigator.mediaDevices;

function setMediaDevices(value: MediaDevices | undefined) {
  Object.defineProperty(navigator, "mediaDevices", {
    value,
    configurable: true,
    writable: true
  });
}

afterEach(() => {
  setMediaDevices(originalMediaDevices);
  vi.restoreAllMocks();
});

describe("fitCaptureDimensions", () => {
  it("keeps dimensions unchanged when within max size", () => {
    expect(fitCaptureDimensions(1024, 768)).toEqual({ width: 1024, height: 768 });
  });

  it("scales wide screen proportionally to max 1280px", () => {
    expect(fitCaptureDimensions(2560, 1440)).toEqual({ width: 1280, height: 720 });
  });

  it("falls back safely when metadata dimensions are zero", () => {
    expect(fitCaptureDimensions(0, 0)).toEqual({ width: 1280, height: 720 });
  });
});

describe("encodeCanvasFrame", () => {
  it("encodes a canvas frame to JPEG base64", () => {
    const canvas = {
      width: 640,
      height: 360,
      toDataURL: vi.fn().mockReturnValue("data:image/jpeg;base64,QUJDRA==")
    } as unknown as HTMLCanvasElement;

    expect(encodeCanvasFrame(canvas)).toEqual({
      mimeType: "image/jpeg",
      data: "QUJDRA==",
      width: 640,
      height: 360
    });
  });

  it("retries with lower quality when primary JPEG exceeds 1MB chars", () => {
    const oversized = "A".repeat(1_050_000);
    const compact = "B".repeat(400_000);
    const toDataURL = vi
      .fn()
      .mockReturnValueOnce(`data:image/jpeg;base64,${oversized}`)
      .mockReturnValueOnce(`data:image/jpeg;base64,${compact}`);

    const canvas = { width: 1280, height: 720, toDataURL } as unknown as HTMLCanvasElement;

    const result = encodeCanvasFrame(canvas);
    expect(toDataURL).toHaveBeenNthCalledWith(1, "image/jpeg", 0.82);
    expect(toDataURL).toHaveBeenNthCalledWith(2, "image/jpeg", 0.65);
    expect(result.data).toBe(compact);
  });

  it("throws a clear Thai error when still too large after compression", () => {
    const stillTooBig = "A".repeat(1_200_000);
    const canvas = {
      width: 1280,
      height: 720,
      toDataURL: vi.fn().mockReturnValue(`data:image/jpeg;base64,${stillTooBig}`)
    } as unknown as HTMLCanvasElement;

    expect(() => encodeCanvasFrame(canvas)).toThrow(/ใหญ่เกินไป/);
  });
});

describe("captureScreenImage", () => {
  it("reports unsupported when getDisplayMedia is missing", async () => {
    setMediaDevices({} as MediaDevices);
    expect(canCaptureScreen()).toBe(false);
    await expect(captureScreenImage()).rejects.toThrow(/ยังไม่รองรับ/);
  });

  it("returns null silently when user cancels the screen picker", async () => {
    const canceled = new DOMException("Permission denied by user", "NotAllowedError");
    setMediaDevices({
      getDisplayMedia: vi.fn().mockRejectedValue(canceled)
    } as unknown as MediaDevices);

    await expect(captureScreenImage()).resolves.toBeNull();
  });
});

describe("isScreenCaptureVoiceCommand", () => {
  it("matches voice triggers to open screen picker", () => {
    expect(isScreenCaptureVoiceCommand("ดูหน้าจอให้หน่อย")).toBe(true);
    expect(isScreenCaptureVoiceCommand("ช่วยส่องหน้าจออื่นให้ที")).toBe(true);
    expect(isScreenCaptureVoiceCommand("เดลลูน่า จับภาพหน้าจอ")).toBe(true);
    expect(isScreenCaptureVoiceCommand("DelLuna จับภาพหน้าจอ")).toBe(true);
    expect(isScreenCaptureVoiceCommand("นีน่า จับภาพหน้าจอ")).toBe(true);
    expect(isScreenCaptureVoiceCommand("Nina จับภาพหน้าจอ")).toBe(true);
    expect(isScreenCaptureVoiceCommand("จาวิส จับภาพหน้าจอ")).toBe(true);
    expect(isScreenCaptureVoiceCommand("ดูโปรแกรมที่เปิดอยู่ให้หน่อย")).toBe(true);
  });

  it("does not intercept standard screen-reading or image-analysis prompts", () => {
    expect(isScreenCaptureVoiceCommand("อ่านข้อมูลที่แสดงอยู่บนหน้าจอตอนนี้ให้ฟังหน่อย")).toBe(false);
    expect(isScreenCaptureVoiceCommand("ช่วยอ่านและอธิบายสิ่งที่เห็นในภาพหน้าจอนี้ให้ฟังหน่อย")).toBe(false);
    expect(isScreenCaptureVoiceCommand("ราคาทองวันนี้เท่าไหร่")).toBe(false);
  });
});
