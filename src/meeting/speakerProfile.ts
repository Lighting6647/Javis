/**
 * ระบบจดจำลักษณะเสียงของผู้ใช้บนอุปกรณ์ (On-device Acoustic Speaker Profile)
 * สกัดคุณลักษณะความถี่เสียงพูด 8 ย่าน (85 Hz - 4,000 Hz) + Zero-Crossing Rate + Spectral Centroid
 * ใช้แยกผู้พูดหลายคน ("ไลท์", ชื่อทีมงาน) ออกจาก "คู่สนทนา" ในโหมดสรุปการประชุมโดยไม่ส่งไฟล์เสียงออกนอกเครื่อง
 */

export interface SpeakerProfile {
  id: string;
  label: string;
  /** เวกเตอร์เอกลักษณ์เสียง 10 มิติ (normalized L2) */
  vector: number[];
  updatedAt: number;
}

export interface SpeakerProfileState {
  profiles: SpeakerProfile[];
  threshold: number;
}

const STORAGE_KEY = "javis.speakerProfile";
const BAND_EDGES_HZ = [85, 160, 260, 450, 750, 1250, 2000, 3000, 4000] as const;
export const DEFAULT_MATCH_THRESHOLD = 0.86;
export const MIN_MATCH_THRESHOLD = 0.72;
export const MAX_MATCH_THRESHOLD = 0.95;
const MIN_SIGNAL_RMS = 0.012;
const MAX_PROFILES = 12;

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

export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MATCH_THRESHOLD;
  return Math.round(Math.min(MAX_MATCH_THRESHOLD, Math.max(MIN_MATCH_THRESHOLD, value)) * 100) / 100;
}

export interface SpeakerMatchResult {
  matchedLabel: string | undefined;
  bestProfileLabel: string | undefined;
  bestScore: number;
  threshold: number;
}

/**
 * คำนวณคะแนนความคล้าย (0..1) ของเวกเตอร์เสียงเทียบกับโปรไฟล์ทั้งหมด พร้อมผู้ที่ตรงที่สุดและผลตัดสินตามเกณฑ์
 */
export function scoreSpeakerProfiles(
  candidate: readonly number[] | null,
  profiles: readonly Pick<SpeakerProfile, "label" | "vector">[],
  threshold = DEFAULT_MATCH_THRESHOLD
): SpeakerMatchResult {
  const effectiveThreshold = clampThreshold(threshold);
  if (!profiles.length || !candidate) {
    return { matchedLabel: undefined, bestProfileLabel: undefined, bestScore: 0, threshold: effectiveThreshold };
  }

  let bestLabel: string | undefined;
  let bestScore = -1;
  for (const profile of profiles) {
    const score = cosineSimilarity(candidate, profile.vector);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = profile.label;
    }
  }
  const safeBest = Math.max(0, bestScore);
  return {
    matchedLabel: bestLabel && safeBest >= effectiveThreshold ? bestLabel : "คู่สนทนา",
    bestProfileLabel: bestLabel,
    bestScore: safeBest,
    threshold: effectiveThreshold
  };
}

/**
 * เทียบเวกเตอร์เสียงกับรายการโปรไฟล์ผู้พูดทั้งหมดที่บันทึกไว้ แล้วเลือกผู้ที่คล้ายที่สุดหากผ่านค่า threshold
 * หากไม่มีใครถึงเกณฑ์ คืน "คู่สนทนา" และหากยังไม่มีโปรไฟล์เลย คืน undefined
 */
export function classifySpeakerProfiles(
  candidate: readonly number[] | null,
  profiles: readonly Pick<SpeakerProfile, "label" | "vector">[],
  threshold = DEFAULT_MATCH_THRESHOLD
): string | undefined {
  return scoreSpeakerProfiles(candidate, profiles, threshold).matchedLabel;
}

export function classifySpeakerVector(
  candidate: readonly number[] | null,
  profile: Pick<SpeakerProfile, "label" | "vector"> | null,
  threshold = DEFAULT_MATCH_THRESHOLD
): string | undefined {
  if (!profile) return undefined;
  return classifySpeakerProfiles(candidate, [profile], threshold);
}

