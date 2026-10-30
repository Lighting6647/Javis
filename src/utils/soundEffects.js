/**
 * Pure Web Audio API Sound Synthesizer
 * Zero external audio files, zero memory leak, subtle executive feedback
 */

const SOUND_STORAGE_KEY = 'antigravity_sound_enabled';

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isSoundEnabled() {
  try {
    const val = localStorage.getItem(SOUND_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return false;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // Storage unavailable
  }
}

/**
 * Play soft melodic success chime (Two-tone ascending chord)
 */
export function playSuccessSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.08);

    gain.gain.setValueAtTime(0.001, now + idx * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.08);
    osc.stop(now + idx * 0.08 + 0.26);
  });
}

/**
 * Play subtle tactile click (soft tick)
 */
export function playClickSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(950, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.031);
}

/**
 * Play soft warning/alert tone
 */
export function playAlertSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.setValueAtTime(260, now + 0.08);

  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.23);
}

/**
 * High-tech Sci-Fi Affirmative Chirp / Beep (Iron Man HUD command acknowledge)
 */
export function playSciFiBeep() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(1760, now); // A6
  osc1.frequency.exponentialRampToValueAtTime(2640, now + 0.06); // E7

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(3520, now + 0.03); // A7
  osc2.frequency.exponentialRampToValueAtTime(4400, now + 0.08); // C#8

  gain.gain.setValueAtTime(0.03, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc1.stop(now + 0.09);
  osc2.start(now + 0.03);
  osc2.stop(now + 0.09);
}

/**
 * Continuous Arc Reactor Ambient Hum (Low frequency soothing sci-fi hum)
 */
let reactorHumNodes = null;

export function startArcReactorHum() {
  if (!isSoundEnabled() || reactorHumNodes) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(55, ctx.currentTime); // 55Hz (Deep A1)

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(110, ctx.currentTime); // 110Hz (Subtle overtone)

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, ctx.currentTime);

    // Subtle ambient volume (non-intrusive)
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.012, ctx.currentTime + 1.5);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    reactorHumNodes = { osc1, osc2, gain, filter };
  } catch (err) {
    console.warn('[Arc Reactor Hum]:', err.message);
  }
}

export function stopArcReactorHum() {
  if (!reactorHumNodes) return;
  try {
    const ctx = getAudioContext();
    if (ctx && reactorHumNodes.gain) {
      reactorHumNodes.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      setTimeout(() => {
        try {
          reactorHumNodes?.osc1?.stop();
          reactorHumNodes?.osc2?.stop();
          reactorHumNodes = null;
        } catch {}
      }, 550);
    } else {
      reactorHumNodes = null;
    }
  } catch {
    reactorHumNodes = null;
  }
}

/**
 * J.A.R.V.I.S. Iconic Startup Sound Sequence (From KN4rI9siayg)
 * Arc Reactor Charge Sweep + Dual Electronic Diagnostic Beeps
 */
export function playJarvisStartupSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 1. Arc Reactor Spin-up Sub-Bass Sweep (45Hz -> 220Hz)
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(45, now);
  subOsc.frequency.exponentialRampToValueAtTime(220, now + 0.85);

  subGain.gain.setValueAtTime(0.001, now);
  subGain.gain.exponentialRampToValueAtTime(0.09, now + 0.45);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

  subOsc.connect(subGain);
  subGain.connect(ctx.destination);
  subOsc.start(now);
  subOsc.stop(now + 0.96);

  // 2. High-Tech Multi-tone Boot Sequence (E6 -> G#6 -> B6 -> E7)
  const tones = [
    { freq: 1318.51, delay: 0.18, dur: 0.08 },
    { freq: 1661.22, delay: 0.32, dur: 0.08 },
    { freq: 1975.53, delay: 0.48, dur: 0.10 },
    { freq: 2637.02, delay: 0.65, dur: 0.28 },
  ];

  tones.forEach((t) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(t.freq, now + t.delay);

    gain.gain.setValueAtTime(0.001, now + t.delay);
    gain.gain.exponentialRampToValueAtTime(0.05, now + t.delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t.delay + t.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + t.delay);
    osc.stop(now + t.delay + t.dur + 0.02);
  });
}

/**
 * J.A.R.V.I.S. Audio DSP Filter Chain
 * Transforms voice audio into deep, resonant, baritone British-butler timbre
 * (Deep Low-Shelf Warmth + Intercom Presence + Studio Broadcast Compression)
 */
const connectedAudioElements = new WeakSet();

export function attachJarvisVoiceDSP(audioElement) {
  if (!audioElement || connectedAudioElements.has(audioElement)) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const source = ctx.createMediaElementSource(audioElement);

    // 1. Deep Baritone Low-Shelf Filter (+5.5dB at 200Hz)
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.setValueAtTime(200, ctx.currentTime);
    lowShelf.gain.setValueAtTime(5.5, ctx.currentTime);

    // 2. Intercom / Helmet Radio Presence (+2.8dB at 1.9kHz)
    const midPresence = ctx.createBiquadFilter();
    midPresence.type = 'peaking';
    midPresence.frequency.setValueAtTime(1900, ctx.currentTime);
    midPresence.Q.setValueAtTime(1.2, ctx.currentTime);
    midPresence.gain.setValueAtTime(2.8, ctx.currentTime);

    // 3. Smooth Air Roll-off (Gentle high shelf)
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.setValueAtTime(5500, ctx.currentTime);
    highShelf.gain.setValueAtTime(1.2, ctx.currentTime);

    // 4. Broadcast Dynamics Compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, ctx.currentTime);
    compressor.knee.setValueAtTime(10, ctx.currentTime);
    compressor.ratio.setValueAtTime(3.8, ctx.currentTime);
    compressor.attack.setValueAtTime(0.004, ctx.currentTime);
    compressor.release.setValueAtTime(0.09, ctx.currentTime);

    // Connect DSP chain
    source.connect(lowShelf);
    lowShelf.connect(midPresence);
    midPresence.connect(highShelf);
    highShelf.connect(compressor);
    compressor.connect(ctx.destination);

    connectedAudioElements.add(audioElement);
  } catch (err) {
    // MediaElementSource may only be connected once per element
    console.debug('[Jarvis Voice DSP]:', err.message);
  }
}
