/**
 * วัดความดังของเสียงที่ลูน่ากำลังพูดอยู่จริง (เสียง Gemini ที่เล่นผ่าน Web Audio)
 * ตัวเล่นเสียงลงทะเบียน AnalyserNode ไว้ตอนเริ่มเล่น และถอดออกเมื่อเล่นจบ
 * ภาพบนจอ (วงขีดรอบลูกแก้ว ตัวเลขระดับเสียง) อ่านค่าจากที่นี่ ถ้าไม่มีตัววัดจะได้ null แล้วใช้จังหวะจำลองแทน
 */
let analyser: AnalyserNode | null = null;
let samples: Float32Array<ArrayBuffer> | null = null;

export function setOutputAnalyser(next: AnalyserNode | null): void {
  analyser = next;
  samples = next ? new Float32Array(next.fftSize) : null;
}

/** ความดังขณะนี้ 0..1 หรือ null เมื่อไม่ได้เล่นเสียงผ่านตัววัด */
export function readOutputLevel(): number | null {
  if (!analyser || !samples) return null;
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  // เสียงพูดปกติ RMS ราว 0.05-0.25 ขยายให้เต็มช่วง 0..1
  return Math.min(1, rms * 4.5);
}
