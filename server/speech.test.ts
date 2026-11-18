import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiProvider } from "./aiProvider.js";
import {
  buildSpeechRequest,
  type CloudVoice,
  createSpeechHandler,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  MAX_SPEECH_TEXT_LENGTH,
  readRetryDelayMs,
  readSpeechAudio,
  resolveCloudVoice
} from "./speech.js";

const GEMINI: AiProvider = {
  name: "gemini",
  label: "Google Gemini",
  apiStyle: "chat",
  apiKey: "test-gemini-key",
  keyVariable: "GEMINI_API_KEY",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  chatModel: "gemini-3.5-flash-lite",
  chatModelVariable: "GEMINI_CHAT_MODEL",
  transcribeModel: null,
  webSearch: false,
  creditCheck: false
};

const VOICE: CloudVoice = {
  apiKey: "test-gemini-key",
  url: "https://generativelanguage.googleapis.com/v1beta/interactions",
  model: DEFAULT_TTS_MODEL,
  voice: DEFAULT_TTS_VOICE,
  style: "clear and calm"
};

/** ไฟล์ WAV สั้น ๆ: หัวไฟล์ 44 ไบต์ตามด้วยเสียงเงียบ */
function wav(samples = 240): Buffer {
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const audioPayload = (bytes: Buffer) => ({
  id: "int_1",
  status: "completed",
  steps: [
    { type: "thought", signature: "sig" },
    { type: "model_output", content: [{ type: "audio", mime_type: "audio/wav", data: bytes.toString("base64") }] }
  ]
});

describe("resolveCloudVoice", () => {
  it("ใช้ Gemini และมีกุญแจ: เปิดเสียงพูดของ Gemini ด้วยค่าเริ่มต้น และเรียก Interactions API ของที่อยู่เดียวกัน", () => {
    expect(resolveCloudVoice({}, GEMINI)).toMatchObject({
      apiKey: "test-gemini-key",
      url: "https://generativelanguage.googleapis.com/v1beta/interactions",
      model: "gemini-3.8-flash-tts",
      fallbackModels: ["gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview"],
      voice: "Leda",
      style: expect.stringMatching(/Thai/)
    });
  });

  it.each([
    ["ผู้ให้บริการเป็นรายอื่น", { ...GEMINI, name: "openai" as const }, {}],
    ["ยังไม่ได้ตั้งกุญแจ", { ...GEMINI, apiKey: undefined }, {}],
    ["ผู้ดูแลปิดไว้", GEMINI, { GEMINI_VOICE_ENABLED: "false" }],
    ["ผู้ดูแลปิดไว้ด้วยตัวพิมพ์ใหญ่และช่องว่าง", GEMINI, { GEMINI_VOICE_ENABLED: " FALSE " }]
  ])("%s: ไม่มีเสียงพูดของ Gemini", (_reason, ai, env) => {
    expect(resolveCloudVoice(env, ai)).toBeNull();
  });

  it("ผู้ดูแลเลือกโมเดล เสียง และลีลาเองได้ ชื่อเสียงไม่สนตัวพิมพ์", () => {
    const voice = resolveCloudVoice({ GEMINI_TTS_MODEL: "gemini-3.1-flash-tts-preview", GEMINI_TTS_VOICE: "kore", GEMINI_TTS_STYLE: "  warm and slow  " }, GEMINI);

    expect(voice).toMatchObject({ model: "gemini-3.1-flash-tts-preview", voice: "Kore", style: "warm and slow" });
  });

  it("ชื่อเสียงที่ไม่มีอยู่จริง: ใช้เสียงเริ่มต้นและเตือนผู้ดูแล", () => {
    const warn = vi.fn();

    expect(resolveCloudVoice({ GEMINI_TTS_VOICE: "Jarvis" }, GEMINI, warn)?.voice).toBe(DEFAULT_TTS_VOICE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("GEMINI_TTS_VOICE");
  });

  it("ชื่อโมเดลที่ผิดรูป (เช่นวางกุญแจผิดช่อง): ใช้โมเดลเริ่มต้นและเตือนโดยไม่พิมพ์ค่านั้น", () => {
    const warn = vi.fn();
    const pasted = `${"AI"}${"za"}SyNotARealKeyJustForThisTest000000000`;

    expect(resolveCloudVoice({ GEMINI_TTS_MODEL: pasted }, GEMINI, warn)?.model).toBe(DEFAULT_TTS_MODEL);
    expect(resolveCloudVoice({ GEMINI_TTS_MODEL: "has spaces in it" }, GEMINI, warn)?.model).toBe(DEFAULT_TTS_MODEL);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(pasted);
  });

  it("ที่อยู่ของ Gemini ถูกเปลี่ยน (เช่นเซิร์ฟเวอร์ทดสอบ): เรียก Interactions API ของที่อยู่นั้น", () => {
    expect(resolveCloudVoice({}, { ...GEMINI, baseUrl: "http://127.0.0.1:9961" })?.url).toBe("http://127.0.0.1:9961/interactions");
    expect(resolveCloudVoice({}, { ...GEMINI, baseUrl: "http://127.0.0.1:9961/openai/" })?.url).toBe("http://127.0.0.1:9961/interactions");
  });
});

describe("buildSpeechRequest", () => {
  it("สร้างคำขอเสียงพูดผู้พูดคนเดียวตามรูปแบบของ Interactions API", () => {
    expect(buildSpeechRequest("สวัสดีครับ ผมจาวิส", VOICE)).toEqual({
      model: "gemini-3.8-flash-tts",
      input: [
        {
          type: "user_input",
          content: [{ type: "text", text: "สวัสดีครับ ผมจาวิส", annotations: [{ type: "speech_metadata", style: "clear and calm" }] }]
        }
      ],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Leda" }] },
      store: false
    });
  });

  it("ผู้ใช้เลือกเสียงเอง: ใช้เสียงนั้นแทนเสียงเริ่มต้นของเซิร์ฟเวอร์", () => {
    const body = buildSpeechRequest("สวัสดีค่ะ", VOICE, "Aoede") as { generation_config: { speech_config: Array<{ voice: string }> } };

    expect(body.generation_config.speech_config).toEqual([{ voice: "Aoede" }]);
  });

  it("เลือกบุคลิกสาวน้อย Gen Z: ใช้เสียง Leda และคำกำกับสไตล์สดใสวัยรุ่น", () => {
    const body = buildSpeechRequest("ฮายยย", VOICE, undefined, undefined, "genz-girl") as {
      input: Array<{ content: Array<{ annotations: Array<{ style: string }> }> }>;
      generation_config: { speech_config: Array<{ voice: string }> };
    };

    expect(body.generation_config.speech_config).toEqual([{ voice: "Leda" }]);
    expect(body.input[0]?.content[0]?.annotations[0]?.style).toContain("Gen Z");
  });
});

describe("readSpeechAudio", () => {
  it("หยิบเสียงจากขั้นคำตอบของโมเดล", () => {
    const bytes = wav();

    expect(readSpeechAudio(audioPayload(bytes))?.equals(bytes)).toBe(true);
  });

  it("เสียงมาเป็นข้อมูลดิบไม่มีหัวไฟล์: ใส่หัวไฟล์ WAV ให้ (24 kHz ช่องเดียว 16 บิต) เพื่อให้เบราว์เซอร์เล่นได้", () => {
    const raw = Buffer.alloc(4800, 1);
    const audio = readSpeechAudio(audioPayload(raw));

    expect(audio?.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(audio?.subarray(8, 12).toString("latin1")).toBe("WAVE");
    expect(audio?.readUInt32LE(24)).toBe(24_000);
    expect(audio?.readUInt16LE(22)).toBe(1);
    expect(audio?.readUInt16LE(34)).toBe(16);
    expect(audio?.subarray(44).equals(raw)).toBe(true);
  });

  it.each([
    ["ไม่ใช่ออบเจกต์", "audio"],
    ["ไม่มีขั้นใดเลย", { steps: [] }],
    ["มีแต่ข้อความ", { steps: [{ type: "model_output", content: [{ type: "text", text: "สวัสดี" }] }] }],
    ["เสียงว่างเปล่า", { steps: [{ type: "model_output", content: [{ type: "audio", data: "" }] }] }],
    ["เสียงไม่ใช่ข้อความ", { steps: [{ type: "model_output", content: [{ type: "audio", data: 42 }] }] }],
    ["เสียงอยู่ในขั้นที่ไม่ใช่คำตอบของโมเดล", { steps: [{ type: "user_input", content: [{ type: "audio", data: "AAAA" }] }] }]
  ])("คำตอบที่%s: ไม่มีเสียงให้ใช้", (_name, payload) => {
    expect(readSpeechAudio(payload)).toBeNull();
  });
});

describe("readRetryDelayMs", () => {
  it("อ่านเวลาที่ต้นทางขอให้รอก่อนลองใหม่", () => {
    const payload = { error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "34s" }] } };

    expect(readRetryDelayMs(payload)).toBe(34_000);
    expect(readRetryDelayMs({ error: { details: [{ retryDelay: "1.5s" }] } })).toBe(1500);
  });

  it.each([null, {}, { error: {} }, { error: { details: "x" } }, { error: { details: [{ retryDelay: "soon" }] } }, { error: { details: [{ retryDelay: "-3s" }] } }])(
    "ไม่มีเวลาที่อ่านได้: %j",
    (payload) => {
      expect(readRetryDelayMs(payload)).toBeNull();
    }
  );
});

