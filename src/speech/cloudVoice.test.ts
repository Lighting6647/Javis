import { describe, expect, it, vi } from "vitest";
import { type AudioPlayback, CloudVoiceError, CloudVoiceSynthesizer, MAX_BATCH_LENGTH, type PlaybackOutcome } from "./cloudVoice";
import { DEFAULT_VOICE_SETTINGS, type SpeechSynthesizer, type VoiceSettings } from "./types";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** รอให้งานอะซิงก์ที่ค้างอยู่เดินจนสุด */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** เสียงในอุปกรณ์จำลอง: จดว่าถูกสั่งให้พูดอะไร และจบการพูดทันที */
function fakeDevice(options: { thaiVoice?: boolean } = {}) {
  const spoken: string[] = [];
  const applied: VoiceSettings[] = [];
  let cancels = 0;
  const device: SpeechSynthesizer = {
    listVoices: async () => [{ id: "device-voice", name: "เสียงของเครื่อง" }],
    applySettings: (settings) => {
      applied.push(settings);
    },
    prepare: async () => options.thaiVoice ?? true,
    speak: async (text) => {
      spoken.push(text);
    },
    cancel: () => {
      cancels += 1;
    },
    isBlocked: () => true,
    onBlockedChange: () => () => undefined
  };
  return { device, spoken, applied, cancels: () => cancels };
}

function setup(options: { available?: boolean | null; settings?: Partial<VoiceSettings>; thaiVoice?: boolean } = {}) {
  const fallback = fakeDevice({ thaiVoice: options.thaiVoice });
  const clock = { time: 1_000_000 };
  const requests: Array<{ text: string; voice: string | null; signal: AbortSignal; audio: Deferred<Blob> }> = [];
  const plays: Array<{ audio: Blob; rate: number; outcome: Deferred<PlaybackOutcome>; stopped: boolean }> = [];
  let available = options.available === undefined ? true : options.available;

  const voice = new CloudVoiceSynthesizer({
    fallback: fallback.device,
    available: () => available,
    now: () => clock.time,
    fetchSpeech: (text, chosen, signal) => {
      const audio = deferred<Blob>();
      requests.push({ text, voice: chosen, signal, audio });
      return audio.promise;
    },
    player: {
      play: (audio, rate): AudioPlayback => {
        const outcome = deferred<PlaybackOutcome>();
        const entry = { audio, rate, outcome, stopped: false };
        plays.push(entry);
        return {
          finished: outcome.promise,
          stop: () => {
            entry.stopped = true;
            outcome.resolve("stopped");
          }
        };
      }
    }
  });
  voice.applySettings({ ...DEFAULT_VOICE_SETTINGS, ...options.settings });

  /** เซิร์ฟเวอร์ส่งเสียงของคำขอลำดับนี้มาแล้ว */
  const deliver = async (index: number) => {
    requests[index]?.audio.resolve(new Blob([`audio-${index}`]));
    await settle();
  };
  /** เสียงลำดับนี้เล่นจนจบ */
  const finishPlay = async (index: number, outcome: PlaybackOutcome = "ended") => {
    plays[index]?.outcome.resolve(outcome);
    await settle();
  };

  return {
    voice,
    fallback,
    clock,
    requests,
    plays,
    deliver,
    finishPlay,
    setAvailable: (value: boolean | null) => {
      available = value;
    }
  };
}

