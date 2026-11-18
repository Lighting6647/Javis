/**
 * จับภาพหน้าจอ แท็บ หรือหน้าต่างโปรแกรมอื่นที่ผู้ใช้เลือกผ่าน Screen Capture API (getDisplayMedia)
 * ภาพจะถูกย่อขนาดและบีบอัดเป็น JPEG ในเครื่องก่อนส่งให้ AI วิเคราะห์ แล้วหยุดการเข้าถึงหน้าจอทันที
 */

export type CapturedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface CapturedScreenImage {
  mimeType: CapturedImageMimeType;
  /** ข้อมูลภาพแบบ base64 (ไม่มี prefix data:...) */
  data: string;
  width: number;
  height: number;
}

const MAX_DIMENSION_PX = 1280;
const PRIMARY_JPEG_QUALITY = 0.82;
const FALLBACK_JPEG_QUALITY = 0.65;
const TARGET_MAX_BASE64_CHARS = 1_000_000;
const HARD_MAX_BASE64_CHARS = 1_150_000;
const VIDEO_READY_TIMEOUT_MS = 4000;

/** ตรวจว่าสภาพแวดล้อมปัจจุบันรองรับการจับภาพหน้าจอหรือไม่ */
export function canCaptureScreen(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function");
}

const SCREEN_CAPTURE_VOICE_PATTERN =
  /^(?:จาวิส|javis)?\s*(?:ช่วย)?(?:ส่อง|ดู|จับภาพ|แคป)(?:หน้าจอ(?:อื่น|นี้)?|โปรแกรม(?:อื่น|ที่เปิดอยู่)?|แท็บอื่น)(?:ให้หน่อย|ให้ที|หน่อย|ที|ให้ดูหน่อย)?$/i;

/** ตรวจว่าคำพูดหรือข้อความนี้เป็นคำสั่งให้เปิดหน้าต่างเลือกจับภาพหน้าจอหรือโปรแกรมอื่นหรือไม่ */
export function isScreenCaptureVoiceCommand(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return Boolean(normalized) && SCREEN_CAPTURE_VOICE_PATTERN.test(normalized);
}

/** คำนวณขนาดภาพปลายทางโดยรักษาสัดส่วนเดิมและไม่ให้ด้านยาวเกินเพดาน */
export function fitCaptureDimensions(width: number, height: number, maxDimension = MAX_DIMENSION_PX): { width: number; height: number } {
  const safeW = Number.isFinite(width) && width > 0 ? Math.round(width) : 1280;
  const safeH = Number.isFinite(height) && height > 0 ? Math.round(height) : 720;
  const longest = Math.max(safeW, safeH);
  if (longest <= maxDimension) return { width: safeW, height: safeH };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale))
  };
}

function stripDataUrlPrefix(dataUrl: string): { mimeType: CapturedImageMimeType; data: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("ไม่สามารถแปลงภาพหน้าจอเป็นข้อมูลส่งให้ AI ได้ครับ");
  }
  return {
    mimeType: match[1] as CapturedImageMimeType,
    data: match[2]
  };
}

/** บีบอัดภาพจาก canvas เป็น JPEG ตามขนาดที่กำหนด */
export function encodeCanvasFrame(canvas: HTMLCanvasElement): CapturedScreenImage {
  let encoded = stripDataUrlPrefix(canvas.toDataURL("image/jpeg", PRIMARY_JPEG_QUALITY));
  if (encoded.data.length > TARGET_MAX_BASE64_CHARS) {
    encoded = stripDataUrlPrefix(canvas.toDataURL("image/jpeg", FALLBACK_JPEG_QUALITY));
  }
  if (encoded.data.length > HARD_MAX_BASE64_CHARS) {
    throw new Error("ภาพหน้าจอมีขนาดใหญ่เกินไป ลองเลือกเฉพาะหน้าต่างโปรแกรมหรือแท็บแทนทั้งหน้าจอครับ");
  }
  return {
    mimeType: encoded.mimeType,
    data: encoded.data,
    width: canvas.width,
    height: canvas.height
  };
}

function isUserCanceledCapture(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "NotAllowedError" || name === "AbortError";
}

function waitForFirstFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("ไม่สามารถอ่านภาพจากหน้าจอที่เลือกได้ทันเวลาครับ"));
    }, VIDEO_READY_TIMEOUT_MS);

    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error("เกิดข้อผิดพลาดระหว่างอ่านภาพหน้าจอครับ"));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("resize", onReady);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("resize", onReady);
    video.addEventListener("error", onError);
  });
}

/**
 * เปิดหน้าต่างให้ผู้ใช้เลือกหน้าจอ/แท็บ/โปรแกรม แล้วจับภาพ 1 เฟรมเพื่อส่งให้ AI วิเคราะห์
 * คืน `null` ถ้าผู้ใช้กดยกเลิกหน้าต่างเลือกหน้าจอ
 */
export async function captureScreenImage(): Promise<CapturedScreenImage | null> {
  if (!canCaptureScreen()) {
    throw new Error("เบราว์เซอร์หรืออุปกรณ์นี้ยังไม่รองรับการจับภาพหน้าจอครับ");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });
  } catch (error) {
    if (isUserCanceledCapture(error)) return null;
    throw new Error("ไม่สามารถเปิดหน้าต่างเลือกหน้าจอได้ กรุณาตรวจสอบสิทธิ์ของเบราว์เซอร์ครับ", { cause: error });
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  try {
    await Promise.all([
      waitForFirstFrame(video),
      video.play().catch(() => undefined)
    ]);

    const { width, height } = fitCaptureDimensions(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("เบราว์เซอร์ไม่รองรับการวาดภาพหน้าจอเพื่อวิเคราะห์ครับ");
    }
    context.drawImage(video, 0, 0, width, height);
    return encodeCanvasFrame(canvas);
  } finally {
    video.pause();
    video.srcObject = null;
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}
