import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { classifyHand, GestureEngine, type GestureCommand, type HoldProgress, palmCenter, type RadialMenuState } from "./gestureCommands";
import { dueForDetection, type LandmarkPoint, OneEuroPoint, PINCH_ON, PinchDetector, pinchRatio } from "./handGestures";

export interface HandPointerState {
  active: boolean;
  x: number;
  y: number;
  pinching: boolean;
  openPalm: boolean;
}

/** ข้อมูลหนึ่งเฟรมสำหรับวาดโครงมือ (พิกัดบนจอเป็นพิกเซล กลับด้านแบบกระจกแล้ว) */
export interface HandFrame {
  points: LandmarkPoint[];
  /** นิ้วโป้งกับนิ้วชี้ใกล้กันแค่ไหน 0 = ห่าง, 1 = จีบสุด */
  pinch: number;
  /** เฟรมนี้จีบนิ้วคลิกไปแล้ว */
  clicked: boolean;
  /** ท่าที่กำลังค้างอยู่ (วงนับถอยหลัง) */
  hold: HoldProgress | null;
  palm: LandmarkPoint;
}

export interface HandControlCallbacks {
  onUpdate: (state: HandPointerState) => void;
  /** null = ไม่เห็นมือ */
  onFrame: (frame: HandFrame | null) => void;
  onPinchClick: (x: number, y: number) => void;
  onCommand: (command: GestureCommand) => void;
  /** เรียกเมื่อเมนูวงกลมเปิด ปิด หรือเปลี่ยนช่องที่เลือก */
  onMenu: (menu: RadialMenuState | null) => void;
  onError: (message: string) => void;
  /** ลูน่ากำลังพูดอยู่หรือไม่ (แบมือตอนพูด = หยุดพูด แทนการเปิดเมนู) */
  isSpeaking: () => boolean;
}

export interface HandControlHandle {
  stop: () => void;
}

const WASM_ROOT = "/mediapipe/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const sameMenu = (a: RadialMenuState | null, b: RadialMenuState | null) =>
  a === b || (!!a && !!b && a.highlighted === b.highlighted && a.center.x === b.center.x && a.center.y === b.center.y);

/**
 * เริ่มตรวจจับท่ามือด้วยกล้องเว็บแคม (MediaPipe HandLandmarker) ประมวลผลในเครื่องทั้งหมด
 * - ชี้นิ้วชี้: เลื่อนตัวชี้โฮโลแกรม / จีบนิ้วโป้งกับนิ้วชี้: คลิก
 * - ท่าค้าง (ดู gestureCommands): ชูนิ้วชี้ = ฟัง, แบมือ = เมนูหรือหยุดพูด, นิ้วโป้งขึ้น/ลง = ยืนยัน/ยกเลิก
 * @param menuItems จำนวนช่องในเมนูวงกลม
 */
export async function startHandControl(callbacks: HandControlCallbacks, menuItems: number): Promise<HandControlHandle> {
  const { onUpdate, onFrame, onPinchClick, onCommand, onMenu, onError, isSpeaking } = callbacks;
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
    const palmFilter = new OneEuroPoint(1.0, 0.01);
    const pinch = new PinchDetector();
    const gestures = new GestureEngine(menuItems);
    let menu: RadialMenuState | null = null;
    const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

    const publishMenu = (next: RadialMenuState | null) => {
      if (sameMenu(menu, next)) return;
      menu = next;
      onMenu(next);
    };

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
      const palm = hand ? palmCenter(hand) : null;
      if (!hand || !indexTip || !thumbTip || !wrist || !middleMcp || !palm) {
        // แจ้งครั้งเดียวตอนมือหายไป ไม่ต้องวาดหน้าจอซ้ำทุกเฟรม
        if (handVisible) {
          onUpdate({ active: false, x: smoothX, y: smoothY, pinching: false, openPalm: false });
          onFrame(null);
        }
        handVisible = false;
        cursor.reset();
        palmFilter.reset();
        pinch.reset();
        // ยังป้อนต่อ เพื่อให้เมนูปิดเองเมื่อมือหายนานพอ
        publishMenu(gestures.update({ shape: null, point: { x: 0, y: 0 }, now, speaking: isSpeaking(), viewport: viewport() }).menu);
        return;
      }
      handVisible = true;

      const width = window.innerWidth;
      const height = window.innerHeight;
      // กลับด้านแนวนอนเหมือนกระจก
      const toScreen = (point: LandmarkPoint) => ({ x: (1 - point.x) * width, y: point.y * height });
      const smoothed = cursor.filter(toScreen(indexTip), now);
      smoothX = smoothed.x;
      smoothY = smoothed.y;
      const palmPoint = palmFilter.filter(toScreen(palm), now);

      const shape = classifyHand(hand);
      const ratio = pinchRatio(thumbTip, indexTip, wrist, middleMcp);
      // กำมืออยู่ (ปลายนิ้วชิดกันเอง) หรือกำลังเลือกในเมนู: ไม่นับเป็นการจีบคลิก
      const { pinching, click } = pinch.update(shape === "fist" || gestures.menuOpen ? null : ratio, now);

      const output = gestures.update({ shape: pinching ? "none" : shape, point: palmPoint, now, speaking: isSpeaking(), viewport: viewport() });

      onUpdate({ active: true, x: smoothX, y: smoothY, pinching, openPalm: shape === "open" });
      onFrame({
        points: hand.map(toScreen),
        pinch: ratio === null ? 0 : Math.min(1, Math.max(0, (1 - ratio) / (1 - PINCH_ON))),
        clicked: click,
        hold: output.hold,
        palm: palmPoint
      });
      publishMenu(output.menu);
      output.commands.forEach(onCommand);
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
      onFrame(null);
      onMenu(null);
    }
  };
}