function isValidProfile(item: unknown): item is SpeakerProfile {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<SpeakerProfile>;
  return (
    typeof candidate.label === "string" &&
    candidate.label.trim().length > 0 &&
    Array.isArray(candidate.vector) &&
    candidate.vector.length > 0 &&
    candidate.vector.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function normalizeLoadedProfile(item: SpeakerProfile, fallbackIndex: number): SpeakerProfile {
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `sp-${fallbackIndex}-${item.label.trim()}`,
    label: item.label.trim(),
    vector: item.vector,
    updatedAt: typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now()
  };
}

function loadState(): SpeakerProfileState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { profiles: [], threshold: DEFAULT_MATCH_THRESHOLD };
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as Partial<SpeakerProfileState>).profiles)) {
      const state = parsed as Partial<SpeakerProfileState>;
      const profiles = state.profiles!
        .filter(isValidProfile)
        .slice(0, MAX_PROFILES)
        .map((p, idx) => normalizeLoadedProfile(p, idx));
      return {
        profiles,
        threshold: clampThreshold(state.threshold ?? DEFAULT_MATCH_THRESHOLD)
      };
    }
    // รองรับข้อมูลรูปแบบเดิมที่มีผู้พูดเดียว
    if (isValidProfile(parsed)) {
      return {
        profiles: [normalizeLoadedProfile(parsed, 0)],
        threshold: DEFAULT_MATCH_THRESHOLD
      };
    }
    return { profiles: [], threshold: DEFAULT_MATCH_THRESHOLD };
  } catch {
    return { profiles: [], threshold: DEFAULT_MATCH_THRESHOLD };
  }
}

let currentState: SpeakerProfileState = loadState();
const listeners = new Set<() => void>();

function commitState(next: SpeakerProfileState): void {
  currentState = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ข้ามได้ถ้าพื้นที่เต็ม
  }
  listeners.forEach((l) => l());
}

export const speakerProfileStore = {
  getState: (): SpeakerProfileState => currentState,
  get: (): SpeakerProfile | null => currentState.profiles[0] ?? null,
  getThreshold: (): number => currentState.threshold,
  setThreshold: (value: number): void => {
    const nextThreshold = clampThreshold(value);
    if (nextThreshold === currentState.threshold) return;
    commitState({ profiles: currentState.profiles, threshold: nextThreshold });
  },
  saveFromPcm: (label: string, samples: Float32Array, sampleRate: number): SpeakerProfile | null => {
    const vector = extractSpeakerVectorFromPcm(samples, sampleRate);
    if (!vector) return null;
    const cleanLabel = label.trim() || "ไลท์";
    const now = Date.now();
    const existingIdx = currentState.profiles.findIndex((p) => p.label.toLowerCase() === cleanLabel.toLowerCase());
    const entry: SpeakerProfile = {
      id: existingIdx >= 0 ? currentState.profiles[existingIdx]!.id : `sp-${now}-${Math.random().toString(36).slice(2, 6)}`,
      label: cleanLabel,
      vector,
      updatedAt: now
    };
    const nextProfiles =
      existingIdx >= 0
        ? currentState.profiles.map((p, idx) => (idx === existingIdx ? entry : p))
        : [entry, ...currentState.profiles].slice(0, MAX_PROFILES);

    commitState({ profiles: nextProfiles, threshold: currentState.threshold });
    return entry;
  },
  remove: (id: string): void => {
    const nextProfiles = currentState.profiles.filter((p) => p.id !== id);
    if (nextProfiles.length === currentState.profiles.length) return;
    commitState({ profiles: nextProfiles, threshold: currentState.threshold });
  },
  clear: (): void => {
    commitState({ profiles: [], threshold: currentState.threshold });
  },
  exportJson: (): string =>
    JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        threshold: currentState.threshold,
        profiles: currentState.profiles
      },
      null,
      2
    ),
  importJson: (rawJson: string): { added: number; updated: number; total: number } => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error("รูปแบบไฟล์ JSON ไม่ถูกต้องค่ะ");
    }

    let rawList: unknown[] = [];
    let importedThreshold: number | undefined;
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && typeof parsed === "object") {
      const box = parsed as Partial<SpeakerProfileState>;
      if (Array.isArray(box.profiles)) {
        rawList = box.profiles;
        if (typeof box.threshold === "number" && Number.isFinite(box.threshold)) {
          importedThreshold = clampThreshold(box.threshold);
        }
      } else if (isValidProfile(parsed)) {
        rawList = [parsed];
      }
    }

    const validIncoming = rawList
      .filter((item): item is SpeakerProfile => isValidProfile(item) && item.vector.length >= 8 && item.vector.length <= 32)
      .map((item, idx) => {
        const normalized = normalizeLoadedProfile(item, idx);
        return { ...normalized, label: normalized.label.slice(0, 40) };
      });

    if (validIncoming.length === 0) {
      throw new Error("ไม่พบข้อมูลโปรไฟล์เสียงที่ใช้งานได้ในไฟล์นี้ค่ะ");
    }

    const merged = [...currentState.profiles];
    let added = 0;
    let updated = 0;
    for (const incoming of validIncoming) {
      const idx = merged.findIndex((p) => p.label.toLowerCase() === incoming.label.toLowerCase());
      if (idx >= 0) {
        merged[idx] = { ...incoming, id: merged[idx]!.id };
        updated += 1;
      } else if (merged.length < MAX_PROFILES) {
        merged.push(incoming);
        added += 1;
      }
    }

    commitState({
      profiles: merged,
      threshold: importedThreshold ?? currentState.threshold
    });
    return { added, updated, total: merged.length };
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
