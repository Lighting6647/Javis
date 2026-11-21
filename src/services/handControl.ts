import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { dueForDetection, OneEuroPoint, PinchDetector, pinchRatio } from "./handGestures";

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

const WASM_ROOT = "/mediapipe/wasm";
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
    const create = (delegate: "GPU" | "CPU") =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 1
      });
    // บางเครื่องเปิดการ์ดจอให้เบราว์เซอร์ใช้ไม่ได้: ใช้ CPU แทน ช้ากว่าแต่ยังใช้งานได้
    landmarker = await create("GPU").catch(() => create("CPU"));

    if (stopped) {
      landmarker.close();
      stream.getTracks().forEach((t) => t.stop());
      return { stop: () => undefined };
    }

    let smoothX = window.innerWidth / 2;
    let smoothY = window.innerHeight / 2;
    let lastVideoTime = -1;
    let lastDetectAt = -Infinity;
    let handVisible = false;
    // ตัวกรอง One-Euro: นิ่งตอนมือหยุด ตามทันตอนมือขยับเร็ว (หน่วยพิกเซลบนจอ)
    const cursor = new OneEuroPoint(1.1, 0.012);
    const pinch = new PinchDetector();

    const tick = () => {
      if (stopped || !video || !landmarker) return;
      rafId = requestAnimationFrame(tick);

      const now = performance.now();
      // ตรวจจับราว 30 ครั้งต่อวินาทีพอ: เคอร์เซอร์ยังลื่น แต่ใช้ CPU/GPU น้อยลงมาก
      if (document.hidden || !dueForDetection(now, lastDetectAt)) return;
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;
      lastDetectAt = now;

      const result = landmarker.detectForVideo(video, now);
      const hand = result.landmarks?.[0];
      const indexTip = hand?.[8];
      const thumbTip = hand?.[4];
      const wrist = hand?.[0];
      const middleMcp = hand?.[9];
      if (!hand || !indexTip || !thumbTip || !wrist || !middleMcp) {
        // แจ้งครั้งเดียวตอนมือหายไป ไม่ต้องวาดหน้าจอซ้ำทุกเฟรม
        if (handVisible) onUpdate({ active: false, x: smoothX, y: smoothY, pinching: false, openPalm: false });
        handVisible = false;
        cursor.reset();
        pinch.reset();
        return;
      }
      handVisible = true;

      // กลับด้านแนวนอนเหมือนกระจก
      const smoothed = cursor.filter({ x: (1 - indexTip.x) * window.innerWidth, y: indexTip.y * window.innerHeight }, now);
      smoothX = smoothed.x;
      smoothY = smoothed.y;

      const { pinching, click } = pinch.update(pinchRatio(thumbTip, indexTip, wrist, middleMcp), now);

      const middleTip = hand[12];
      const pinkyTip = hand[20];
      const handSize = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
      // แบมือ: ปลายนิ้วกลางและนิ้วก้อยอยู่ไกลจากข้อมือเมื่อเทียบกับขนาดมือ (ไม่ขึ้นกับระยะห่างจากกล้อง)
      const spread =
        middleTip && pinkyTip && handSize > 0
          ? (Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) + Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y)) / handSize
          : 0;
      const openPalm = !pinching && spread > 3.2;

      onUpdate({ active: true, x: smoothX, y: smoothY, pinching, openPalm });
      if (click) onPinchClick(smoothX, smoothY);
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
