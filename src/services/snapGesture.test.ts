import { describe, expect, it } from "vitest";
import type { LandmarkPoint } from "./handGestures";
import { gestureLabel, SNAP_BLOCKED_LABEL, snapLabel, commandLabel, type LabelInput } from "./gestureLabel";
import { SNAP_COOLDOWN_MS, SnapDetector, type SnapHand, snapHandFrom } from "./snapGesture";

// มือจำลองตั้งตรง ขนาดมือ (ข้อมือถึงโคนนิ้วกลาง) = 0.2
const WRIST = { x: 0.5, y: 0.8 };
const MIDDLE_MCP = { x: 0.5, y: 0.6 };

/** ท่าเตรียมดีด: ปลายนิ้วกลางแตะปลายนิ้วโป้ง นิ้วชี้อยู่เหนือขึ้นไป */
const CONTACT: SnapHand = {
  wrist: WRIST,
  middleMcp: MIDDLE_MCP,
  thumbTip: { x: 0.46, y: 0.55 },
  middleTip: { x: 0.47, y: 0.54 },
  indexTip: { x: 0.44, y: 0.48 }
};
/** หลังดีด: นิ้วกลางฟาดลงโคนนิ้วโป้ง นิ้วโป้งเด้งออก */
const STRUCK: SnapHand = { ...CONTACT, thumbTip: { x: 0.4, y: 0.52 }, middleTip: { x: 0.47, y: 0.68 } };
/** ปล่อยนิ้วแบบกางออก: นิ้วกลางเหยียดขึ้น (ไม่ได้ฟาดลง) */
const OPENED: SnapHand = { ...CONTACT, thumbTip: { x: 0.38, y: 0.6 }, middleTip: { x: 0.5, y: 0.42 } };

