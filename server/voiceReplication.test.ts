import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import type { CloudVoice } from "./speech.js";
import { createVoiceReplicationHandlers, resolveVoicesBaseUrl, THAI_CONSENT_PHRASE } from "./voiceReplication.js";

const VOICE: CloudVoice = {
  apiKey: "test-gemini-key",
  url: "https://generativelanguage.googleapis.com/v1beta/interactions",
  model: "gemini-3.8-flash-tts",
  voice: "Leda",
  style: "natural"
};

const VALID_WAV_B64 = Buffer.alloc(10_000, 1).toString("base64");

describe("createVoiceReplicationHandlers", () => {
  let close: () => Promise<void> = async () => undefined;

  afterEach(() => close());

  async function serve(upstream?: (url: string, init: RequestInit) => Promise<Response>, voice: CloudVoice | null = VOICE) {
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
    const handlers = createVoiceReplicationHandlers({
      voice,
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
          ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {})
        });
        return upstream ? upstream(String(url), init ?? {}) : Response.json({ id: "voice_light_01", display_name: "เสียงของคุณไลท์" });
      }
    });
    const app = express();
    app.use(express.json({ limit: "4mb" }));
    app.get("/api/voices", handlers.listVoices);
    app.post("/api/voices/replicate", handlers.replicateVoice);
    app.delete("/api/voices/:id", handlers.deleteVoice);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { origin, calls };
  }

  it("สร้างเสียงจำลอง (Voice Replication) ตามรูปแบบ Gemini /v1beta/voices และคืน voice_id ที่บันทึกแล้ว", async () => {
    const { origin, calls } = await serve();

    const res = await fetch(`${origin}/api/voices/replicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "เสียงของคุณไลท์",
        sourceAudioBase64: VALID_WAV_B64,
        consentAudioBase64: VALID_WAV_B64
      })
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as { ok: boolean; voice: { id: string; displayName: string } };
    expect(data).toMatchObject({ ok: true, voice: { id: "voice_light_01", displayName: "เสียงของคุณไลท์" } });
    expect(calls[0]?.url).toBe(resolveVoicesBaseUrl(VOICE));
    expect(calls[0]?.body).toMatchObject({
      store: true,
      voice: {
        model: "gemini-3.8-flash-tts",
        type: "replicated",
        display_name: "เสียงของคุณไลท์"
      }
    });
  });

  it("สลับไป gemini-3.8-flash-lite-tts อัตโนมัติเมื่อ flash-tts ติด 429", async () => {
    const calledModels: string[] = [];
    const { origin } = await serve(async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { voice: { model: string } };
      calledModels.push(body.voice.model);
      if (body.voice.model === "gemini-3.8-flash-tts") {
        return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
      }
      return Response.json({ id: "voice_light_lite", display_name: "เสียงของคุณไลท์" });
    });

    const res = await fetch(`${origin}/api/voices/replicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "เสียงของคุณไลท์",
        sourceAudioBase64: VALID_WAV_B64,
        consentAudioBase64: VALID_WAV_B64
      })
    });

    expect(res.status).toBe(201);
    expect(calledModels).toEqual(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]);
  });

  it("ดึงรายการเสียงจำลองและแสดงประโยคยินยอมภาษาไทยครบถ้วน", async () => {
    const { origin } = await serve(async () =>
      Response.json({ voices: [{ id: "voice_abc123", display_name: "เสียงของคุณไลท์" }] })
    );

    const res = await fetch(`${origin}/api/voices`);
    const body = (await res.json()) as { ok: boolean; consentPhrase: string; voices: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.consentPhrase).toBe(THAI_CONSENT_PHRASE);
    expect(body.voices).toEqual([{ id: "voice_abc123", displayName: "เสียงของคุณไลท์" }]);
  });

  it("ปฏิเสธข้อมูลเสียงที่สั้นเกินไปหรือเปล่าโดยไม่ยิงต้นทาง", async () => {
    const { origin, calls } = await serve();
    const res = await fetch(`${origin}/api/voices/replicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "ไลท์", sourceAudioBase64: "short", consentAudioBase64: "short" })
    });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
