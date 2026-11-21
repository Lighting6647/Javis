import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export interface HandPointerState {
  active: boolean;
  x: number;
  y: number;
  pinching: boolean;
  openPalm: boolean;
}

export interface HandControlHandle {
  stop: () => void;
}

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/**
 * เริ่มตรวจจับท่ามือด้วยกล้องเว็บแคม (MediaPipe HandLandmarker)
 * - ชี้นิ้วชี้: เลื่อนตัวชี้โฮโลแกรม
 * - จีบนิ้วโป้งกับนิ้วชี้ (Pinch): คลิกปุ่มตรงตำแหน่งที่ชี้
 */
export async function startHandControl(
  onUpdate: (state: HandPointerState) => void,
  onPinchClick: (x: number, y: number) => void,
  onError: (message: string) => void
): Promise<HandControlHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("เบราว์เซอร์นี้ไม่รองรับการใช้กล้องตรวจจับท่ามือ");
  }

  let stopped = false;
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let landmarker: HandLandmarker | null = null;
  let rafId = 0;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false
    });
    if (stopped) {
      stream.getTracks().forEach((t) => t.stop());
      return { stop: () => undefined };
    }

    video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1
    });

    if (stopped) {
      landmarker.close();
      stream.getTracks().forEach((t) => t.stop());
      return { stop: () => undefined };
    }

    let smoothX = window.innerWidth / 2;
    let smoothY = window.innerHeight / 2;
    let wasPinching = false;
    let lastClickAt = 0;
    let lastVideoTime = -1;

    const tick = () => {
      if (stopped || !video || !landmarker) return;
      rafId = requestAnimationFrame(tick);

      if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;

      const result = landmarker.detectForVideo(video, performance.now());
      const hand = result.landmarks?.[0];
      if (!hand) {
        onUpdate({ active: false, x: smoothX, y: smoothY, pinching: false, openPalm: false });
        wasPinching = false;
        return;
      }

      const indexTip = hand[8];
      const thumbTip = hand[4];
      const middleTip = hand[12];
      const ringTip = hand[16];
      const pinkyTip = hand[20];
      const wrist = hand[0];
      if (!indexTip || !thumbTip || !wrist) return;

      // กลับด้านแนวนอนเหมือนกระจก
      const targetX = (1 - indexTip.x) * window.innerWidth;
      const targetY = indexTip.y * window.innerHeight;
      smoothX = smoothX * 0.68 + targetX * 0.32;
      smoothY = smoothY * 0.68 + targetY * 0.32;

      const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
      const pinching = pinchDist < 0.048;

      const spread =
        middleTip && ringTip && pinkyTip
          ? Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) + Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y)
          : 0;
      const openPalm = !pinching && spread > 0.68;

      onUpdate({ active: true, x: smoothX, y: smoothY, pinching, openPalm });

      const now = performance.now();
      if (pinching && !wasPinching && now - lastClickAt > 450) {
        lastClickAt = now;
        onPinchClick(smoothX, smoothY);
      }
      wasPinching = pinching;
    };

    rafId = requestAnimationFrame(tick);
  } catch (error) {
    if (!stopped) {
      onError(error instanceof Error ? error.message : "เปิดกล้องตรวจจับท่ามือไม่สำเร็จ");
    }
  }

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      if (landmarker) landmarker.close();
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      onUpdate({ active: false, x: 0, y: 0, pinching: false, openPalm: false });
    }
  };
}
