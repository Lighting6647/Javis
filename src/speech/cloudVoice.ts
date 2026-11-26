import { DEFAULT_VOICE_SETTINGS, type SpeechSynthesizer, type VoiceOption, type VoicePersonaId, type VoiceSettings } from "./types";

/**
 * ความยาวสูงสุดของข้อความต่อคำขอเสียงหนึ่งครั้ง (ตัวอักษร)
 * ต้องไม่เกินเพดานที่เซิร์ฟเวอร์รับ (server/speech.ts)
 */
export const MAX_BATCH_LENGTH = 400;

/**
 * จำนวนคำขอเสียงที่ค้างพร้อมกันได้: ขอก้อนถัดไปไว้ตั้งแต่ก้อนแรกยังมาไม่ถึง
 * ไม่เช่นนั้นบนเครือข่ายช้า ก้อนแรกซึ่งสั้นจะเล่นจบก่อน แล้วเงียบรอก้อนที่สอง ส่วนที่เกินนี้ยังรวมเป็นคำขอเดียวเพื่อประหยัดโควตา
 */
export const MAX_CONCURRENT_BATCHES = 2;

/** เหตุที่ขอเสียงจากเซิร์ฟเวอร์ไม่ได้ ตามรหัสที่เซิร์ฟเวอร์ตอบ */
export type CloudVoiceFailure = "unavailable" | "quota" | "rate" | "rejected" | "failed";

/** ขอเสียงพูดจากเซิร์ฟเวอร์ไม่สำเร็จ */
export class CloudVoiceError extends Error {
  /**
   * @param kind เหตุของความล้มเหลว
   * @param retryAfterMs เวลาที่เซิร์ฟเวอร์ขอให้รอก่อนลองใหม่ (เมื่อโควตาหมด)
   */
  constructor(
    readonly kind: CloudVoiceFailure,
    readonly retryAfterMs?: number
  ) {
    super(kind);
    this.name = "CloudVoiceError";
  }
}

/** ผลของการเล่นเสียงหนึ่งก้อน: เล่นจบ · ถูกสั่งหยุด · เบราว์เซอร์ยังไม่ยอมให้หน้านี้ส่งเสียง · ไฟล์เสียงเล่นไม่ได้ */
export type PlaybackOutcome = "ended" | "stopped" | "blocked" | "failed";

export interface AudioPlayback {
  finished: Promise<PlaybackOutcome>;
  stop(): void;
}

/** ตัวเล่นไฟล์เสียง แยกไว้เพื่อให้ทดสอบได้โดยไม่มีเบราว์เซอร์ */
export interface AudioPlayer {
  /** @param rate ความเร็วในการเล่น 1 = ปกติ */
  play(audio: Blob, rate: number): AudioPlayback;
  /** ปลดล็อกเครื่องเล่นเสียงบน iOS Safari ในจังหวะที่ผู้ใช้แตะหน้าจอ */
  unlock?(): void;
}

export interface CloudVoiceDeps {
  /** เสียงในอุปกรณ์ ใช้เมื่อเสียงของ Gemini ใช้ไม่ได้ */
  fallback: SpeechSynthesizer;
  /** ขอเสียงพูดของข้อความจากเซิร์ฟเวอร์ ล้มเหลวด้วย CloudVoiceError */
  fetchSpeech: (text: string, voice: string | null, signal: AbortSignal, persona?: VoicePersonaId) => Promise<Blob>;
  player: AudioPlayer;
  /** เซิร์ฟเวอร์มีเสียงของ Gemini ไหม: true มี · false ไม่มี · null ยังไม่รู้ (จะลองขอดู) */
  available: () => boolean | null;
  /** นาฬิกาของเครื่อง (มิลลิวินาที) */
  now?: () => number;
}

