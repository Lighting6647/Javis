/**
 * แปลงท่ามือเป็นคำสั่ง แยกจากกล้องและ MediaPipe เพื่อทดสอบได้ตรง ๆ
 * - classifyHand: ดูจุดบนมือ 21 จุดแล้วบอกว่าเป็นท่าอะไร (แบมือ กำมือ ชูนิ้วชี้ นิ้วโป้งขึ้น/ลง)
 * - GestureEngine: ต้องค้างท่าไว้ครบเวลาก่อนนับเป็นคำสั่ง จึงไม่ทำงานเองตอนมือขยับผ่าน
 *   และดูแลเมนูวงกลม (แบมือค้างเพื่อเปิด เลื่อนมือเพื่อเลือก กำมือเพื่อกด)
 * ทุกอย่างคำนวณในเครื่อง ไม่มีภาพหรือจุดบนมือถูกส่งออกไปที่ใด
 */
import type { LandmarkPoint } from "./handGestures";

/** ท่ามือที่จำได้ */
export type HandShape = "open" | "fist" | "indexUp" | "thumbsUp" | "thumbsDown" | "none";

const distance = (a: LandmarkPoint, b: LandmarkPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** นิ้วชี้ กลาง นาง ก้อย: [โคนนิ้ว, ข้อกลาง, ปลายนิ้ว] ตามลำดับจุดของ MediaPipe */
const FINGERS: readonly (readonly [number, number, number])[] = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20]
];

export type FingerState = "extended" | "curled" | "between";

/**
 * นิ้วเหยียดหรืองอ: เทียบระยะปลายนิ้วกับระยะข้อกลางจากข้อมือ
 * ใช้อัตราส่วน จึงไม่ขึ้นกับว่ามืออยู่ใกล้หรือไกลกล้อง
 */
export function fingerState(hand: readonly LandmarkPoint[], finger: readonly [number, number, number]): FingerState {
  const wrist = hand[0];
  const pip = hand[finger[1]];
  const tip = hand[finger[2]];
  if (!wrist || !pip || !tip) return "between";
  const toPip = distance(wrist, pip);
  if (toPip <= 0) return "between";
  const ratio = distance(wrist, tip) / toPip;
  if (ratio > 1.2) return "extended";
  if (ratio < 1.0) return "curled";
  return "between";
}

/** ทิศของเวกเตอร์ในแนวตั้ง: -1 ชี้ขึ้นตรง ๆ, 1 ชี้ลงตรง ๆ (แกน y ของภาพชี้ลง) */
function verticalDirection(from: LandmarkPoint, to: LandmarkPoint): number {
  const length = distance(from, to);
  return length > 0 ? (to.y - from.y) / length : 0;
}

/** ดูจุดบนมือ 21 จุด (พิกัดภาพ 0..1) แล้วบอกท่า */
export function classifyHand(hand: readonly LandmarkPoint[]): HandShape {
  if (hand.length < 21) return "none";
  const wrist = hand[0]!;
  const handSize = distance(wrist, hand[9]!);
  // มือเล็กเกินไปในภาพ (ไกลกล้องมาก) วัดไม่แม่น ไม่ตัดสินท่า
  if (handSize < 0.04) return "none";

  const states = FINGERS.map((finger) => fingerState(hand, finger));
  const [index, middle, ring, pinky] = states;
  const curled = states.filter((state) => state === "curled").length;
  const extended = states.filter((state) => state === "extended").length;

  const thumbTip = hand[4]!;
  const thumbMcp = hand[2]!;
  // นิ้วโป้งกางออก: ปลายนิ้วโป้งอยู่ห่างจากโคนนิ้วชี้
  const thumbOut = distance(thumbTip, hand[5]!) / handSize > 0.6;

  // สี่นิ้วกำอยู่
  if (extended === 0 && curled >= 3) {
    const thumbDirection = verticalDirection(thumbMcp, thumbTip);
    const knuckles = [5, 9, 13, 17].map((i) => hand[i]!.y);
    // นิ้วโป้งชี้ขึ้นหรือลงชัด ๆ และปลายนิ้วโป้งพ้นแนวโคนนิ้วทั้งสี่ไปแล้ว
    if (thumbOut && thumbDirection < -0.7 && thumbTip.y < Math.min(...knuckles) - 0.25 * handSize) return "thumbsUp";
    if (thumbOut && thumbDirection > 0.7 && thumbTip.y > Math.max(...knuckles) + 0.25 * handSize) return "thumbsDown";
    return "fist";
  }

  if (extended === 4 && thumbOut) return "open";

  // ชูนิ้วชี้ขึ้นตรง ๆ นิ้วอื่นงอ
  if (index === "extended" && middle !== "extended" && ring !== "extended" && pinky !== "extended" && curled >= 2) {
    if (verticalDirection(hand[5]!, hand[8]!) < -0.8) return "indexUp";
  }
  return "none";
}

