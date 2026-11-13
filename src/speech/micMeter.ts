/**
 * ตัววัดระดับเสียงไมโครโฟน สำหรับวงคลื่นเสียงของแกนกลางบนจอ HUD ระหว่างที่ Javis กำลังฟัง
 *
 * ระบบฟังของเบราว์เซอร์ (Web Speech API) ไม่บอกระดับเสียง จึงต้องเปิดสตรีมไมโครโฟนอีกเส้นไว้วัดอย่างเดียว
 * เสียงถูกวิเคราะห์ในหน้าเว็บเท่านั้น ไม่ถูกอัด ไม่ถูกเก็บ และไม่ถูกส่งไปที่ใด
 * ตัววัดเป็นของแถม: ถ้าวัดไม่ได้ด้วยเหตุใดก็ตาม การฟังต้องทำงานตามเดิม และวงคลื่นเสียงกลับไปขยับตามจังหวะแทน
 */

import { isHandheld } from "./device";

/** ขนาด FFT ของตัววิเคราะห์: ได้ 256 ช่องความถี่ กว้างช่องละราว 94 เฮิรตซ์ที่อัตราสุ่ม 48 กิโลเฮิรตซ์ */
export const METER_FFT_SIZE = 512;
/** จำนวนช่องความถี่ที่ใช้ ไม่นับช่องแรก ครอบคลุมย่านเสียงพูดถึงราว 5.6 กิโลเฮิรตซ์ */
const VOICE_BINS = 60;
/** เสียงพูดเบาลงตามความถี่ จึงขยายย่านสูงขึ้นทีละน้อย ให้แท่งด้านล่างของวงยังขยับเห็นได้ */
const HIGH_BAND_GAIN = 0.9;

/** ส่วนของสตรีมไมโครโฟนที่ตัววัดใช้ */
export interface MeterStream {
  getTracks(): Array<{ stop(): void }>;
}

/** ตัววิเคราะห์ความถี่ของสตรีมหนึ่งเส้น */
export interface MeterAnalyser {
  /** จำนวนช่องความถี่ที่ read จะเติมให้ */
  readonly binCount: number;
  /** เติมความดังของแต่ละช่องความถี่ (0..255) ณ ขณะนี้ */
  read(bins: Uint8Array<ArrayBuffer>): void;
  close(): void;
}

/** สิ่งที่ตัววัดต้องการจากเบราว์เซอร์ แยกไว้เพื่อให้ทดสอบได้ด้วยตัวจำลอง */
export interface MicMeterDeps {
  /** สถานะสิทธิ์ไมโครโฟนของเว็บนี้ โดยไม่ทำให้เบราว์เซอร์ถามผู้ใช้ */
  permission: () => Promise<string>;
  open: () => Promise<MeterStream>;
  analyse: (stream: MeterStream) => MeterAnalyser;
}

export interface MicMeter {
  /** เริ่มวัด คืน true เมื่อวัดได้ ไม่โยนข้อผิดพลาด */
  start(): Promise<boolean>;
  /** หยุดวัดและปิดไมโครโฟนเส้นที่เปิดไว้วัด */
  stop(): void;
  /** เติมระดับของแต่ละแท่ง (0..1) ตามเสียง ณ ขณะนี้ คืน false ถ้าไม่ได้วัดอยู่ */
  read(levels: Float32Array): boolean;
}

/**
 * แปลงสเปกตรัมเสียงเป็นระดับของแท่งรอบวง (0..1) โดยให้ซ้ายขวาสมมาตรกัน:
 * แท่งแรกและแท่งสุดท้าย (บนสุดของวง) คือเสียงต่ำ ไล่ลงไปหาเสียงสูงที่ด้านล่างของวง
 */
export function spectrumToLevels(bins: Uint8Array, levels: Float32Array): void {
  const half = Math.ceil(levels.length / 2);
  // ช่องแรกของสเปกตรัมเป็นค่าคงที่ของสัญญาณ ไม่ใช่เสียง จึงเริ่มที่ช่องที่สอง
  const usable = Math.min(Math.max(bins.length - 1, 0), VOICE_BINS);
  const binsPerBar = usable / Math.max(half, 1);

  for (let bar = 0; bar < half; bar += 1) {
    let level = 0;
    if (usable > 0) {
      const from = 1 + Math.floor(bar * binsPerBar);
      const to = Math.max(from + 1, 1 + Math.floor((bar + 1) * binsPerBar));
      let sum = 0;
      let count = 0;
      for (let bin = from; bin < to && bin <= usable; bin += 1) {
        sum += bins[bin] ?? 0;
        count += 1;
      }
      const gain = 1 + HIGH_BAND_GAIN * (half > 1 ? bar / (half - 1) : 0);
      level = count > 0 ? Math.min(1, (sum / count / 255) * gain) : 0;
    }
    levels[bar] = level;
    levels[levels.length - 1 - bar] = level;
  }
}