/** สถานะของเสียง Gemini สำหรับแสดงในหน้าตั้งค่า */
export type CloudVoiceStatus =
  | { mode: "active" }
  /** ผู้ใช้ปิดไว้ */
  | { mode: "off" }
  /** เซิร์ฟเวอร์ไม่มีให้ */
  | { mode: "unavailable" }
  /** ใช้ไม่ได้ชั่วคราว จะลองใหม่เองเมื่อถึงเวลา */
  | { mode: "paused"; reason: CloudVoiceFailure; until: number };

/**
 * ตัวตนผู้ช่วยหลักของระบบ: ใช้เสียงผู้หญิงเป็นหลักเหมือนเดิม
 */
export function resolveAssistantIdentity(_status: CloudVoiceStatus | null): "delluna" | "javis" {
  void _status;
  return "javis";
}

/** เวลาที่พักเสียงของ Gemini หลังล้มเหลวแต่ละแบบ (มิลลิวินาที) ระหว่างพัก Javis ใช้เสียงในอุปกรณ์ */
const PAUSE_MS: Record<Exclude<CloudVoiceFailure, "unavailable">, number> = {
  /** โควตาหมดโดยเซิร์ฟเวอร์ไม่บอกเวลา */
  quota: 60_000,
  rate: 30_000,
  failed: 60_000,
  /** เซิร์ฟเวอร์ไม่ให้ใช้โมเดลที่ตั้งไว้: เป็นเรื่องการตั้งค่า ลองซ้ำบ่อยไม่ช่วย */
  rejected: 30 * 60_000
};

/** เสียงหนึ่งก้อนที่ขอจากเซิร์ฟเวอร์ ซึ่งอาจรวมหลายช่วงข้อความ */
interface Batch {
  texts: string[];
  /** ลำดับของข้อความถัดไปในก้อนนี้ที่ยังไม่ถูกสั่งพูด */
  next: number;
  audio: Promise<Blob>;
  abort: AbortController;
  /** เสียงก้อนนี้ใช้ไม่ได้: ข้อความที่เหลือในก้อนต้องพูดด้วยเสียงในอุปกรณ์ */
  failed: boolean;
}

