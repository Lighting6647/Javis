/** อัตราตัวอย่างที่ Gemini 3.8 Voice Replication แนะนำ: 24kHz โมโน 16-bit PCM WAV */
export const TARGET_WAV_SAMPLE_RATE = 24_000;

export interface RecordedClip {
  blob: Blob;
  base64: string;
  durationSeconds: number;
  originalDurationSeconds?: number;
  samples24k?: Float32Array;
}

export interface SilenceTrimOptions {
  /** ค่า RMS ขั้นต่ำของเฟรม 20ms ที่ถือว่ามีเสียงพูด (ค่าเริ่มต้น 0.015) */
  threshold?: number;
  /** ช่วงเผื่อหัว-ท้ายเป็นวินาที เพื่อไม่ให้คำขึ้นต้น/ลงท้ายขาด (ค่าเริ่มต้น 0.12s) */
  padSeconds?: number;
  /** ความยาวขั้นต่ำหลังตัดเป็นวินาที หากสั้นกว่านี้จะขยายกรอบกลับ (ค่าเริ่มต้น 0.35s) */
  minKeepSeconds?: number;
}

const DEFAULT_SILENCE_RMS_THRESHOLD = 0.015;
const DEFAULT_TRIM_PAD_SECONDS = 0.12;
const DEFAULT_MIN_KEEP_SECONDS = 0.35;

/**
 * ตัดความเงียบและเสียงรบกวนเบาๆ ช่วงต้น/ท้ายของสัญญาณ PCM โมโนออกโดยอัตโนมัติ
 * ช่วยให้เสียงที่ส่งไปจำลองและจดจำโปรไฟล์ผู้พูดมีเนื้อเสียงพูดคมชัดขึ้น
 */
export function trimSilenceSamples(
  samples: Float32Array,
  sampleRate = TARGET_WAV_SAMPLE_RATE,
  options: SilenceTrimOptions = {}
): Float32Array {
  if (samples.length === 0 || sampleRate <= 0) return samples;

  const threshold = options.threshold ?? DEFAULT_SILENCE_RMS_THRESHOLD;
  const padSeconds = options.padSeconds ?? DEFAULT_TRIM_PAD_SECONDS;
  const minKeepSeconds = options.minKeepSeconds ?? DEFAULT_MIN_KEEP_SECONDS;

  const frameSamples = Math.max(1, Math.round(sampleRate * 0.02));
  const frameCount = Math.ceil(samples.length / frameSamples);

  let firstVoiced = -1;
  let lastVoiced = -1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * frameSamples;
    const end = Math.min(samples.length, start + frameSamples);
    let sumSquares = 0;
    for (let i = start; i < end; i += 1) {
      const s = samples[i] ?? 0;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
    if (rms >= threshold) {
      if (firstVoiced === -1) firstVoiced = frame;
      lastVoiced = frame;
    }
  }

  // ไม่มีช่วงใดดังพอ (เช่น ไฟล์เงียบทั้งคลิป): คืนสัญญาณเดิมเพื่อไม่ให้คลิปว่างเปล่า
  if (firstVoiced === -1 || lastVoiced === -1) return samples;

  const padSamples = Math.round(sampleRate * padSeconds);
  let startSample = Math.max(0, firstVoiced * frameSamples - padSamples);
  let endSample = Math.min(samples.length, (lastVoiced + 1) * frameSamples + padSamples);

  const minSamples = Math.min(samples.length, Math.round(sampleRate * minKeepSeconds));
  if (endSample - startSample < minSamples) {
    const center = Math.floor((startSample + endSample) / 2);
    startSample = Math.max(0, center - Math.floor(minSamples / 2));
    endSample = Math.min(samples.length, startSample + minSamples);
    startSample = Math.max(0, endSample - minSamples);
  }

  if (startSample === 0 && endSample === samples.length) return samples;
  return samples.slice(startSample, endSample);
}

const MAX_UPLOAD_AUDIO_BYTES = 15 * 1024 * 1024;
const ALLOWED_AUDIO_EXT = /\.(wav|mp3|m4a|mp4|aac|ogg|webm)$/i;

export interface ActiveVoiceRecording {
  stop: () => Promise<RecordedClip>;
  cancel: () => void;
}

export function encodeWavFromPcm16(pcmSamples: Int16Array, sampleRate = TARGET_WAV_SAMPLE_RATE): Uint8Array {
  const dataLength = pcmSamples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  for (let i = 0; i < pcmSamples.length; i += 1) {
    view.setInt16(44 + i * 2, pcmSamples[i] ?? 0, true);
  }
  return new Uint8Array(buffer);
}