/** จุดกลางฝ่ามือ (เฉลี่ยข้อมือกับโคนนิ้ว) นิ่งกว่าปลายนิ้ว ใช้เป็นตำแหน่งเมนูและวงนับเวลา */
export function palmCenter(hand: readonly LandmarkPoint[]): LandmarkPoint | null {
  const points = [0, 5, 9, 17].map((i) => hand[i]);
  if (points.some((point) => !point)) return null;
  return {
    x: points.reduce((sum, point) => sum + point!.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point!.y, 0) / points.length
  };
}

/**
 * ช่องเมนูวงกลมที่ตำแหน่งมือชี้อยู่ ช่องแรกอยู่ด้านบน แล้ววนตามเข็มนาฬิกา
 * คืน null เมื่อมืออยู่ใกล้กลางเมนูเกินไป (ยังไม่ได้เลือก)
 */
export function radialIndex(center: LandmarkPoint, point: LandmarkPoint, count: number, deadZone: number): number | null {
  if (count <= 0) return null;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (Math.hypot(dx, dy) < deadZone) return null;
  // มุม 0 = ด้านบน บวกตามเข็มนาฬิกา (แกน y ของจอชี้ลง)
  const angle = Math.atan2(dx, -dy);
  const step = (Math.PI * 2) / count;
  return ((Math.round(angle / step) % count) + count) % count;
}

/** วางจุดกลางเมนูให้เมนูทั้งวงอยู่ในจอ */
export function clampMenuCenter(point: LandmarkPoint, radius: number, width: number, height: number): LandmarkPoint {
  const margin = radius + 24;
  const clamp = (value: number, max: number) => (max < margin * 2 ? max / 2 : Math.min(Math.max(value, margin), max - margin));
  return { x: clamp(point.x, width), y: clamp(point.y, height) };
}

/** สิ่งที่ท่ามือสั่ง */
export type GestureCommand =
  | { type: "listen" }
  | { type: "stopSpeaking" }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "menuSelect"; item: number };

/** ท่าที่กำลังค้างอยู่ และค้างไปแล้วกี่ส่วน (0..1) ใช้วาดวงนับถอยหลัง */
export type HoldKind = "listen" | "stopSpeaking" | "menu" | "confirm" | "cancel" | "select";
export interface HoldProgress {
  kind: HoldKind;
  progress: number;
}

export interface RadialMenuState {
  center: LandmarkPoint;
  highlighted: number | null;
}

/** เวลาที่ต้องค้างท่า (มิลลิวินาที) */
export const HOLD_MS: Record<HoldKind, number> = {
  listen: 800,
  // ลูน่ากำลังพูด: แบมือค้างราวครึ่งวินาทีจึงหยุด กันมือที่วางแบอยู่หน้ากล้องหรือแค่ผ่านไปตัดเสียงทิ้ง
  stopSpeaking: 600,
  menu: 600,
  // ยืนยันต้องค้างนานกว่ายกเลิก เพราะยืนยันแล้วมีผลจริง
  confirm: 1800,
  cancel: 1000,
  select: 250
};

/** มือหายไปหรือเปลี่ยนท่าแวบเดียวไม่เกินเท่านี้ ยังนับว่าค้างท่าเดิมอยู่ (กันภาพกระตุก) */
export const FLICKER_GRACE_MS = 150;
/** มือหายจากกล้องนานเท่านี้ เมนูปิดเอง */
export const MENU_LOST_CLOSE_MS = 400;
export const MENU_RADIUS = 120;

export interface GestureFrame {
  /** null = ไม่เห็นมือ */
  shape: HandShape | null;
  /** จุดกลางฝ่ามือบนจอ (พิกเซล) */
  point: LandmarkPoint;
  now: number;
  /** ลูน่ากำลังพูดอยู่หรือไม่ */
  speaking: boolean;
  viewport: { width: number; height: number };
}

export interface GestureOutput {
  hold: HoldProgress | null;
  menu: RadialMenuState | null;
  commands: GestureCommand[];
}

interface Hold {
  kind: HoldKind;
  startedAt: number;
  lastSeenAt: number;
  fired: boolean;
}

