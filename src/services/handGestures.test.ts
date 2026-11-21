import { describe, expect, it } from "vitest";
import { CLICK_COOLDOWN_MS, dueForDetection, OneEuroFilter, OneEuroPoint, PINCH_CONFIRM_MS, PinchDetector, pinchRatio } from "./handGestures";

describe("OneEuroFilter", () => {
  it("ค่าแรกผ่านตรง ๆ", () => {
    expect(new OneEuroFilter().filter(100, 0)).toBe(100);
  });

  it("มืออยู่นิ่งแต่สั่นเล็กน้อย: เคอร์เซอร์แทบไม่ขยับ", () => {
    const filter = new OneEuroFilter(1.1, 0.012);
    let out = filter.filter(500, 0);
    let maxStep = 0;
    for (let frame = 1; frame <= 60; frame += 1) {
      const next = filter.filter(500 + (frame % 2 === 0 ? 4 : -4), frame * 33);
      maxStep = Math.max(maxStep, Math.abs(next - out));
      out = next;
    }
    expect(maxStep).toBeLessThan(2);
  });

  it("มือขยับเร็ว: ตามทันภายในไม่กี่เฟรม (ไม่หน่วงแบบค่าเฉลี่ยคงที่)", () => {
    const filter = new OneEuroFilter(1.1, 0.012);
    filter.filter(0, 0);
    let out = 0;
    for (let frame = 1; frame <= 6; frame += 1) out = filter.filter(800, frame * 33);
    expect(out).toBeGreaterThan(700);
  });

  it("เวลาไม่เดินหน้าหรือหลัง reset: เริ่มจากค่าใหม่", () => {
    const filter = new OneEuroFilter();
    filter.filter(10, 100);
    expect(filter.filter(50, 100)).toBe(50);
    filter.reset();
    expect(filter.filter(7, 200)).toBe(7);
  });

  it("กรองสองมิติแยกแกน", () => {
    const point = new OneEuroPoint();
    expect(point.filter({ x: 1, y: 2 }, 0)).toEqual({ x: 1, y: 2 });
  });
});

describe("pinchRatio", () => {
  const wrist = { x: 0.5, y: 0.8 };
  const middleMcp = { x: 0.5, y: 0.6 };

  it("วัดเทียบกับขนาดมือ จึงได้ค่าเท่ากันไม่ว่ามือใกล้หรือไกลกล้อง", () => {
    const near = pinchRatio({ x: 0.5, y: 0.5 }, { x: 0.54, y: 0.5 }, wrist, middleMcp);
    // มือไกลกล้องครึ่งหนึ่ง: ทุกระยะเล็กลงครึ่งหนึ่ง
    const far = pinchRatio({ x: 0.25, y: 0.25 }, { x: 0.27, y: 0.25 }, { x: 0.25, y: 0.4 }, { x: 0.25, y: 0.3 });
    expect(near).toBeCloseTo(0.2, 5);
    expect(far).toBeCloseTo(0.2, 5);
  });

  it("มือเล็กเกินจะวัดได้: null", () => {
    expect(pinchRatio({ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.51 })).toBeNull();
  });
});

describe("PinchDetector", () => {
  it("ต้องจีบค้างสั้น ๆ ก่อนนับ แล้วกดครั้งเดียวต่อหนึ่งการจีบ", () => {
    const detector = new PinchDetector();
    expect(detector.update(0.2, 0)).toEqual({ pinching: false, click: false });
    expect(detector.update(0.2, PINCH_CONFIRM_MS - 1)).toEqual({ pinching: false, click: false });
    expect(detector.update(0.2, PINCH_CONFIRM_MS)).toEqual({ pinching: true, click: true });
    expect(detector.update(0.2, PINCH_CONFIRM_MS + 33)).toEqual({ pinching: true, click: false });
  });

  it("ช่วงระหว่างเปิด/ปิด (hysteresis): นิ้วห่างนิดหน่อยไม่ปล่อย จึงไม่กดซ้ำ", () => {
    const detector = new PinchDetector();
    detector.update(0.2, 0);
    detector.update(0.2, 100);
    expect(detector.update(0.5, 133)).toEqual({ pinching: true, click: false });
    expect(detector.update(0.3, 166)).toEqual({ pinching: true, click: false });
    expect(detector.update(0.7, 200)).toEqual({ pinching: false, click: false });
  });

  it("มือเคลื่อนผ่านท่าจีบชั่วขณะ (เฟรมเดียว): ไม่กด", () => {
    const detector = new PinchDetector();
    expect(detector.update(0.2, 0).click).toBe(false);
    expect(detector.update(0.5, 33).click).toBe(false);
    expect(detector.update(0.2, 66).click).toBe(false);
  });

  it("จีบใหม่เร็วเกินไป: ไม่นับเป็นการกดซ้ำ", () => {
    const detector = new PinchDetector();
    detector.update(0.2, 0);
    expect(detector.update(0.2, 100).click).toBe(true);
    detector.update(0.8, 150);
    detector.update(0.2, 180);
    expect(detector.update(0.2, 260).click).toBe(false);
    detector.update(0.8, 300);
    detector.update(0.2, 100 + CLICK_COOLDOWN_MS);
    expect(detector.update(0.2, 200 + CLICK_COOLDOWN_MS).click).toBe(true);
  });

  it("มือหายจากกล้อง: เลิกจีบ", () => {
    const detector = new PinchDetector();
    detector.update(0.2, 0);
    detector.update(0.2, 100);
    expect(detector.update(null, 133)).toEqual({ pinching: false, click: false });
  });
});

describe("dueForDetection", () => {
  it("ตรวจจับไม่ถี่กว่าราว 30 ครั้งต่อวินาที", () => {
    expect(dueForDetection(100, 80)).toBe(false);
    expect(dueForDetection(113, 80)).toBe(true);
    expect(dueForDetection(0, -Infinity)).toBe(true);
  });
});
