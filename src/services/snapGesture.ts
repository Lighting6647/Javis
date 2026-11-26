/**
 * จับการดีดนิ้วจากจุดบนมือ (ไม่ใช้เสียง เพราะไมโครโฟนอาจกำลังฟังคำพูดอยู่)
 * ดีดนิ้ว = ปลายนิ้วโป้งแตะปลายนิ้วกลางค้างอย่างน้อย 2 เฟรม แล้วภายในราว 0.2 วินาที
 * นิ้วกลางสะบัดแยกออกเร็วมาก และฟาดลงหาฝ่ามือ (ปลายนิ้วกลางเข้าใกล้ข้อมือ)
 * - ปล่อยนิ้วช้า ๆ: เร็วไม่พอ ไม่นับ
 * - จีบนิ้วชี้คลิก: นิ้วที่แตะนิ้วโป้งคือนิ้วชี้ ไม่ใช่นิ้วกลาง ไม่นับ
 * ทุกระยะเทียบกับขนาดมือ (ข้อมือถึงโคนนิ้วกลาง) จึงไม่ขึ้นกับระยะห่างจากกล้อง
 */
import type { LandmarkPoint } from "./handGestures";

/** ปลายนิ้วโป้งกับนิ้วกลางห่างกันไม่เกินเท่านี้ของขนาดมือ = แตะกัน */
export const SNAP_CONTACT = 0.35;
/** หลังดีด ปลายนิ้วทั้งสองต้องห่างกันอย่างน้อยเท่านี้ (นิ้วกลางฟาดลงโคนนิ้วโป้ง จึงห่างกันไม่ถึงหนึ่งขนาดมือ) */
export const SNAP_RELEASE = 0.6;
/** ต้องแตะกันอย่างน้อยกี่เฟรมก่อนดีด (กันจุดกระโดดเฟรมเดียว) */
export const SNAP_CONTACT_FRAMES = 2;
/** ต้องแยกออกภายในเวลานี้หลังเฟรมสุดท้ายที่แตะกัน */
export const SNAP_WINDOW_MS = 200;
/** ความเร็วที่นิ้วแยกจากกันขั้นต่ำ (ขนาดมือต่อวินาที) การปล่อยนิ้วธรรมดาช้ากว่านี้มาก */
export const SNAP_MIN_SPEED = 8;
/** ปลายนิ้วกลางต้องเข้าใกล้ข้อมือ (ฟาดลงฝ่ามือ) อย่างน้อยเท่านี้เทียบกับตอนแตะ */
export const SNAP_DOWN_RATIO = 0.9;
/** ดีดแล้วพักเท่านี้ก่อนนับครั้งใหม่ */
export const SNAP_COOLDOWN_MS = 800;

export interface SnapHand {
  wrist: LandmarkPoint;
  thumbTip: LandmarkPoint;
  indexTip: LandmarkPoint;
  middleMcp: LandmarkPoint;
  middleTip: LandmarkPoint;
}

export interface SnapResult {
  /** นิ้วโป้งกับนิ้วกลางแตะกันอยู่ตอนนี้ (ช่วงเตรียมดีด ห้ามนับเป็นการจีบคลิก) */
  contact: boolean;
  /** ดีดนิ้วสำเร็จในเฟรมนี้ */
  snapped: boolean;
}

const distance = (a: LandmarkPoint, b: LandmarkPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** ดึงจุดที่ใช้จากมือ 21 จุดของ MediaPipe */
export function snapHandFrom(hand: readonly LandmarkPoint[] | undefined): SnapHand | null {
  const [wrist, thumbTip, indexTip, middleMcp, middleTip] = [0, 4, 8, 9, 12].map((i) => hand?.[i]);
  if (!wrist || !thumbTip || !indexTip || !middleMcp || !middleTip) return null;
  return { wrist, thumbTip, indexTip, middleMcp, middleTip };
}

/** ตัวจับการดีดนิ้ว ป้อนทีละเฟรม */
export class SnapDetector {
  private contactFrames = 0;
  private lastContactAt: number | null = null;
  private contactGap = 0;
  private contactReach = 0;
  private lastSnapAt = Number.NEGATIVE_INFINITY;

  update(hand: SnapHand | null, now: number): SnapResult {
    const size = hand ? distance(hand.wrist, hand.middleMcp) : 0;
    if (!hand || size < 0.02) {
      this.reset();
      return { contact: false, snapped: false };
    }

    const gap = distance(hand.thumbTip, hand.middleTip) / size;
    const indexGap = distance(hand.thumbTip, hand.indexTip) / size;
    const reach = distance(hand.wrist, hand.middleTip) / size;

    // แตะกันด้วยนิ้วกลาง และนิ้วกลางอยู่ใกล้นิ้วโป้งกว่านิ้วชี้ (ไม่ใช่ท่าจีบนิ้วชี้)
    if (gap < SNAP_CONTACT && gap <= indexGap) {
      this.contactFrames += 1;
      this.lastContactAt = now;
      this.contactGap = gap;
      this.contactReach = reach;
      return { contact: true, snapped: false };
    }

    const armed = this.contactFrames >= SNAP_CONTACT_FRAMES && this.lastContactAt !== null;
    const elapsed = this.lastContactAt === null ? Infinity : now - this.lastContactAt;
    if (!armed || elapsed > SNAP_WINDOW_MS) {
      if (elapsed > SNAP_WINDOW_MS) this.reset();
      return { contact: false, snapped: false };
    }

    const speed = (gap - this.contactGap) / Math.max(elapsed / 1000, 0.001);
    const struckDown = reach < this.contactReach * SNAP_DOWN_RATIO;
    if (gap >= SNAP_RELEASE && speed >= SNAP_MIN_SPEED && struckDown && now - this.lastSnapAt >= SNAP_COOLDOWN_MS) {
      this.lastSnapAt = now;
      this.reset();
      return { contact: false, snapped: true };
    }
    // ยังอยู่ในช่วงรอ: นิ้วอาจยังแยกไม่สุด ให้โอกาสเฟรมถัดไป
    return { contact: false, snapped: false };
  }

  reset(): void {
    this.contactFrames = 0;
    this.lastContactAt = null;
  }
}