describe("CloudVoiceSynthesizer", () => {
  it("อ่านข้อความด้วยเสียงของ Gemini: ขอเสียงหนึ่งครั้ง เล่นด้วยความเร็วที่ผู้ใช้ตั้ง และจบเมื่อเล่นจบ", async () => {
    const { voice, fallback, requests, plays, deliver, finishPlay } = setup({ settings: { rate: 1.2, cloudVoice: "Kore" } });
    let done = false;

    const speaking = voice.speak("สวัสดีครับ ผมจาวิส").then(() => {
      done = true;
    });
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ text: "สวัสดีครับ ผมจาวิส", voice: "Kore" });

    await deliver(0);
    expect(plays).toHaveLength(1);
    expect(plays[0]?.rate).toBe(1.2);
    expect(done).toBe(false);

    await finishPlay(0);
    await speaking;
    expect(done).toBe(true);
    expect(fallback.spoken).toEqual([]);
  });

  it("ผู้ใช้ปิดเสียงของ Gemini ในการตั้งค่า: ใช้เสียงในอุปกรณ์ ไม่ขอเสียงจากเซิร์ฟเวอร์", async () => {
    const { voice, fallback, requests } = setup({ settings: { cloud: false } });

    voice.preload("สวัสดีครับ");
    await voice.speak("สวัสดีครับ");

    expect(fallback.spoken).toEqual(["สวัสดีครับ"]);
    expect(requests).toHaveLength(0);
  });

  it("เซิร์ฟเวอร์ไม่มีเสียงของ Gemini: ใช้เสียงในอุปกรณ์ ไม่ลองขอ", async () => {
    const { voice, fallback, requests } = setup({ available: false });

    await voice.speak("สวัสดีครับ");

    expect(fallback.spoken).toEqual(["สวัสดีครับ"]);
    expect(requests).toHaveLength(0);
  });

  it("ยังไม่รู้ว่าเซิร์ฟเวอร์มีเสียงของ Gemini ไหม: ลองขอ แล้วเลิกลองเมื่อเซิร์ฟเวอร์ตอบว่าไม่มี", async () => {
    const { voice, fallback, requests, clock } = setup({ available: null });

    const first = voice.speak("ประโยคแรก");
    await settle();
    requests[0]?.audio.reject(new CloudVoiceError("unavailable"));
    await first;
    clock.time += 24 * 60 * 60_000;
    await voice.speak("ประโยคถัดไป");

    expect(fallback.spoken).toEqual(["ประโยคแรก", "ประโยคถัดไป"]);
    expect(requests).toHaveLength(1);
  });

  describe("ขอเสียงล่วงหน้า", () => {
    it("ประโยคที่บอกไว้ล่วงหน้าถูกขอทันที และตอนสั่งพูดใช้เสียงนั้น ไม่ขอซ้ำ", async () => {
      const { voice, requests, plays, deliver, finishPlay } = setup();

      voice.preload("ประโยคแรก");
      expect(requests).toHaveLength(1);
      await deliver(0);

      const speaking = voice.speak("ประโยคแรก");
      await settle();
      expect(plays).toHaveLength(1);
      await finishPlay(0);
      await speaking;

      expect(requests).toHaveLength(1);
    });

    it("ประโยคที่สองถูกขอโดยไม่รอเสียงประโยคแรก ประโยคหลังจากนั้นถูกรวมเป็นคำขอเดียว: คำตอบหนึ่งครั้งจึงใช้ราวสามคำขอ", async () => {
      const { voice, fallback, requests, plays, deliver, finishPlay } = setup();

      voice.preload("ประโยคแรก");
      voice.preload("ประโยคที่สอง");
      voice.preload("ประโยคที่สาม");
      voice.preload("ประโยคที่สี่");
      expect(requests.map((request) => request.text)).toEqual(["ประโยคแรก", "ประโยคที่สอง"]);

      await deliver(0);
      expect(requests.map((request) => request.text)).toEqual(["ประโยคแรก", "ประโยคที่สอง", "ประโยคที่สาม ประโยคที่สี่"]);
      await deliver(1);
      await deliver(2);

      for (const [index, text] of ["ประโยคแรก", "ประโยคที่สอง", "ประโยคที่สาม"].entries()) {
        const speaking = voice.speak(text);
        await settle();
        await finishPlay(index);
        await speaking;
      }
      // ประโยคที่สี่อยู่ในเสียงก้อนเดียวกับประโยคที่สาม ซึ่งเล่นจบไปแล้ว
      await voice.speak("ประโยคที่สี่");
      expect(plays).toHaveLength(3);
      expect(requests).toHaveLength(3);
      expect(fallback.spoken).toEqual([]);
    });

    it("เสียงก้อนที่สองมาถึงก่อนก้อนแรก: ยังเล่นตามลำดับ", async () => {
      const { voice, plays, deliver, finishPlay } = setup();
      voice.preload("หนึ่ง");
      voice.preload("สอง");
      const first = voice.speak("หนึ่ง");
      await deliver(1);
      expect(plays).toHaveLength(0);
      await deliver(0);
      expect(await plays[0]?.audio.text()).toBe("audio-0");
      await finishPlay(0);
      await first;
      const second = voice.speak("สอง");
      await settle();
      expect(await plays[1]?.audio.text()).toBe("audio-1");
      await finishPlay(1);
      await second;
    });

    it("ประโยคที่รวมกันยาวเกินที่เซิร์ฟเวอร์รับต่อคำขอ ถูกแบ่งเป็นหลายคำขอ โดยไม่ตัดกลางประโยค", async () => {
      const { voice, requests, deliver } = setup();
      const long = (label: string) => `${label} ${"ก".repeat(Math.floor(MAX_BATCH_LENGTH / 2))}`;

      voice.preload("ประโยคแรก");
      voice.preload(long("สอง"));
      voice.preload(long("สาม"));
      voice.preload("สี่");
      await deliver(0);
      expect(requests[1]?.text).toBe(long("สอง"));

      await deliver(1);
      expect(requests[2]?.text).toBe(`${long("สาม")} สี่`);
      expect(requests.every((request) => request.text.length <= MAX_BATCH_LENGTH)).toBe(true);
    });

    it("ประโยคซ้ำกันติดกัน: พูดครบตามจำนวนครั้ง", async () => {
      const { voice, requests, plays, deliver, finishPlay } = setup();

      voice.preload("ครับ");
      voice.preload("ครับ");
      await deliver(0);
      await deliver(1);

      const first = voice.speak("ครับ");
      await settle();
      await finishPlay(0);
      await first;
      const second = voice.speak("ครับ");
      await settle();
      await finishPlay(1);
      await second;

      expect(requests.map((request) => request.text)).toEqual(["ครับ", "ครับ"]);
      expect(plays).toHaveLength(2);
    });
  });

  describe("สลับไปเสียงในอุปกรณ์เอง", () => {
    it("โควตาหมด: ประโยคนั้นและประโยคถัดไปใช้เสียงในอุปกรณ์ ไม่ขอซ้ำจนถึงเวลาที่เซิร์ฟเวอร์บอก แล้วกลับมาใช้เสียงของ Gemini เอง", async () => {
      const { voice, fallback, requests, plays, clock, deliver, finishPlay } = setup();

      const first = voice.speak("ประโยคแรก");
      await settle();
      requests[0]?.audio.reject(new CloudVoiceError("quota", 40_000));
      await first;
      expect(fallback.spoken).toEqual(["ประโยคแรก"]);
      expect(voice.status()).toEqual({ mode: "paused", reason: "quota", until: 1_040_000 });

      clock.time += 39_000;
      await voice.speak("ประโยคที่สอง");
      expect(fallback.spoken).toEqual(["ประโยคแรก", "ประโยคที่สอง"]);
      expect(requests).toHaveLength(1);

      clock.time += 2_000;
      const third = voice.speak("ประโยคที่สาม");
      await settle();
      expect(requests).toHaveLength(2);
      await deliver(1);
      await finishPlay(0);
      await third;
      expect(plays).toHaveLength(1);
      expect(voice.status()).toEqual({ mode: "active" });
    });

    it.each([
      ["ขอถี่เกินไป", new CloudVoiceError("rate"), 30_000],
      ["ขอเสียงไม่สำเร็จ", new CloudVoiceError("failed"), 60_000],
      ["ข้อผิดพลาดที่ไม่รู้จัก", new Error("boom"), 60_000],
      ["เซิร์ฟเวอร์ไม่ให้ใช้โมเดล", new CloudVoiceError("rejected"), 30 * 60_000]
    ])("%s: พักเสียงของ Gemini ไว้ตามความหนักของเหตุ", async (_name, error, pauseMs) => {
      const { voice, fallback, requests, clock } = setup();

      const speaking = voice.speak("ประโยคแรก");
      await settle();
      requests[0]?.audio.reject(error);
      await speaking;
      expect(fallback.spoken).toEqual(["ประโยคแรก"]);

      clock.time += pauseMs - 1;
      await voice.speak("ยังพักอยู่");
      expect(requests).toHaveLength(1);

      clock.time += 2;
      void voice.speak("กลับมาลองใหม่");
      await settle();
      expect(requests).toHaveLength(2);
    });

    it("เสียงก้อนที่รวมหลายประโยคล้มเหลว: ทุกประโยคในก้อนนั้นถูกพูดด้วยเสียงในอุปกรณ์ ไม่มีคำตกหล่น", async () => {
      const { voice, fallback, requests, deliver, finishPlay } = setup();

      voice.preload("ประโยคแรก");
      voice.preload("ประโยคที่สอง");
      voice.preload("ประโยคที่สาม");
      voice.preload("ประโยคที่สี่");
      await deliver(0);
      await deliver(1);
      for (const [index, text] of ["ประโยคแรก", "ประโยคที่สอง"].entries()) {
        const speaking = voice.speak(text);
        await settle();
        await finishPlay(index);
        await speaking;
      }

      requests[2]?.audio.reject(new CloudVoiceError("failed"));
      await settle();
      await voice.speak("ประโยคที่สาม");
      await voice.speak("ประโยคที่สี่");

      expect(fallback.spoken).toEqual(["ประโยคที่สาม", "ประโยคที่สี่"]);
    });

    it("ประโยคที่บอกไว้ล่วงหน้าแต่ยังไม่ได้ขอตอนที่เสียงของ Gemini ล้ม: พูดด้วยเสียงในอุปกรณ์เช่นกัน", async () => {
      const { voice, fallback, requests } = setup();

      voice.preload("ประโยคแรก");
      voice.preload("ประโยคที่สอง");
      voice.preload("ประโยคที่สาม");
      requests[0]?.audio.reject(new CloudVoiceError("quota", 60_000));
      requests[1]?.audio.reject(new CloudVoiceError("quota", 60_000));
      await settle();
      await voice.speak("ประโยคแรก");
      await voice.speak("ประโยคที่สอง");
      await voice.speak("ประโยคที่สาม");

      expect(fallback.spoken).toEqual(["ประโยคแรก", "ประโยคที่สอง", "ประโยคที่สาม"]);
      expect(requests).toHaveLength(2);
    });

    it("เบราว์เซอร์ยังไม่ยอมให้หน้านี้เล่นเสียง: พูดประโยคนั้นด้วยเสียงในอุปกรณ์ โดยไม่ถือว่าเสียงของ Gemini เสีย", async () => {
      const { voice, fallback, requests, deliver, finishPlay } = setup();

      const speaking = voice.speak("ประโยคแรก");
      await settle();
      await deliver(0);
      await finishPlay(0, "blocked");
      await speaking;

      expect(fallback.spoken).toEqual(["ประโยคแรก"]);
      expect(voice.status()).toEqual({ mode: "active" });
      void voice.speak("ประโยคถัดไป");
      await settle();
      expect(requests).toHaveLength(2);
    });

    it("ไฟล์เสียงเล่นไม่ได้: พูดประโยคนั้นด้วยเสียงในอุปกรณ์", async () => {
      const { voice, fallback, deliver, finishPlay } = setup();

      const speaking = voice.speak("ประโยคแรก");
      await settle();
      await deliver(0);
      await finishPlay(0, "failed");
      await speaking;

      expect(fallback.spoken).toEqual(["ประโยคแรก"]);
    });
  });

  describe("ยกเลิก", () => {
    it("ระหว่างรอเสียง: ยกเลิกคำขอ การสั่งพูดจบทันที และเสียงที่มาช้าไม่ถูกเล่น", async () => {
      const { voice, fallback, requests, plays, deliver } = setup();
      let done = false;

      void voice.speak("ประโยคแรก").then(() => {
        done = true;
      });
      voice.preload("ประโยคที่สอง");
      await settle();
      voice.cancel();
      await settle();

      expect(requests.map((request) => request.signal.aborted)).toEqual([true, true]);
      expect(fallback.cancels()).toBe(1);
      // การสั่งพูดจบตั้งแต่ตอนยกเลิก ไม่ต้องรอให้คำขอที่ค้างตอบกลับมา
      expect(done).toBe(true);
      await deliver(0);
      await deliver(1);
      expect(plays).toHaveLength(0);
      expect(fallback.spoken).toEqual([]);
      expect(requests).toHaveLength(2);
    });

    it("ระหว่างเล่นเสียง: หยุดเสียงทันที และไม่พูดซ้ำด้วยเสียงในอุปกรณ์", async () => {
      const { voice, fallback, plays, deliver } = setup();

      const speaking = voice.speak("ประโยคแรก");
      await settle();
      await deliver(0);
      voice.cancel();
      await speaking;

      expect(plays[0]?.stopped).toBe(true);
      expect(fallback.spoken).toEqual([]);
    });

    it("คำขอที่ถูกยกเลิกไม่ทำให้เสียงของ Gemini ถูกพัก", async () => {
      const { voice, requests } = setup();

      void voice.speak("ประโยคแรก");
      await settle();
      voice.cancel();
      requests[0]?.audio.reject(new DOMException("aborted", "AbortError"));
      await settle();

      expect(voice.status()).toEqual({ mode: "active" });
      void voice.speak("ประโยคใหม่");
      await settle();
      expect(requests).toHaveLength(2);
    });

    it("หลังยกเลิก: ประโยคของรอบใหม่เริ่มต้นใหม่ ไม่ปนกับของรอบเก่า", async () => {
      const { voice, requests, plays, deliver, finishPlay } = setup();

      voice.preload("รอบเก่า หนึ่ง");
      voice.preload("รอบเก่า สอง");
      voice.cancel();
      voice.preload("รอบใหม่");
      await deliver(2);
      const speaking = voice.speak("รอบใหม่");
      await settle();
      await finishPlay(0);
      await speaking;

      expect(requests.map((request) => request.text)).toEqual(["รอบเก่า หนึ่ง", "รอบเก่า สอง", "รอบใหม่"]);
      expect(plays).toHaveLength(1);
    });
  });

  describe("การเตรียมและการตั้งค่า", () => {
    it("อุปกรณ์ไม่มีเสียงภาษาไทย แต่มีเสียงของ Gemini: พูดตอบได้", async () => {
      expect(await setup({ thaiVoice: false }).voice.prepare()).toBe(true);
    });

    it("บอกว่าเงียบเฉพาะเมื่อเสียงของ Gemini ใช้ไม่ได้และอุปกรณ์ไม่มีเสียงไทย แล้วหายเองเมื่อพ้นเวลาพัก", async () => {
      const { voice, requests, clock } = setup({ thaiVoice: false });
      const changes = vi.fn();
      voice.subscribe(changes);
      await voice.prepare();
      expect(voice.isSilent()).toBe(false);

      const speaking = voice.speak("ประโยคแรก");
      await settle();
      requests[0]?.audio.reject(new CloudVoiceError("quota", 40_000));
      await speaking;
      expect(voice.isSilent()).toBe(true);
      expect(changes).toHaveBeenCalled();

      clock.time += 41_000;
      expect(voice.isSilent()).toBe(false);

      const withThai = setup({ available: false });
      await withThai.voice.prepare();
      expect(withThai.voice.isSilent()).toBe(false);
    });

    it("อุปกรณ์ไม่มีเสียงภาษาไทย และไม่มีเสียงของ Gemini: พูดตอบไม่ได้", async () => {
      expect(await setup({ thaiVoice: false, available: false }).voice.prepare()).toBe(false);
      expect(await setup({ thaiVoice: false, settings: { cloud: false } }).voice.prepare()).toBe(false);
    });

    it("ส่งต่อรายการเสียง การตั้งค่า และสถานะถูกบล็อกของเสียงในอุปกรณ์", async () => {
      const { voice, fallback } = setup({ settings: { rate: 0.8 } });

      expect(await voice.listVoices()).toEqual([{ id: "device-voice", name: "เสียงของเครื่อง" }]);
      expect(fallback.applied.at(-1)).toMatchObject({ rate: 0.8 });
      expect(voice.isBlocked()).toBe(true);
    });

    it("บอกสถานะให้หน้าตั้งค่า และแจ้งเมื่อเปลี่ยน", async () => {
      const { voice, requests, setAvailable } = setup();
      const seen = vi.fn();
      voice.subscribe(seen);

      expect(voice.status()).toEqual({ mode: "active" });
      voice.applySettings({ ...DEFAULT_VOICE_SETTINGS, cloud: false });
      expect(voice.status()).toEqual({ mode: "off" });
      voice.applySettings(DEFAULT_VOICE_SETTINGS);
      setAvailable(false);
      expect(voice.status()).toEqual({ mode: "unavailable" });
      setAvailable(true);

      const speaking = voice.speak("ประโยคแรก");
      await settle();
      requests[0]?.audio.reject(new CloudVoiceError("rejected"));
      await speaking;
      expect(voice.status()).toMatchObject({ mode: "paused", reason: "rejected" });
      expect(seen.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("เสียงคำตอบรับที่เตรียมไว้", () => {
    it("ขอเสียงไว้ครั้งเดียว แล้วเล่นได้ทันทีโดยไม่ขอใหม่", async () => {
      const { voice, requests, plays, deliver } = setup();
      voice.warmClips(["รอแป๊บนะคะ"]);
      voice.warmClips(["รอแป๊บนะคะ"]);
      expect(requests).toHaveLength(1);
      expect(await Promise.race([voice.playClip("รอแป๊บนะคะ"), settle().then(() => "pending")])).toBe(false);
      await deliver(0);

      void voice.playClip("รอแป๊บนะคะ");
      expect(plays).toHaveLength(1);
      expect(requests).toHaveLength(1);
    });

    it("ข้อความที่ยังไม่ได้เตรียม ไม่เล่นอะไรและไม่ขอเสียง", async () => {
      const { voice, requests, plays } = setup();
      expect(await voice.playClip("ไม่เคยเตรียม")).toBe(false);
      expect(requests).toHaveLength(0);
      expect(plays).toHaveLength(0);
    });

    it("คำตอบจริงมาถึง ตัดเสียงคำตอบรับที่เล่นค้างอยู่", async () => {
      const { voice, plays, deliver } = setup();
      voice.warmClips(["รอแป๊บนะคะ"]);
      await deliver(0);
      void voice.playClip("รอแป๊บนะคะ");

      void voice.speak("คำตอบจริงค่ะ");
      await deliver(1);
      expect(plays[0]?.stopped).toBe(true);
      expect(plays).toHaveLength(2);
    });

    it("ยกเลิกการพูดแล้ว เสียงที่เตรียมไว้ยังอยู่", async () => {
      const { voice, plays, deliver } = setup();
      voice.warmClips(["รอแป๊บนะคะ"]);
      voice.cancel();
      await deliver(0);
      void voice.playClip("รอแป๊บนะคะ");
      expect(plays).toHaveLength(1);
    });
  });
});