function createCancelSignal(): { promise: Promise<"cancelled">; resolve: (value: "cancelled") => void } {
  let resolve!: (value: "cancelled") => void;
  const promise = new Promise<"cancelled">((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * ตัวพูดที่ใช้เสียงของ Gemini เป็นหลัก และสลับไปเสียงในอุปกรณ์เองเมื่อเสียงนั้นใช้ไม่ได้
 * (โควตาหมด เครือข่ายมีปัญหา เซิร์ฟเวอร์ไม่มีให้ หรือเบราว์เซอร์ยังไม่ยอมให้เล่นเสียง) ผู้ใช้จึงได้ยินคำตอบเสมอ
 *
 * ประหยัดคำขอ: คำตอบถูกส่งมาทีละช่วงสั้น ๆ ช่วงแรกถูกขอทันทีเพื่อให้เริ่มพูดเร็ว ส่วนช่วงที่มาระหว่างรอเสียงก้อนก่อนหน้า
 * ถูกรวมเป็นคำขอเดียว คำตอบทั่วไปจึงใช้ราวสองคำขอ และเสียงต่อเนื่องเพราะก้อนถัดไปถูกขอไว้ก่อนก้อนปัจจุบันเล่นจบ
 * ไม่ผูกกับเบราว์เซอร์หรือเครือข่าย จึงทดสอบได้ด้วยตัวจำลอง
 */
export class CloudVoiceSynthesizer implements SpeechSynthesizer {
  private settings: VoiceSettings = DEFAULT_VOICE_SETTINGS;
  private readonly listeners = new Set<() => void>();
  /** เพิ่มขึ้นทุกครั้งที่ถูกยกเลิก งานค้างของรอบเก่าจะรู้ตัวและหยุดเอง */
  private epoch = 0;
  /** ข้อความที่ถูกบอกล่วงหน้าแล้วแต่ยังไม่ได้ขอเสียง */
  private waiting: string[] = [];
  /** เสียงที่ขอแล้ว เรียงตามลำดับที่จะถูกสั่งพูด */
  private queue: Batch[] = [];
  /** จำนวนคำขอของก้อนในคิวที่ยังไม่ได้คำตอบ จำกัดไว้เพื่อให้ข้อความที่มาระหว่างนั้นถูกรวมกัน */
  private loading = 0;
  /** อุปกรณ์มีเสียงภาษาไทยไหม รู้หลังเตรียมเสียงครั้งแรก */
  private deviceReady: boolean | null = null;
  private current: AudioPlayback | null = null;
  /** คำขอทั้งหมดที่ยังไม่จบ สำหรับยกเลิก */
  private readonly inFlight = new Set<AbortController>();
  /** จบเมื่อรอบปัจจุบันถูกยกเลิก ให้การสั่งพูดที่รอเสียงอยู่จบได้ทันที */
  private cancelled = createCancelSignal();
  private pause: { reason: CloudVoiceFailure; until: number } | null = null;
  /** เสียงสั้น ๆ ที่เตรียมไว้ล่วงหน้า (คำตอบรับระหว่างรอ) เล่นได้ทันทีโดยไม่ต้องรอเซิร์ฟเวอร์ */
  private readonly clips = new Map<string, Blob>();
  private readonly clipRequests = new Set<string>();
  private clipPlayback: AudioPlayback | null = null;

  constructor(private readonly deps: CloudVoiceDeps) {}

  /** เรียก listener เมื่อสถานะของเสียง Gemini เปลี่ยน คืนฟังก์ชันเลิกติดตาม */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  status = (): CloudVoiceStatus => {
    if (!this.settings.cloud) return { mode: "off" };
    if (this.deps.available() === false || this.pause?.reason === "unavailable") return { mode: "unavailable" };
    if (this.pause && this.clock() < this.pause.until) return { mode: "paused", reason: this.pause.reason, until: this.pause.until };
    return { mode: "active" };
  };

  /** คำตอบจะไม่มีเสียงเลย: เสียงของ Gemini ใช้ไม่ได้ตอนนี้ และอุปกรณ์ไม่มีเสียงภาษาไทยให้ใช้แทน */
  isSilent = (): boolean => this.deviceReady === false && !this.usable();

  /** ล้างสถานะพักชั่วคราวเพื่อให้ลองเชื่อมต่อเสียง Cloud TTS ใหม่ทันที */
  retryCloud = (): void => {
    if (!this.pause) return;
    this.pause = null;
    this.notify();
  };

  isBlocked = (): boolean => this.deps.fallback.isBlocked?.() ?? false;

  onBlockedChange = (listener: () => void): (() => void) => this.deps.fallback.onBlockedChange?.(listener) ?? (() => undefined);

  listVoices(): Promise<VoiceOption[]> {
    return this.deps.fallback.listVoices();
  }

  applySettings(settings: VoiceSettings): void {
    this.settings = settings;
    this.deps.fallback.applySettings(settings);
    this.notify();
  }

  /** พูดตอบได้เมื่ออุปกรณ์มีเสียงภาษาไทย หรือมีเสียงของ Gemini ให้ใช้แทน */
  async prepare(): Promise<boolean> {
    this.deps.player.unlock?.();
    const deviceReady = await this.deps.fallback.prepare();
    if (this.deviceReady !== deviceReady) {
      this.deviceReady = deviceReady;
      this.notify();
    }
    return deviceReady || this.usable();
  }

  preload(text: string): void {
    if (!this.usable()) return;
    this.waiting.push(text);
    this.fill();
  }

  private clipKey(text: string): string {
    return `${this.settings.cloudVoice ?? ""}|${this.settings.persona ?? ""}|${text}`;
  }

  /**
   * ขอเสียงของข้อความสั้น ๆ ที่จะใช้บ่อยมาเก็บไว้ก่อน (เช่นคำตอบรับระหว่างรอ AI คิด)
   * ไม่ผูกกับรอบการพูด การยกเลิกจึงไม่ทิ้งเสียงที่เตรียมไว้
   */
  warmClips(texts: readonly string[]): void {
    if (!this.usable()) return;
    for (const text of texts) {
      const key = this.clipKey(text);
      if (this.clips.has(key) || this.clipRequests.has(key)) continue;
      this.clipRequests.add(key);
      this.deps
        .fetchSpeech(text, this.settings.cloudVoice, new AbortController().signal, this.settings.persona)
        .then((audio) => {
          this.clips.set(key, audio);
        })
        .catch(() => undefined)
        .finally(() => this.clipRequests.delete(key));
    }
  }

  /** เล่นเสียงที่เตรียมไว้ทันที คืน false ถ้ายังไม่มีเสียงของข้อความนี้ (ผู้เรียกไม่ต้องพูดแทน) */
  playClip(text: string): Promise<boolean> {
    const audio = this.usable() ? this.clips.get(this.clipKey(text)) : undefined;
    if (!audio || this.current || this.queue.length > 0) return Promise.resolve(false);
    this.deps.player.unlock?.();
    this.clipPlayback?.stop();
    const playback = this.deps.player.play(audio, this.settings.rate);
    this.clipPlayback = playback;
    return playback.finished.then((outcome) => {
      if (this.clipPlayback === playback) this.clipPlayback = null;
      return outcome === "ended" || outcome === "stopped";
    });
  }

  private speakWithFallback(text: string): Promise<void> {
    this.deps.fallback.setFallbackGender?.("female");
    return this.deps.fallback.speak(text);
  }

  async speak(text: string): Promise<void> {
    this.deps.player.unlock?.();
    const epoch = this.epoch;
    const head = this.queue[0];

    if (head && head.texts[head.next] === text) {
      const first = head.next === 0;
      head.next += 1;
      if (head.next >= head.texts.length) this.queue.shift();
      // ข้อความแรกของก้อนเป็นตัวเล่นเสียงทั้งก้อน ข้อความที่เหลืออยู่ในเสียงที่เล่นไปแล้ว
      if (first) head.failed = !(await this.playBatch(head, epoch));
      if (head.failed && epoch === this.epoch) await this.speakWithFallback(text);
      return;
    }

    // ไม่ได้ถูกบอกล่วงหน้า หรือถูกบอกไว้แต่ยังไม่ได้ขอเสียง: ขอเฉพาะข้อความนี้เลย
    const index = this.waiting.indexOf(text);
    if (index !== -1) this.waiting.splice(index, 1);
    if (!this.usable()) {
      await this.speakWithFallback(text);
      return;
    }
    const played = await this.playBatch(this.request([text]), epoch);
    if (!played && epoch === this.epoch) await this.speakWithFallback(text);
  }

  cancel(): void {
    this.epoch += 1;
    for (const abort of this.inFlight) abort.abort();
    this.inFlight.clear();
    this.waiting = [];
    this.queue = [];
    this.loading = 0;
    this.current?.stop();
    this.current = null;
    this.clipPlayback?.stop();
    this.clipPlayback = null;
    this.cancelled.resolve("cancelled");
    this.cancelled = createCancelSignal();
    this.deps.fallback.cancel();
  }

  private clock(): number {
    return (this.deps.now ?? Date.now)();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  /** ใช้เสียงของ Gemini ได้ตอนนี้: ผู้ใช้เปิดไว้ เซิร์ฟเวอร์ไม่ได้บอกว่าไม่มี และไม่ได้อยู่ระหว่างพัก */
  private usable(): boolean {
    if (!this.settings.cloud || this.deps.available() === false) return false;
    return !this.pause || this.clock() >= this.pause.until;
  }

  /** พักเสียงของ Gemini ไว้ตามเหตุของความล้มเหลว ข้อความถัดไปจะใช้เสียงในอุปกรณ์จนถึงเวลา */
  private suspend(error: unknown): void {
    const reason: CloudVoiceFailure = error instanceof CloudVoiceError ? error.kind : "failed";
    const wait = reason === "unavailable" ? Number.POSITIVE_INFINITY : ((error instanceof CloudVoiceError ? error.retryAfterMs : undefined) ?? PAUSE_MS[reason]);
    this.pause = { reason, until: this.clock() + wait };
    this.notify();
  }

  /** ขอเสียงของข้อความชุดนี้เป็นก้อนเดียว */
  private request(texts: string[]): Batch {
    const abort = new AbortController();
    const epoch = this.epoch;
    const audio = this.deps.fetchSpeech(texts.join(" "), this.settings.cloudVoice, abort.signal, this.settings.persona);
    this.inFlight.add(abort);
    audio
      .catch((error: unknown) => {
        // คำขอของรอบที่ถูกยกเลิกไปแล้วไม่ใช่ความล้มเหลวของเสียง Gemini
        if (epoch === this.epoch) this.suspend(error);
      })
      .finally(() => this.inFlight.delete(abort));
    return { texts, next: 0, audio, abort, failed: false };
  }

  /** ขอเสียงของข้อความที่รออยู่ ค้างพร้อมกันได้ไม่เกินเพดาน */
  private fill(): void {
    if (this.loading >= MAX_CONCURRENT_BATCHES || this.waiting.length === 0 || !this.usable()) return;

    // ไม่มีอะไรกำลังพูดหรือรอพูด: ขอช่วงแรกช่วงเดียวเพื่อให้เริ่มพูดเร็วที่สุด นอกนั้นรวมทุกช่วงที่รออยู่เท่าที่เพดานรับ
    const busy = this.queue.length > 0 || this.current !== null;
    const texts = [this.waiting.shift() as string];
    let length = texts[0]?.length ?? 0;
    while (busy && this.waiting.length > 0 && length + 1 + (this.waiting[0]?.length ?? 0) <= MAX_BATCH_LENGTH) {
      const more = this.waiting.shift() as string;
      texts.push(more);
      length += 1 + more.length;
    }

    const batch = this.request(texts);
    this.queue.push(batch);
    this.loading += 1;
    const epoch = this.epoch;
    batch.audio.then(
      () => {
        if (epoch !== this.epoch) return;
        this.loading -= 1;
        this.fill();
      },
      () => {
        if (epoch !== this.epoch) return;
        this.loading -= 1;
        // เสียงของ Gemini ถูกพักแล้ว ข้อความที่ยังไม่ได้ขอจะถูกพูดด้วยเสียงในอุปกรณ์ตอนถึงคิว
        this.waiting = [];
      }
    );
  }

  /**
   * เล่นเสียงของก้อนนี้จนจบ คืน false เมื่อเสียงใช้ไม่ได้และผู้เรียกต้องพูดด้วยเสียงในอุปกรณ์แทน
   * ถูกยกเลิกระหว่างทางถือว่าจบแล้ว ไม่ต้องพูดแทน
   */
  private async playBatch(batch: Batch, epoch: number): Promise<boolean> {
    let audio: Blob | "cancelled";
    try {
      audio = await Promise.race([batch.audio, this.cancelled.promise]);
    } catch {
      return epoch !== this.epoch;
    }
    if (audio === "cancelled" || epoch !== this.epoch) return true;

    // คำตอบจริงมาแล้ว: ตัดคำตอบรับที่ยังเล่นค้างอยู่ ไม่ให้เสียงซ้อนกัน
    this.clipPlayback?.stop();
    this.clipPlayback = null;
    const playback = this.deps.player.play(audio, this.settings.rate);
    this.current = playback;
    const outcome = await playback.finished;
    if (this.current === playback) this.current = null;
    if (epoch !== this.epoch) return true;
    return outcome === "ended" || outcome === "stopped";
  }
}