/** แปลงตัวอย่างเสียง float32 เป็น 16-bit PCM พร้อมบีบค่าให้อยู่ในช่วง [-1, 1] */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    output[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return output;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function decodeToWav24kMono(rawBlob: Blob, maxDurationSeconds?: number): Promise<RecordedClip> {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("เบราว์เซอร์นี้ไม่รองรับการประมวลผลเสียง Web Audio");
  }

  const ctx = new AudioCtx();
  try {
    const rawBuffer = await rawBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(rawBuffer.slice(0));
    const clippedDuration = maxDurationSeconds ? Math.min(decoded.duration, maxDurationSeconds) : decoded.duration;
    const frameCount = Math.max(1, Math.round(clippedDuration * TARGET_WAV_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frameCount, TARGET_WAV_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0, 0, clippedDuration);
    const rendered = await offline.startRendering();
    const rawSamples24k = new Float32Array(rendered.getChannelData(0));
    const samples24k = trimSilenceSamples(rawSamples24k, TARGET_WAV_SAMPLE_RATE);
    const trimmedDuration = samples24k.length / TARGET_WAV_SAMPLE_RATE;
    const pcm16 = floatToPcm16(samples24k);
    const wavBytes = encodeWavFromPcm16(pcm16, TARGET_WAV_SAMPLE_RATE);
    const wavCopy = new Uint8Array(wavBytes.length);
    wavCopy.set(wavBytes);
    const wavBlob = new Blob([wavCopy], { type: "audio/wav" });
    return {
      blob: wavBlob,
      base64: bytesToBase64(wavBytes),
      durationSeconds: Math.round(trimmedDuration * 10) / 10,
      originalDurationSeconds: Math.round(clippedDuration * 10) / 10,
      samples24k
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/**
 * อ่านไฟล์เสียงที่ผู้ใช้อัปโหลด (.wav, .mp3, .m4a, .ogg, .webm) และแปลงเป็น WAV 24kHz โมโน
 */
export async function readUploadedAudioClip(file: File, maxDurationSeconds: number): Promise<RecordedClip> {
  if (file.size === 0) throw new Error("ไฟล์เสียงว่างเปล่า กรุณาเลือกไฟล์อื่น");
  if (file.size > MAX_UPLOAD_AUDIO_BYTES) {
    throw new Error("ไฟล์เสียงมีขนาดใหญ่เกิน 15 MB กรุณาเลือกคลิปสั้นกว่านี้");
  }
  const hasAudioMime = file.type.startsWith("audio/") || file.type === "video/mp4";
  if (!hasAudioMime && !ALLOWED_AUDIO_EXT.test(file.name)) {
    throw new Error("รองรับเฉพาะไฟล์เสียง (.wav, .mp3, .m4a, .aac, .ogg, .webm)");
  }
  return decodeToWav24kMono(file, maxDurationSeconds);
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
}

/**
 * อัดเสียงจากไมโครโฟน (รองรับทั้ง Desktop Chrome/Edge และ iPhone Safari/PWA)
 * แล้วแปลงเป็นไฟล์ WAV 24kHz โมโน 16-bit พร้อมระดับเสียงแบบเรียลไทม์
 */
export async function startVoiceRecording(options: {
  maxDurationSeconds: number;
  onLevel?: (level: number) => void;
  onElapsed?: (seconds: number) => void;
  onAutoStop?: (clip: RecordedClip) => void;
  onError?: (message: string) => void;
}): Promise<ActiveVoiceRecording> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("อุปกรณ์หรือเบราว์เซอร์นี้ยังไม่รองรับการอัดเสียงจากไมโครโฟน");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch {
    throw new Error("ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตสิทธิ์ไมโครโฟนแล้วลองใหม่");
  }

  const mimeType = pickRecorderMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let cancelled = false;
  let stopped = false;
  let meterTimer: number | null = null;
  let autoStopTimer: number | null = null;
  const startedAt = Date.now();

  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const meterCtx = AudioCtx ? new AudioCtx() : null;
  const analyser = meterCtx ? meterCtx.createAnalyser() : null;
  let meterSource: MediaStreamAudioSourceNode | null = null;
  const levelSamples = analyser ? new Uint8Array(analyser.fftSize) : null;
  if (meterCtx && analyser) {
    try {
      meterSource = meterCtx.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      meterSource.connect(analyser);
    } catch {
      // ข้ามตัววัดเสียงได้หากเบราว์เซอร์ไม่อนุญาต
    }
  }

  const cleanup = () => {
    if (meterTimer !== null) window.clearInterval(meterTimer);
    if (autoStopTimer !== null) window.clearTimeout(autoStopTimer);
    meterSource?.disconnect();
    void meterCtx?.close().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
    options.onLevel?.(0);
  };

  const stopPromise = new Promise<RecordedClip>((resolve, reject) => {
    recorder.onstop = () => {
      cleanup();
      if (cancelled) {
        reject(new Error("cancelled"));
        return;
      }
      const raw = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      void decodeToWav24kMono(raw).then(resolve, (err) => {
        reject(err instanceof Error ? err : new Error("แปลงไฟล์เสียงไม่สำเร็จ"));
      });
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("การอัดเสียงขัดข้อง กรุณาลองใหม่"));
    };
  });

  meterTimer = window.setInterval(() => {
    options.onElapsed?.((Date.now() - startedAt) / 1000);
    if (!analyser || !levelSamples) return;
    analyser.getByteTimeDomainData(levelSamples);
    let peak = 0;
    for (let i = 0; i < levelSamples.length; i += 1) {
      const normalized = Math.abs(((levelSamples[i] ?? 128) - 128) / 128);
      if (normalized > peak) peak = normalized;
    }
    options.onLevel?.(Math.min(1, peak * 2.4));
  }, 80);

  autoStopTimer = window.setTimeout(() => {
    if (stopped || cancelled) return;
    stopped = true;
    try {
      recorder.stop();
      void stopPromise.then(
        (clip) => options.onAutoStop?.(clip),
        (err) => options.onError?.(err instanceof Error ? err.message : "อัดเสียงไม่สำเร็จ")
      );
    } catch {
      cleanup();
    }
  }, options.maxDurationSeconds * 1000);

  recorder.start(250);

  return {
    stop() {
      if (!stopped && !cancelled) {
        stopped = true;
        try {
          recorder.stop();
        } catch {
          cleanup();
        }
      }
      return stopPromise;
    },
    cancel() {
      if (cancelled || stopped) return;
      cancelled = true;
      stopped = true;
      try {
        recorder.stop();
      } catch {
        cleanup();
      }
    }
  };
}
