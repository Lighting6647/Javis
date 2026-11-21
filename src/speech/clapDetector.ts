/**
 * ตัวตรวจจับเสียงตบมือ 2 ครั้งติด (Double-Clap Wake) เพื่อปลุก Javis โดยไม่ต้องกดปุ่ม
 * ใช้การวัดพลังงานช่วงสั้นของไมโครโฟน (RMS spike + ช่วงเงียบหลังตบ) เพื่อลดการลั่นจากเสียงพูดปกติ
 */
export interface ClapDetectorHandle {
  stop: () => void;
}

export async function startClapDetector(onClap: () => void): Promise<ClapDetectorHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("เบราว์เซอร์นี้ไม่รองรับการใช้ไมโครโฟนตรวจจับเสียงตบมือ");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
  });

  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const data = new Float32Array(analyser.fftSize);
  let lastSpikeAt = 0;
  let firstClapAt = 0;
  let cooldownUntil = 0;
  let rafId = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    rafId = requestAnimationFrame(tick);

    const now = performance.now();
    if (now < cooldownUntil) return;

    analyser.getFloatTimeDomainData(data);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i] ?? 0);
      if (v > peak) peak = v;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / data.length);

    // เสียงตบมือจะมี peak สูงเฉียบพลันเทียบกับ rms (transient)
    const isClap = peak > 0.34 && rms > 0.055 && peak / Math.max(0.001, rms) > 3.1;
    if (!isClap) return;

    if (now - lastSpikeAt < 140) return;
    lastSpikeAt = now;

    if (firstClapAt > 0 && now - firstClapAt >= 150 && now - firstClapAt <= 720) {
      firstClapAt = 0;
      cooldownUntil = now + 1500;
      onClap();
    } else {
      firstClapAt = now;
    }
  };

  rafId = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close().catch(() => undefined);
    }
  };
}
