import {
  buildAcousticVectorFromSpectrum,
  DEFAULT_MATCH_THRESHOLD,
  scoreSpeakerProfiles,
  type SpeakerProfile,
  type SpeakerProfileState
} from "./speakerProfile";

/**
 * ติดตามลักษณะความถี่เสียงพูดล่าสุดระหว่างเปิดโหมดสรุปการประชุม
 * และใช้ทดสอบเทียบเสียงสดก่อนประชุม เพื่อระบุผู้พูดที่บันทึกไว้ ("ไลท์", ทีมงาน) หรือ "คู่สนทนา"
 */
export interface LiveSpeakerMonitor {
  start: () => Promise<void>;
  stop: () => void;
  identifyRecent: () => string | undefined;
}

export interface CalibrationReading {
  rms: number;
  scorePercent: number;
  bestProfileLabel?: string;
  matchedLabel?: string;
  thresholdPercent: number;
}

type ProfileSource = () => SpeakerProfileState | SpeakerProfile | null;

function resolveSource(source: ReturnType<ProfileSource>): SpeakerProfileState {
  if (!source) return { profiles: [], threshold: DEFAULT_MATCH_THRESHOLD };
  if ("profiles" in source) return source;
  return { profiles: [source], threshold: DEFAULT_MATCH_THRESHOLD };
}

interface MicSampler {
  stop: () => void;
}

async function startMicSpectrumSampler(
  onSample: (vector: number[] | null, rms: number) => void,
  onError?: (message: string) => void
): Promise<MicSampler | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    onError?.("เบราว์เซอร์นี้ไม่รองรับการเข้าถึงไมโครโฟนค่ะ");
    return null;
  }

  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    onError?.("เบราว์เซอร์นี้ไม่รองรับ Web Audio API ค่ะ");
    return null;
  }

  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let timer: number | null = null;

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    void ctx?.close().catch(() => undefined);
    ctx = null;
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const timeBuf = new Float32Array(analyser.fftSize);
    const freqDb = new Float32Array(analyser.frequencyBinCount);
    const freqMag = new Float32Array(analyser.frequencyBinCount);
    const sampleRate = ctx.sampleRate;

    timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(timeBuf);
      let sq = 0;
      let crossings = 0;
      for (let i = 0; i < timeBuf.length; i += 1) {
        const s = timeBuf[i] ?? 0;
        sq += s * s;
        if (i > 0 && ((timeBuf[i - 1] ?? 0) >= 0) !== (s >= 0)) crossings += 1;
      }
      const rms = Math.sqrt(sq / timeBuf.length);
      if (rms < 0.015) {
        onSample(null, rms);
        return;
      }

      analyser.getFloatFrequencyData(freqDb);
      for (let i = 0; i < freqDb.length; i += 1) {
        const db = freqDb[i] ?? -120;
        freqMag[i] = db > -100 ? Math.pow(10, db / 20) : 0;
      }
      onSample(buildAcousticVectorFromSpectrum(freqMag, sampleRate, crossings / timeBuf.length), rms);
    }, 120);

    return { stop };
  } catch {
    stop();
    onError?.("เปิดไมโครโฟนเพื่อทดสอบเทียบเสียงไม่สำเร็จ กรุณาตรวจสิทธิ์ไมโครโฟนค่ะ");
    return null;
  }
}

export function createLiveSpeakerMonitor(getProfiles: ProfileSource): LiveSpeakerMonitor {
  let sampler: MicSampler | null = null;
  let lastSpeaker: string | undefined;
  let lastHeardAt = 0;

  const stop = () => {
    sampler?.stop();
    sampler = null;
  };

  const start = async () => {
    stop();
    const initial = resolveSource(getProfiles());
    if (initial.profiles.length === 0) return;

    sampler = await startMicSpectrumSampler((vec) => {
      if (!vec) return;
      const current = resolveSource(getProfiles());
      if (current.profiles.length === 0) return;
      const result = scoreSpeakerProfiles(vec, current.profiles, current.threshold);
      if (result.matchedLabel) {
        lastSpeaker = result.matchedLabel;
        lastHeardAt = Date.now();
      }
    });
  };

  return {
    start,
    stop,
    identifyRecent: () => {
      const current = resolveSource(getProfiles());
      if (current.profiles.length === 0) return undefined;
      if (!lastSpeaker || Date.now() - lastHeardAt > 6000) return undefined;
      return lastSpeaker;
    }
  };
}

/** เปิดโหมดทดสอบเทียบเสียงสดกับโปรไฟล์ที่บันทึกไว้ จนกว่าผู้เรียกจะสั่งหยุด */
export async function startSpeakerCalibration(
  getProfiles: ProfileSource,
  onReading: (reading: CalibrationReading) => void,
  onError: (message: string) => void
): Promise<(() => void) | null> {
  const sampler = await startMicSpectrumSampler((vec, rms) => {
    const current = resolveSource(getProfiles());
    if (current.profiles.length === 0) return;
    if (!vec) {
      onReading({
        rms,
        scorePercent: 0,
        thresholdPercent: Math.round(current.threshold * 100)
      });
      return;
    }
    const scored = scoreSpeakerProfiles(vec, current.profiles, current.threshold);
    onReading({
      rms,
      scorePercent: Math.round(scored.bestScore * 100),
      bestProfileLabel: scored.bestProfileLabel,
      matchedLabel: scored.matchedLabel,
      thresholdPercent: Math.round(scored.threshold * 100)
    });
  }, onError);

  return sampler ? sampler.stop : null;
}
