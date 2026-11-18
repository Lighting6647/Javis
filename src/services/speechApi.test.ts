import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudVoiceError } from "../speech/cloudVoice";
import { cloudVoiceStore } from "./aiStatusStore";
import { fetchCloudSpeech } from "./speechApi";

describe("fetchCloudSpeech", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cloudVoiceStore.set(true);
  });

  it("ส่งข้อความและโทนเสียงที่เลือกแล้วคืน Blob เสียงเมื่อสำเร็จ", async () => {
    const audioBlob = new Blob(["RIFFtest"], { type: "audio/wav" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(audioBlob, { status: 200, headers: { "Content-Type": "audio/wav" } })
    );

    const result = await fetchCloudSpeech("สวัสดีครับ", "Zephyr", new AbortController().signal);
    expect(result.size).toBe(audioBlob.size);

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ text: "สวัสดีครับ", voice: "Zephyr" });
  });

  it("แปลง 429 และ Retry-After เป็น CloudVoiceError(quota, retryAfterMs)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "quota", retryAfterSeconds: 45 }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "45" }
      })
    );

    await expect(fetchCloudSpeech("ทดสอบ", null, new AbortController().signal)).rejects.toMatchObject({
      name: "CloudVoiceError",
      kind: "quota",
      retryAfterMs: 45_000
    } satisfies Partial<CloudVoiceError>);
  });

  it("เมื่อเซิร์ฟเวอร์ตอบ unavailable จะอัปเดต cloudVoiceStore เป็น false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "unavailable" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(fetchCloudSpeech("ทดสอบ", null, new AbortController().signal)).rejects.toMatchObject({
      kind: "unavailable"
    });
    expect(cloudVoiceStore.get()).toBe(false);
  });
});
