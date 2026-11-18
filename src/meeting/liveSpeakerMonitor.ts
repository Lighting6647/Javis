import {
  buildAcousticVectorFromSpectrum,
  classifySpeakerProfiles,
  DEFAULT_MATCH_THRESHOLD,
  type SpeakerProfile,
  type SpeakerProfileState
} from "./speakerProfile";

/**
 * ติดตามลักษณะความถี่เสียงพูดล่าสุดระหว่างเปิดโหมดสรุปการประชุม
 * เพื่อระบุว่าคำพูดแต่ละช่วงน่าจะเป็นเจ้าของเสียงใดที่บันทึกไว้ ("ไลท์", ทีมงาน) หรือ "คู่สนทนา"
 */
export interface LiveSpeakerMonitor {
  start: () => Promise<void>;
  stop: () => void;
  identifyRecent: () => string | undefined;
}

type ProfileSource = () => SpeakerProfileState | SpeakerProfile | null;

function resolveSource(source: ReturnType<ProfileSource>): SpeakerProfileState {
  if (!source) return { profiles: [], threshold: DEFAULT_MATCH_THRESHOLD };
  if ("profiles" in source) return source;
  return { profiles: [source], threshold: DEFAULT_MATCH_THRESHOLD };
}

export function createLiveSpeakerMonitor(getProfiles: ProfileSource): LiveSpeakerMonitor {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let timer: number | null = null;
  let lastSpeaker: string | undefined;
  let lastHeardAt = 0;

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

  const start = async () => {
    stop();
    const initial = resolveSource(getProfiles());
    if (initial.profiles.length === 0) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;

    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

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
        const current = resolveSource(getProfiles());
        if (current.profiles.length === 0) return;

        analyser.getFloatTimeDomainData(timeBuf);
        let sq = 0;
        let crossings = 0;
        for (let i = 0; i < timeBuf.length; i += 1) {
          const s = timeBuf[i] ?? 0;
          sq += s * s;
          if (i > 0 && ((timeBuf[i - 1] ?? 0) >= 0) !== (s >= 0)) crossings += 1;
        }
        const rms = Math.sqrt(sq / timeBuf.length);
        if (rms < 0.015) return;

        analyser.getFloatFrequencyData(freqDb);
        for (let i = 0; i < freqDb.length; i += 1) {
          const db = freqDb[i] ?? -120;
          freqMag[i] = db > -100 ? Math.pow(10, db / 20) : 0;
        }
        const vec = buildAcousticVectorFromSpectrum(freqMag, sampleRate, crossings / timeBuf.length);
        const speaker = classifySpeakerProfiles(vec, current.profiles, current.threshold);
        if (speaker) {
          lastSpeaker = speaker;
          lastHeardAt = Date.now();
        }
      }, 120);
    } catch {
      stop();
    }
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