describe("createSpeechHandler", () => {
  let close: () => Promise<void> = async () => undefined;

  afterEach(() => close());

  /** เปิดเซิร์ฟเวอร์ที่มีเส้นทางเสียงพูดอย่างเดียว ต่อกับต้นทางจำลอง */
  async function serve(options: { voice?: CloudVoice | null; upstream?: (url: string, init: RequestInit) => Promise<Response>; isDiagnostic?: (token: string | undefined) => boolean } = {}) {
    const clock = { time: 1_000_000 };
    const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    const upstream = options.upstream ?? (async () => Response.json(audioPayload(wav())));
    const handler = createSpeechHandler({
      voice: options.voice === undefined ? VOICE : options.voice,
      now: () => clock.time,
      isDiagnostic: options.isDiagnostic,
      fetch: async (url, init) => {
        calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return upstream(String(url), init ?? {});
      }
    });
    const app = express();
    app.use(express.json());
    app.post("/api/speech", handler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const speak = (body: unknown) => fetch(`${origin}/api/speech`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { speak, calls, clock };
  }

  it("อ่านข้อความเป็นเสียง: ส่งคำขอไปต้นทางด้วยกุญแจทางหัวคำขอ แล้วตอบเป็นไฟล์เสียงที่ไม่ให้เก็บ", async () => {
    const { speak, calls } = await serve();

    const response = await speak({ text: "  สวัสดีครับ ผมจาวิส  " });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await response.arrayBuffer()).equals(wav())).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(VOICE.url);
    expect(calls[0]?.headers["x-goog-api-key"]).toBe("test-gemini-key");
    expect(calls[0]?.body).toEqual(buildSpeechRequest("สวัสดีครับ ผมจาวิส", VOICE));
  });

  it("ผู้ใช้เลือกเสียง: ส่งชื่อเสียงนั้นให้ต้นทาง", async () => {
    const { speak, calls } = await serve();

    await speak({ text: "สวัสดีครับ", voice: "Kore" });

    expect(calls[0]?.body).toEqual(buildSpeechRequest("สวัสดีครับ", VOICE, "Kore"));
  });

  it("เซิร์ฟเวอร์ไม่มีเสียงพูดของ Gemini: บอกว่าไม่มี โดยไม่เรียกต้นทาง", async () => {
    const { speak, calls } = await serve({ voice: null });

    const response = await speak({ text: "สวัสดีครับ" });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "unavailable" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["ไม่มีข้อความ", {}],
    ["ข้อความว่าง", { text: "   " }],
    ["ข้อความยาวเกิน", { text: "ก".repeat(MAX_SPEECH_TEXT_LENGTH + 1) }],
    ["ชื่อเสียงที่ไม่มีอยู่จริง", { text: "สวัสดีครับ", voice: "Jarvis" }],
    ["ข้อความไม่ใช่สตริง", { text: 42 }]
  ])("คำขอที่%s: ปฏิเสธโดยไม่เรียกต้นทาง", async (_name, body) => {
    const { speak, calls } = await serve();

    const response = await speak(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid" });
    expect(calls).toHaveLength(0);
  });

  it("โควตาของต้นทางหมด: บอกให้ใช้เสียงอื่นไปก่อน พร้อมเวลาที่ควรรอ และไม่เรียกต้นทางซ้ำจนกว่าจะถึงเวลา", async () => {
    const exhausted = () =>
      Promise.resolve(Response.json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded", details: [{ retryDelay: "40s" }] } }, { status: 429 }));
    const { speak, calls, clock } = await serve({ upstream: exhausted });

    const first = await speak({ text: "สวัสดีครับ" });
    expect(first.status).toBe(429);
    expect(await first.json()).toMatchObject({ code: "quota", retryAfterSeconds: 40 });
    expect(first.headers.get("retry-after")).toBe("40");

    clock.time += 25_000;
    const second = await speak({ text: "สวัสดีครับ" });
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: "quota", retryAfterSeconds: 15 });
    expect(calls).toHaveLength(1);

    clock.time += 16_000;
    await speak({ text: "สวัสดีครับ" });
    expect(calls).toHaveLength(2);
  });

  it("โควตาหมดโดยต้นทางไม่บอกเวลา: รอหนึ่งนาที", async () => {
    const { speak } = await serve({ upstream: async () => Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 }) });

    expect(await (await speak({ text: "สวัสดีครับ" })).json()).toMatchObject({ code: "quota", retryAfterSeconds: 60 });
  });

  it("ต้นทางขอให้รอนานมาก (เช่นโควตาต่อวันหมด): พักไม่เกินหนึ่งชั่วโมงต่อครั้ง", async () => {
    const { speak } = await serve({ upstream: async () => Response.json({ error: { details: [{ retryDelay: "86400s" }] } }, { status: 429 }) });

    expect(await (await speak({ text: "สวัสดีครับ" })).json()).toMatchObject({ code: "quota", retryAfterSeconds: 3600 });
  });

  it.each([403, 404])("ต้นทางไม่ให้ใช้โมเดลนี้ (%i): บอกว่าใช้ไม่ได้ และพักไว้ ไม่เรียกซ้ำทุกประโยค", async (status) => {
    const { speak, calls } = await serve({ upstream: async () => Response.json({ error: { status: "PERMISSION_DENIED", message: "not allowed" } }, { status }) });

    const response = await speak({ text: "สวัสดีครับ" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "rejected" });

    const again = await speak({ text: "สวัสดีครับ" });
    expect(again.status).toBe(502);
    expect(await again.json()).toMatchObject({ code: "rejected" });
    expect(calls).toHaveLength(1);
  });

  it("ต้นทางปฏิเสธข้อความนี้ (400): ล้มเฉพาะคำขอนี้ ข้อความถัดไปยังลองได้", async () => {
    const { speak, calls } = await serve({ upstream: async () => Response.json({ error: { status: "INVALID_ARGUMENT", message: "bad text" } }, { status: 400 }) });

    expect((await speak({ text: "สวัสดีครับ" })).status).toBe(502);
    await speak({ text: "อีกประโยค" });

    expect(calls).toHaveLength(2);
  });

  it("เชื่อมต่อต้นทางไม่ได้ หรือคำตอบไม่มีเสียง: ตอบว่าล้มเหลว เพื่อให้แอปใช้เสียงในเครื่องแทน", async () => {
    const offline = await serve({
      upstream: async () => {
        throw new Error("network down");
      }
    });
    const down = await offline.speak({ text: "สวัสดีครับ" });
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ code: "failed" });
    await close();

    const empty = await serve({ upstream: async () => Response.json({ steps: [] }) });
    const silent = await empty.speak({ text: "สวัสดีครับ" });
    expect(silent.status).toBe(502);
    expect(await silent.json()).toMatchObject({ code: "failed" });
  });

  it("ข้อความที่ส่งให้ผู้ใช้ไม่มีข้อความดิบของต้นทาง", async () => {
    const { speak } = await serve({ upstream: async () => Response.json({ error: { status: "INVALID_ARGUMENT", message: "Unknown name secret-detail" } }, { status: 400 }) });

    expect(JSON.stringify(await (await speak({ text: "สวัสดีครับ" })).json())).not.toContain("secret-detail");
  });

  it("ผู้ดูแลแนบรหัสวินิจฉัย: ได้สถานะและข้อความของต้นทางที่ปิดบังกุญแจแล้ว และไม่ถูกการพักขวาง", async () => {
    const leaked = `${"AI"}${"za"}SyNotARealKeyJustForThisTest000000000`;
    const { speak, calls } = await serve({
      isDiagnostic: (token) => token === "admin-token",
      upstream: async () => Response.json({ error: { status: "PERMISSION_DENIED", message: `Model not enabled for key ${leaked}` } }, { status: 403 })
    });

    await speak({ text: "สวัสดีครับ" });
    const response = await speak({ text: "สวัสดีครับ", diagnose: "admin-token" });
    const body = (await response.json()) as { upstream?: { httpStatus: number; codes: string[]; message: string } };

    expect(calls).toHaveLength(2);
    expect(body.upstream).toMatchObject({ httpStatus: 403 });
    expect(body.upstream?.message).toContain("Model not enabled");
    expect(JSON.stringify(body)).not.toContain(leaked);

    const stranger = await speak({ text: "สวัสดีครับ", diagnose: "wrong-token" });
    expect(await stranger.json()).not.toHaveProperty("upstream");
  });

  it("โควตาโมเดลหลักหมด (429): สลับไปโมเดล Gemini TTS สำรองในคำขอเดียวกันอัตโนมัติ", async () => {
    const modelsCalled: string[] = [];
    const { speak } = await serve({
      voice: { ...VOICE, fallbackModels: ["gemini-3.8-flash-lite-tts"] },
      upstream: async (_url, init) => {
        const parsed = JSON.parse(String(init.body)) as { model: string };
        modelsCalled.push(parsed.model);
        if (parsed.model === "gemini-3.8-flash-tts") {
          return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
        }
        return Response.json(audioPayload(wav()));
      }
    });

    const response = await speak({ text: "สวัสดีครับ" });
    expect(response.status).toBe(200);
    expect(modelsCalled).toEqual(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]);
  });

  it("เมื่อ Gemini TTS ถูกจำกัดทั้งหมดและมี OpenAI key สำรอง: สลับขอเสียงจาก OpenAI TTS ได้ทันที", async () => {
    const { speak } = await serve({
      voice: {
        ...VOICE,
        fallbackModels: ["gemini-3.8-flash-lite-tts"],
        openaiFallback: { apiKey: "sk-test-openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini-tts", voice: "onyx" }
      },
      upstream: async (url) => {
        if (url.includes("openai.com")) {
          return new Response(new Uint8Array(wav()), { status: 200, headers: { "Content-Type": "audio/wav" } });
        }
        return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
      }
    });

    const response = await speak({ text: "สวัสดีครับ" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("audio/wav");
  });

  it("เมื่อโมเดลหลักส่ง 500 หรือ 400: ลองโมเดลสำรองถัดไปต่อทันที", async () => {
    const modelsCalled: string[] = [];
    const { speak } = await serve({
      voice: { ...VOICE, fallbackModels: ["gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview"] },
      upstream: async (_url, init) => {
        const parsed = JSON.parse(String(init.body)) as { model: string };
        modelsCalled.push(parsed.model);
        if (parsed.model === "gemini-3.8-flash-tts") {
          return Response.json({ error: { status: "INTERNAL", message: "boom" } }, { status: 500 });
        }
        if (parsed.model === "gemini-3.8-flash-lite-tts") {
          return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
        }
        return Response.json(audioPayload(wav()));
      }
    });

    const response = await speak({ text: "สวัสดีค่ะ", persona: "genz-girl" });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-javis-speech-model")).toBe("gemini-3.1-flash-tts-preview");
    expect(response.headers.get("x-javis-speech-voice")).toBe("Leda");
    expect(modelsCalled).toEqual(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview"]);
  });

  it("จำโมเดลที่สำเร็จล่าสุดและแคชข้อความสั้น: คำขอถัดไปไม่ต้องเสียเวลารอลองโมเดลซ้ำ", async () => {
    let upstreamCount = 0;
    const { speak } = await serve({
      voice: { ...VOICE, fallbackModels: ["gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview"] },
      upstream: async (_url, init) => {
        upstreamCount += 1;
        const parsed = JSON.parse(String(init.body)) as { model: string };
        if (parsed.model === "gemini-3.8-flash-tts") {
          return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
        }
        return Response.json(audioPayload(wav()));
      }
    });

    const first = await speak({ text: "ฮายยย หวัดดีค่า" });
    expect(first.status).toBe(200);
    expect(first.headers.get("x-javis-speech-model")).toBe("gemini-3.8-flash-lite-tts");
    expect(upstreamCount).toBe(2);

    // ข้อความเดิมซ้ำ: ตอบจากแคชทันทีโดยไม่เรียกต้นทางเลย
    const cached = await speak({ text: "ฮายยย หวัดดีค่า" });
    expect(cached.status).toBe(200);
    expect(cached.headers.get("x-javis-speech-cache")).toBe("hit");
    expect(upstreamCount).toBe(2);

    // ข้อความใหม่: เรียกโมเดลที่สำเร็จล่าสุดก่อนทันที (1 ครั้ง)
    const next = await speak({ text: "ข้อความถัดไปค่ะ" });
    expect(next.status).toBe(200);
    expect(next.headers.get("x-javis-speech-model")).toBe("gemini-3.8-flash-lite-tts");
    expect(upstreamCount).toBe(3);
  });

  it("เสียงจำลอง (voice_...): ใช้กับโมเดล Gemini 3.8 และข้ามโมเดล 3.1 ที่ไม่รองรับ", async () => {
    const modelsCalled: string[] = [];
    const { speak } = await serve({
      voice: { ...VOICE, fallbackModels: ["gemini-3.8-flash-lite-tts", "gemini-3.1-flash-tts-preview"] },
      upstream: async (_url, init) => {
        const parsed = JSON.parse(String(init.body)) as { model: string };
        modelsCalled.push(parsed.model);
        if (parsed.model === "gemini-3.8-flash-tts") {
          return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
        }
        return Response.json(audioPayload(wav()));
      }
    });

    const res = await speak({ text: "สวัสดีจากเสียงไลท์", voice: "voice_light_01" });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-javis-speech-voice")).toBe("voice_light_01");
    expect(modelsCalled).toEqual(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]);
  });
});