/** ตัวจับท่าค้างและเมนูวงกลม ป้อนทีละเฟรม */
export class GestureEngine {
  private hold: Hold | null = null;
  private menu: RadialMenuState | null = null;
  private lostSince: number | null = null;

  constructor(
    private readonly menuItems: number,
    private readonly radius = MENU_RADIUS
  ) {}

  get menuOpen(): boolean {
    return this.menu !== null;
  }

  closeMenu(): void {
    this.menu = null;
  }

  reset(): void {
    this.hold = null;
    this.menu = null;
    this.lostSince = null;
  }

  update(frame: GestureFrame): GestureOutput {
    const commands: GestureCommand[] = [];

    if (frame.shape === null) {
      this.lostSince ??= frame.now;
      if (this.menu && frame.now - this.lostSince > MENU_LOST_CLOSE_MS) this.menu = null;
      this.track(null, frame.now);
      return { hold: null, menu: this.menu, commands };
    }
    this.lostSince = null;

    if (this.menu) {
      const offset = Math.hypot(frame.point.x - this.menu.center.x, frame.point.y - this.menu.center.y);
      // เลื่อนมือออกไปไกลจากเมนู: ปิดเมนู
      if (offset > this.radius * 2.2) {
        this.menu = null;
        this.track(null, frame.now);
        return { hold: null, menu: null, commands };
      }
      this.menu = { ...this.menu, highlighted: radialIndex(this.menu.center, frame.point, this.menuItems, this.radius * 0.35) };
      const hold = this.track(frame.shape === "fist" ? "select" : null, frame.now);
      if (hold?.justFired && this.menu.highlighted !== null) {
        commands.push({ type: "menuSelect", item: this.menu.highlighted });
        this.menu = null;
      }
      const selecting = hold && this.menu && hold.progress.kind === "select" && !hold.fired ? hold.progress : null;
      return { hold: selecting, menu: this.menu, commands };
    }

    const kind = this.kindFor(frame.shape, frame.speaking);
    const hold = this.track(kind, frame.now);
    if (hold?.justFired) {
      switch (hold.progress.kind) {
        case "menu":
          this.menu = {
            center: clampMenuCenter(frame.point, this.radius, frame.viewport.width, frame.viewport.height),
            highlighted: null
          };
          break;
        case "listen":
          commands.push({ type: "listen" });
          break;
        case "stopSpeaking":
          commands.push({ type: "stopSpeaking" });
          break;
        case "confirm":
          commands.push({ type: "confirm" });
          break;
        case "cancel":
          commands.push({ type: "cancel" });
          break;
        case "select":
          break;
      }
    }
    // ค้างครบแล้ว ไม่ต้องแสดงวงค้างไว้ (รอปล่อยท่าก่อนนับใหม่)
    return { hold: hold && !hold.fired ? hold.progress : null, menu: this.menu, commands };
  }

  private kindFor(shape: HandShape, speaking: boolean): HoldKind | null {
    switch (shape) {
      case "open":
        return speaking ? "stopSpeaking" : "menu";
      case "indexUp":
        return "listen";
      case "thumbsUp":
        return "confirm";
      case "thumbsDown":
        return "cancel";
      default:
        return null;
    }
  }

  /** นับเวลาค้างท่า คืนสถานะท่าที่กำลังค้าง (null = ไม่มี) */
  private track(kind: HoldKind | null, now: number): { progress: HoldProgress; justFired: boolean; fired: boolean } | null {
    const current = this.hold;
    if (current && kind === current.kind) {
      current.lastSeenAt = now;
    } else if (current && now - current.lastSeenAt <= FLICKER_GRACE_MS) {
      // เปลี่ยนท่าแวบเดียว: ยังถือท่าเดิม แต่ไม่นับเวลาเพิ่มจนกว่าจะกลับมาท่าเดิม
      return { progress: { kind: current.kind, progress: this.progressOf(current, current.lastSeenAt) }, justFired: false, fired: current.fired };
    } else if (kind) {
      this.hold = { kind, startedAt: now, lastSeenAt: now, fired: false };
    } else {
      this.hold = null;
      return null;
    }

    const hold = this.hold!;
    const progress = this.progressOf(hold, now);
    const justFired = !hold.fired && progress >= 1;
    if (justFired) hold.fired = true;
    return { progress: { kind: hold.kind, progress }, justFired, fired: hold.fired && !justFired };
  }

  private progressOf(hold: Hold, at: number): number {
    return Math.min(1, Math.max(0, (at - hold.startedAt) / HOLD_MS[hold.kind]));
  }
}
