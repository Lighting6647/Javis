/**
 * ระบบจดจำลักษณะเสียงของผู้ใช้บนอุปกรณ์ (On-device Acoustic Speaker Profile)
 * สกัดคุณลักษณะความถี่เสียงพูด 8 ย่าน (85 Hz - 4,000 Hz) + Zero-Crossing Rate + Spectral Centroid
 * ใช้แยกผู้พูดหลัก ("ไลท์") ออกจากคู่สนทนาในโหมดสรุปการประชุมโดยไม่ส่งไฟล์เสียงออกนอกเครื่อง
 */

export interface SpeakerProfile {
  label: string;
  /** เวกเตอร์เอกลักษณ์เสียง 10 มิติ (normalized L2) */
  vector: number[];
  updatedAt: number;
}

const STORAGE_KEY = "javis.speakerProfile";
const BAND_EDGES_HZ = [85, 160, 260, 450, 750, 1250, 2000, 3000, 4000] as const;
const MATCH_THRESHOLD = 0.86;
const MIN_SIGNAL_RMS = 0.012;

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * แปลงค่าระดับพลังงานสเปกตรัม FFT (magnitude linear >= 0) เป็นเวกเตอร์เอกลักษณ์ 10 มิติ
 * ใช้ได้ทั้งกับ offline PCM window (ผ่าน DFT สั้น) และ live AnalyserNode
 */
export function buildAcousticVectorFromSpectrum(
  magnitudes: Float32Array | number[],
  sampleRate: number,
  zeroCrossingRate: number
): number[] | null {
  const nBins = magnitudes.length;
  if (nBins < 16 || sampleRate <= 0) return null;

  const nyquist = sampleRate / 2;
  const binHz = nyquist / nBins;
  const bandEnergies: number[] = [];
  let weightedFreqSum = 0;
  let totalMag = 0;

  for (let band = 0; band < BAND_EDGES_HZ.length - 1; band += 1) {
    const low = BAND_EDGES_HZ[band] ?? 85;
    const high = BAND_EDGES_HZ[band + 1] ?? 4000;
    const startBin = Math.max(1, Math.floor(low / binHz));
    const endBin = Math.min(nBins - 1, Math.ceil(high / binHz));
    let sum = 0;
    let count = 0;
    for (let k = startBin; k <= endBin; k += 1) {
      const mag = Math.max(0, magnitudes[k] ?? 0);
      sum += mag;
      count += 1;
      weightedFreqSum += mag * (k * binHz);
      totalMag += mag;
    }
    const mean = count > 0 ? sum / count : 0;
    bandEnergies.push(Math.log1p(mean * 100));
  }

  if (totalMag <= 1e-6) return null;
  const centroidNorm = Math.min(1, weightedFreqSum / totalMag / 4000);
  const zcrNorm = Math.min(1, Math.max(0, zeroCrossingRate * 4));
  const raw = [...bandEnergies, centroidNorm, zcrNorm];
  const norm = Math.hypot(...raw);
  if (norm <= 1e-6) return null;
  return raw.map((val) => Math.round((val / norm) * 10_000) / 10_000);
}

/** คำนวณ DFT เฉพาะย่านเสียงพูด 85-4000 Hz จากตัวอย่าง PCM เพื่อสร้างโปรไฟล์เสียงของคุณไลท์จากไฟล์ WAV */
export function extractSpeakerVectorFromPcm(samples: Float32Array, sampleRate: number): number[] | null {
  if (samples.length < 512 || sampleRate <= 0) return null;

  const frameSize = 512;
  const hop = 256;
  const nBins = frameSize / 2;
  const avgMagnitudes = new Float32Array(nBins);
  let activeFrames = 0;
  let totalZcr = 0;

  // พรีคำนวณ Hamming window
  const win = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i += 1) {
    win[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
  }

  // เลือกประมวลผลสูงสุด 120 เฟรมที่ดังพอ (voiced segments) เพื่อความเร็ว (<15ms)
  for (let start = 0; start + frameSize <= samples.length && activeFrames < 120; start += hop) {
    let sq = 0;
    let crossings = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const s = samples[start + i] ?? 0;
      sq += s * s;
      if (i > 0 && ((samples[start + i - 1] ?? 0) >= 0) !== (s >= 0)) crossings += 1;
    }
    const rms = Math.sqrt(sq / frameSize);
    if (rms < MIN_SIGNAL_RMS) continue;

    activeFrames += 1;
    totalZcr += crossings / frameSize;
    const nyquist = sampleRate / 2;
    const minBin = Math.max(1, Math.floor((85 / nyquist) * nBins));
    const maxBin = Math.min(nBins - 1, Math.ceil((4000 / nyquist) * nBins));

    for (let k = minBin; k <= maxBin; k += 1) {
      let re = 0;
      let im = 0;
      const freq = (2 * Math.PI * k) / frameSize;
      for (let n = 0; n < frameSize; n += 1) {
        const windowed = ((samples[start + n] ?? 0) * (win[n] ?? 1)) / frameSize;
        re += windowed * Math.cos(freq * n);
        im -= windowed * Math.sin(freq * n);
      }
      avgMagnitudes[k] += Math.hypot(re, im);
    }
  }

  if (activeFrames === 0) return null;
  for (let k = 0; k < nBins; k += 1) avgMagnitudes[k] /= activeFrames;
  return buildAcousticVectorFromSpectrum(avgMagnitudes, sampleRate, totalZcr / activeFrames);
}

export function classifySpeakerVector(
  candidate: readonly number[] | null,
  profile: SpeakerProfile | null
): string | undefined {
  if (!profile) return undefined;
  if (!candidate) return undefined;
  return cosineSimilarity(candidate, profile.vector) >= MATCH_THRESHOLD ? profile.label : "คู่สนทนา";
}

function load(): SpeakerProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpeakerProfile>;
    if (
      typeof parsed.label === "string" &&
      parsed.label.trim() &&
      Array.isArray(parsed.vector) &&
      parsed.vector.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return { label: parsed.label.trim(), vector: parsed.vector, updatedAt: parsed.updatedAt ?? Date.now() };
    }
    return null;
  } catch {
    return null;
  }
}

let current = load();
const listeners = new Set<() => void>();

export const speakerProfileStore = {
  get: (): SpeakerProfile | null => current,
  saveFromPcm: (label: string, samples: Float32Array, sampleRate: number): SpeakerProfile | null => {
    const vector = extractSpeakerVectorFromPcm(samples, sampleRate);
    if (!vector) return null;
    const next: SpeakerProfile = { label: label.trim() || "ไลท์", vector, updatedAt: Date.now() };
    current = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ข้ามได้ถ้าพื้นที่เต็ม
    }
    listeners.forEach((l) => l());
    return next;
  },
  clear: (): void => {
    current = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ข้าม
    }
    listeners.forEach((l) => l());
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
