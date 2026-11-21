/**
 * การคำนวณท่ามือที่ไม่ขึ้นกับกล้องหรือ MediaPipe แยกไว้เพื่อทดสอบได้ตรง ๆ
 * - ตัวกรอง One-Euro: เคอร์เซอร์นิ่งตอนมือหยุด และตามทันตอนมือขยับเร็ว
 * - การจีบนิ้ว: วัดเทียบกับขนาดมือ จึงไวเท่ากันไม่ว่ามือจะใกล้หรือไกลกล้อง
 *   มีช่วงเปิด/ปิดต่างกัน (hysteresis) และต้องจีบค้างสั้น ๆ ก่อนนับ จึงไม่กดซ้ำหรือกดเองตอนมือสั่น
 */

/** จุดบนภาพจากกล้อง (พิกัด 0..1 ตามที่ MediaPipe ส่งมา) */
export interface LandmarkPoint {
  x: number;
  y: number;
}

/**
 * ตัวกรอง One-Euro (Casiez และคณะ, 2012) สำหรับค่าเดียว
 * ความเร็วต่ำ = กรองแรง (ตัดการสั่น) ความเร็วสูง = กรองน้อย (ไม่หน่วง)
 */
export class OneEuroFilter {
  private previous: number | null = null;
  private previousDerivative = 0;
  private previousTime: number | null = null;

  /**
   * @param minCutoff ความถี่ตัดต่ำสุด (Hz) ยิ่งต่ำยิ่งนิ่งตอนอยู่กับที่
   * @param beta ยิ่งสูงยิ่งตามทันตอนขยับเร็ว
   * @param derivativeCutoff ความถี่ตัดของความเร็ว (Hz)
   */
  constructor(
    private readonly minCutoff = 1.0,
    private readonly beta = 0.01,
    private readonly derivativeCutoff = 1.0
  ) {}

  /** กรองค่าใหม่ ณ เวลา time (มิลลิวินาที) */
  filter(value: number, time: number): number {
    if (this.previous === null || this.previousTime === null || time <= this.previousTime) {
      this.previous = value;
      this.previousTime = time;
      return value;
    }
    const dt = (time - this.previousTime) / 1000;
    this.previousTime = time;

    const derivative = (value - this.previous) / dt;
    const smoothedDerivative = lowPass(derivative, this.previousDerivative, alpha(this.derivativeCutoff, dt));
    this.previousDerivative = smoothedDerivative;

    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDerivative);
    this.previous = lowPass(value, this.previous, alpha(cutoff, dt));
    return this.previous;
  }

  reset(): void {
    this.previous = null;
    this.previousTime = null;
    this.previousDerivative = 0;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

function lowPass(value: number, previous: number, a: number): number {
  return a * value + (1 - a) * previous;
}

/** ตัวกรองจุดสองมิติ (x, y แยกกัน) */
export class OneEuroPoint {
  private readonly x: OneEuroFilter;
  private readonly y: OneEuroFilter;

  constructor(minCutoff?: number, beta?: number) {
    this.x = new OneEuroFilter(minCutoff, beta);
    this.y = new OneEuroFilter(minCutoff, beta);
  }

  filter(point: { x: number; y: number }, time: number): { x: number; y: number } {
    return { x: this.x.filter(point.x, time), y: this.y.filter(point.y, time) };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
  }
}

const distance = (a: LandmarkPoint, b: LandmarkPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * ระยะจีบเทียบกับขนาดมือ: ระยะปลายนิ้วโป้ง–ปลายนิ้วชี้ หารด้วยระยะข้อมือ–โคนนิ้วกลาง
 * ค่าเดียวกันไม่ว่ามือจะอยู่ใกล้หรือไกลกล้อง คืน null ถ้ามือเล็กเกินจะวัดได้
 */
export function pinchRatio(thumbTip: LandmarkPoint, indexTip: LandmarkPoint, wrist: LandmarkPoint, middleMcp: LandmarkPoint): number | null {
  const handSize = distance(wrist, middleMcp);
  if (handSize < 0.02) return null;
  return distance(thumbTip, indexTip) / handSize;
}

/** ค่าเริ่มต้นของการจีบ: เริ่มนับเมื่อชิดกว่า 0.40 ของขนาดมือ เลิกนับเมื่อห่างกว่า 0.60 */
export const PINCH_ON = 0.4;
export const PINCH_OFF = 0.6;
/** ต้องจีบค้างนานเท่านี้ก่อนนับเป็นการกด กันการกดเองตอนมือเคลื่อนผ่านท่าจีบชั่วขณะ */
export const PINCH_CONFIRM_MS = 70;
/** กดได้ไม่ถี่กว่านี้ */
export const CLICK_COOLDOWN_MS = 350;

/**
 * ตัวตัดสินการจีบ: hysteresis + ต้องค้างสั้น ๆ + เว้นระยะระหว่างการกด
 * คืน pinching (สถานะตอนนี้) และ click (true ครั้งเดียวตอนเริ่มจีบที่นับแล้ว)
 */
export class PinchDetector {
  private pinching = false;
  private candidateSince: number | null = null;
  private lastClickAt = -Infinity;

  update(ratio: number | null, now: number): { pinching: boolean; click: boolean } {
    if (ratio === null) {
      this.pinching = false;
      this.candidateSince = null;
      return { pinching: false, click: false };
    }
    if (this.pinching) {
      if (ratio > PINCH_OFF) this.pinching = false;
      return { pinching: this.pinching, click: false };
    }
    if (ratio >= PINCH_ON) {
      this.candidateSince = null;
      return { pinching: false, click: false };
    }
    this.candidateSince ??= now;
    if (now - this.candidateSince < PINCH_CONFIRM_MS) return { pinching: false, click: false };

    this.pinching = true;
    this.candidateSince = null;
    const click = now - this.lastClickAt >= CLICK_COOLDOWN_MS;
    if (click) this.lastClickAt = now;
    return { pinching: true, click };
  }

  reset(): void {
    this.pinching = false;
    this.candidateSince = null;
  }
}

/** ตรวจจับไม่ถี่กว่านี้ (ราว 30 ครั้งต่อวินาที) ประหยัด CPU/GPU โดยเคอร์เซอร์ยังลื่น */
export const DETECT_INTERVAL_MS = 33;

/** ถึงเวลาตรวจจับเฟรมถัดไปหรือยัง */
export function dueForDetection(now: number, lastDetectAt: number, interval = DETECT_INTERVAL_MS): boolean {
  return now - lastDetectAt >= interval;
}