export interface MeterEnvironment {
  userAgent: string;
  /** จำนวนจุดสัมผัสที่จอรองรับ ใช้แยก iPad ซึ่งบอกตัวเองว่าเป็น Mac */
  touchPoints: number;
  /** เบราว์เซอร์มีระบบเปิดไมโครโฟนให้หน้าเว็บ */
  mediaDevices: boolean;
  native: boolean;
  desktopApp: boolean;
  /** อุปกรณ์ตั้งค่าลดการเคลื่อนไหว */
  reducedMotion: boolean;
}

/**
 * อุปกรณ์นี้ควรเปิดไมโครโฟนเส้นที่สองไว้วัดระดับเสียงไหม
 * เปิดเฉพาะเบราว์เซอร์บนคอมพิวเตอร์ ซึ่งหลายโปรแกรมใช้ไมโครโฟนพร้อมกันได้
 * บนมือถือและแท็บเล็ต ไมโครโฟนตัวเดียวกันอาจถูกแย่งจากระบบฟังจนฟังไม่ได้ จึงไม่เสี่ยง
 * แอปเดสก์ท็อปและแอปมือถือมีเส้นทางเสียงของตัวเอง ยังไม่ได้ต่อกับตัววัดนี้
 */
export function canMeterMicrophone(env: MeterEnvironment): boolean {
  if (env.native || env.desktopApp || !env.mediaDevices || env.reducedMotion) return false;
  return !isHandheld(env.userAgent, env.touchPoints);
}

function release(stream: MeterStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // แทร็กปิดไปแล้ว
    }
  }
}

export function createMicMeter(deps: MicMeterDeps): MicMeter {
  /** เพิ่มทุกครั้งที่สั่งหยุด งานเปิดไมโครโฟนที่ค้างจากรอบเก่าจะรู้ตัวและปิดสิ่งที่เพิ่งได้มา */
  let generation = 0;
  let active: { stream: MeterStream; analyser: MeterAnalyser; bins: Uint8Array<ArrayBuffer> } | null = null;
  let starting: Promise<boolean> | null = null;

  async function open(run: number): Promise<boolean> {
    let stream: MeterStream;
    try {
      // เปิดเฉพาะเมื่อผู้ใช้อนุญาตไมโครโฟนให้เว็บนี้แล้ว (ผ่านระบบฟัง) ไม่เช่นนั้นเบราว์เซอร์จะถามผู้ใช้ซ้อนกันสองรอบ
      if ((await deps.permission()) !== "granted") return false;
      if (run !== generation) return false;
      stream = await deps.open();
    } catch {
      return false;
    }

    if (run !== generation) {
      release(stream);
      return false;
    }
    try {
      const analyser = deps.analyse(stream);
      active = { stream, analyser, bins: new Uint8Array(analyser.binCount) };
      return true;
    } catch {
      release(stream);
      return false;
    }
  }

  return {
    start() {
      if (active) return Promise.resolve(true);
      if (starting) return starting;

      const attempt = open(generation).finally(() => {
        if (starting === attempt) starting = null;
      });
      starting = attempt;
      return attempt;
    },

    stop() {
      generation += 1;
      starting = null;
      const current = active;
      active = null;
      if (!current) return;

      try {
        current.analyser.close();
      } catch {
        // ปิดไปแล้ว ยังต้องปิดไมโครโฟนต่อ
      }
      release(current.stream);
    },

    read(levels) {
      if (!active) return false;
      active.analyser.read(active.bins);
      spectrumToLevels(active.bins, levels);
      return true;
    }
  };
}

/** ต่อตัววัดเข้ากับไมโครโฟนและระบบเสียงของเบราว์เซอร์จริง */
export function browserMeterDeps(): MicMeterDeps {
  return {
    permission: async () => (await navigator.permissions.query({ name: "microphone" as PermissionName })).state,
    // ปิดการปรับแต่งเสียงทุกอย่าง: ต้องการแค่ดูระดับเสียง และไม่อยากให้ระบบปฏิบัติการถือว่าเป็นการโทร (ซึ่งหรี่เสียงอื่นลง)
    open: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }),
    analyse: (stream) => {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream as MediaStream);
      const analyser = context.createAnalyser();
      analyser.fftSize = METER_FFT_SIZE;
      analyser.smoothingTimeConstant = 0.72;
      // ต่อเข้าตัววิเคราะห์อย่างเดียว ไม่ต่อออกลำโพง เสียงของผู้ใช้จึงไม่ถูกเล่นกลับ
      source.connect(analyser);
      void context.resume().catch(() => undefined);

      return {
        binCount: analyser.frequencyBinCount,
        read: (bins) => analyser.getByteFrequencyData(bins),
        close: () => {
          source.disconnect();
          void context.close().catch(() => undefined);
        }
      };
    }
  };
}