const lerp = (a: LandmarkPoint, b: LandmarkPoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const between = (a: SnapHand, b: SnapHand, t: number): SnapHand => ({
  wrist: a.wrist,
  middleMcp: a.middleMcp,
  thumbTip: lerp(a.thumbTip, b.thumbTip, t),
  middleTip: lerp(a.middleTip, b.middleTip, t),
  indexTip: lerp(a.indexTip, b.indexTip, t)
});
const scale = (hand: SnapHand, k: number): SnapHand =>
  Object.fromEntries(Object.entries(hand).map(([key, p]) => [key, { x: WRIST.x + (p.x - WRIST.x) * k, y: WRIST.y + (p.y - WRIST.y) * k }])) as unknown as SnapHand;

/** ป้อนลำดับเฟรมทุก 33 มิลลิวินาที คืนเวลาที่ดีดสำเร็จ */
function run(detector: SnapDetector, frames: (SnapHand | null)[], start = 0): number[] {
  const snaps: number[] = [];
  frames.forEach((frame, i) => {
    const now = start + i * 33;
    if (detector.update(frame, now).snapped) snaps.push(now);
  });
  return snaps;
}

describe("SnapDetector", () => {
  it("แตะนิ้วโป้งกับนิ้วกลางค้าง แล้วสะบัดฟาดลงเร็ว ๆ = ดีดนิ้ว", () => {
    const detector = new SnapDetector();
    expect(detector.update(CONTACT, 0)).toEqual({ contact: true, snapped: false });
    expect(run(detector, [CONTACT, CONTACT, STRUCK], 33)).toEqual([99]);
  });

  it("แยกนิ้วสองเฟรม (ภาพจากกล้องช้า) ก็ยังนับ", () => {
    expect(run(new SnapDetector(), [CONTACT, CONTACT, between(CONTACT, STRUCK, 0.5), STRUCK])).toEqual([99]);
  });

  it("ไม่ขึ้นกับระยะห่างจากกล้อง", () => {
    for (const k of [0.5, 1.5]) {
      expect(run(new SnapDetector(), [scale(CONTACT, k), scale(CONTACT, k), scale(STRUCK, k)])).toEqual([66]);
    }
  });

  it("แตะกันแค่เฟรมเดียว (จุดกระโดด) ไม่นับ", () => {
    expect(run(new SnapDetector(), [CONTACT, STRUCK])).toEqual([]);
  });

  it("ปล่อยนิ้วช้า ๆ ไม่นับ", () => {
    const slow = Array.from({ length: 12 }, (_, i) => between(CONTACT, STRUCK, (i + 1) / 12));
    expect(run(new SnapDetector(), [CONTACT, CONTACT, ...slow])).toEqual([]);
  });

  it("กางนิ้วออกเร็ว ๆ แต่ไม่ได้ฟาดลงฝ่ามือ ไม่นับ", () => {
    expect(run(new SnapDetector(), [CONTACT, CONTACT, OPENED])).toEqual([]);
  });

  it("แยกช้ากว่า 0.2 วินาทีหลังแตะ ไม่นับ", () => {
    const detector = new SnapDetector();
    run(detector, [CONTACT, CONTACT]);
    expect(detector.update(between(CONTACT, STRUCK, 0.2), 66).snapped).toBe(false);
    expect(detector.update(STRUCK, 66 + 240).snapped).toBe(false);
  });

  it("จีบนิ้วชี้คลิกแล้วปล่อย ไม่นับเป็นดีดนิ้ว และไม่ถือว่ากำลังแตะนิ้วกลาง", () => {
    const pinch: SnapHand = { ...CONTACT, indexTip: { x: 0.46, y: 0.545 }, middleTip: { x: 0.52, y: 0.66 } };
    const released: SnapHand = { ...pinch, thumbTip: { x: 0.38, y: 0.6 }, indexTip: { x: 0.44, y: 0.44 } };
    const detector = new SnapDetector();
    expect(detector.update(pinch, 0).contact).toBe(false);
    expect(run(detector, [pinch, pinch, pinch, released], 33)).toEqual([]);
  });

  it("ดีดซ้ำเร็วเกินไปนับครั้งเดียว พ้นช่วงพักแล้วนับใหม่", () => {
    const detector = new SnapDetector();
    const once = [CONTACT, CONTACT, STRUCK];
    expect(run(detector, once, 0)).toEqual([66]);
    expect(run(detector, once, 300)).toEqual([]);
    expect(run(detector, once, 66 + SNAP_COOLDOWN_MS)).toEqual([66 + SNAP_COOLDOWN_MS + 66]);
  });

  it("มือหายกลางคัน เริ่มนับใหม่", () => {
    expect(run(new SnapDetector(), [CONTACT, CONTACT, null, STRUCK])).toEqual([]);
  });

  it("ดึงจุดจากมือ 21 จุด และคืน null เมื่อข้อมูลไม่ครบ", () => {
    const hand = Array.from({ length: 21 }, (_, i) => ({ x: i / 100, y: 0 }));
    expect(snapHandFrom(hand)?.middleTip).toEqual({ x: 0.12, y: 0 });
    expect(snapHandFrom(hand.slice(0, 10))).toBeNull();
    expect(snapHandFrom(undefined)).toBeNull();
  });
});

describe("gestureLabel", () => {
  const base: LabelInput = { shape: "none", pinching: false, snapContact: false, menuOpen: false, speaking: false, card: "none" };

  it("ดีดนิ้วบอกผลตามการ์ดที่รออยู่", () => {
    expect(gestureLabel({ ...base, snapContact: true })).toBe("ดีดนิ้ว · เรียกลูน่า");
    expect(gestureLabel({ ...base, snapContact: true, card: "gesture" })).toBe("ดีดนิ้ว · ยืนยัน");
    expect(gestureLabel({ ...base, snapContact: true, card: "buttonOnly" })).toBe(SNAP_BLOCKED_LABEL);
    expect(snapLabel("buttonOnly")).toBe("ดีดนิ้วยืนยันไม่ได้ · กดปุ่มเอง");
  });

  it("บอกท่าและสิ่งที่ท่าจะทำ", () => {
    expect(gestureLabel({ ...base, shape: "open" })).toBe("แบมือ · เปิดเมนู");
    expect(gestureLabel({ ...base, shape: "open", speaking: true })).toBe("แบมือ · หยุดพูด");
    expect(gestureLabel({ ...base, pinching: true, shape: "open" })).toBe("จีบนิ้ว · คลิก");
    expect(gestureLabel({ ...base, shape: "fist", menuOpen: true })).toBe("กำมือ · เลือก");
    expect(gestureLabel({ ...base, shape: "thumbsDown", card: "gesture" })).toBe("👎 · ยกเลิก");
    expect(gestureLabel({ ...base, shape: "peace" })).toBe("✌️ · พักลูน่า");
    expect(gestureLabel({ ...base, shape: "fist" })).toBeNull();
    expect(gestureLabel(base)).toBeNull();
  });

  it("ป้ายหลังสั่งงานสำเร็จ", () => {
    expect(commandLabel({ type: "swipe", direction: "left" })).toBe("ปัดซ้าย · กลับหน้าหลัก");
    expect(commandLabel({ type: "cancel" })).toBe("👎 · ยกเลิก");
    expect(commandLabel({ type: "listen" })).toBeNull();
  });
});
