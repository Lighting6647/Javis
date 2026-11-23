import { describe, expect, it } from "vitest";
import type { LandmarkPoint } from "./handGestures";
import {
  classifyHand,
  clampMenuCenter,
  GestureEngine,
  type GestureFrame,
  type GestureOutput,
  type HandShape,
  palmCenter,
  radialIndex
} from "./gestureCommands";

// มือจำลองตั้งตรงหันฝ่ามือเข้ากล้อง: ข้อมืออยู่ล่าง นิ้วชี้ขึ้น ขนาดมือ (ข้อมือถึงโคนนิ้วกลาง) = 0.2
const WRIST = { x: 0.5, y: 0.8 };
const MCP = [
  { x: 0.44, y: 0.62 },
  { x: 0.5, y: 0.6 },
  { x: 0.56, y: 0.61 },
  { x: 0.61, y: 0.64 }
];

type Thumb = "tucked" | "out" | "up";

function makeHand(fingers: [boolean, boolean, boolean, boolean], thumb: Thumb): LandmarkPoint[] {
  const thumbTip = { tucked: { x: 0.47, y: 0.63 }, out: { x: 0.3, y: 0.62 }, up: { x: 0.35, y: 0.5 } }[thumb];
  const points: LandmarkPoint[] = [WRIST, { x: 0.42, y: 0.76 }, { x: 0.38, y: 0.7 }, { x: 0.36, y: 0.64 }, thumbTip];
  fingers.forEach((extended, i) => {
    const mcp = MCP[i]!;
    const offsets = extended ? [-0.08, -0.12, -0.16] : [-0.05, -0.02, 0.04];
    points.push(mcp, ...offsets.map((dy) => ({ x: mcp.x, y: mcp.y + dy })));
  });
  return points;
}

/** หมุนมือรอบข้อมือ (เรเดียน) */
const rotate = (hand: LandmarkPoint[], angle: number) =>
  hand.map((p) => {
    const dx = p.x - WRIST.x;
    const dy = p.y - WRIST.y;
    return { x: WRIST.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: WRIST.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
  });

/** กลับหัวมือ (ข้อมืออยู่บน นิ้วชี้ลง) */
const flipVertical = (hand: LandmarkPoint[]) => hand.map((p) => ({ x: p.x, y: 2 * WRIST.y - p.y }));

/** ย่อ/ขยายมือรอบข้อมือ เหมือนมืออยู่ใกล้หรือไกลกล้อง */
const scale = (hand: LandmarkPoint[], factor: number) =>
  hand.map((p) => ({ x: WRIST.x + (p.x - WRIST.x) * factor, y: WRIST.y + (p.y - WRIST.y) * factor }));

const OPEN = makeHand([true, true, true, true], "out");
const FIST = makeHand([false, false, false, false], "tucked");
const INDEX_UP = makeHand([true, false, false, false], "tucked");
const THUMBS_UP = makeHand([false, false, false, false], "up");

describe("classifyHand", () => {
  it("จำท่าพื้นฐานได้", () => {
    expect(classifyHand(OPEN)).toBe("open");
    expect(classifyHand(FIST)).toBe("fist");
    expect(classifyHand(INDEX_UP)).toBe("indexUp");
    expect(classifyHand(THUMBS_UP)).toBe("thumbsUp");
    expect(classifyHand(flipVertical(THUMBS_UP))).toBe("thumbsDown");
  });

  it("ไม่ขึ้นกับระยะห่างจากกล้อง", () => {
    for (const factor of [0.5, 1.4]) {
      expect(classifyHand(scale(OPEN, factor))).toBe("open");
      expect(classifyHand(scale(FIST, factor))).toBe("fist");
      expect(classifyHand(scale(THUMBS_UP, factor))).toBe("thumbsUp");
    }
  });

  it("แบมือและกำมือยังจำได้แม้มือเอียง", () => {
    expect(classifyHand(rotate(OPEN, 0.5))).toBe("open");
    expect(classifyHand(rotate(FIST, -0.6))).toBe("fist");
  });

  it("ชี้นิ้วไปด้านข้างไม่นับเป็นชูนิ้วชี้ และนิ้วโป้งเอียงข้างไม่นับเป็นนิ้วโป้งขึ้น", () => {
    expect(classifyHand(rotate(INDEX_UP, Math.PI / 2))).toBe("none");
    expect(classifyHand(rotate(THUMBS_UP, Math.PI / 2))).not.toMatch(/^thumbs/);
  });

  it("ชูสองนิ้วหรือข้อมูลไม่ครบ ไม่เดาท่า", () => {
    expect(classifyHand(makeHand([true, true, false, false], "tucked"))).toBe("none");
    expect(classifyHand(OPEN.slice(0, 10))).toBe("none");
    expect(classifyHand(scale(OPEN, 0.1))).toBe("none");
  });

  it("หาจุดกลางฝ่ามือได้", () => {
    const center = palmCenter(OPEN)!;
    expect(center.x).toBeCloseTo((0.5 + 0.44 + 0.5 + 0.61) / 4);
    expect(palmCenter([])).toBeNull();
  });
});

describe("radialIndex / clampMenuCenter", () => {
  const c = { x: 500, y: 400 };
  it("ช่องแรกอยู่บน แล้ววนตามเข็มนาฬิกา", () => {
    expect(radialIndex(c, { x: 500, y: 300 }, 4, 40)).toBe(0);
    expect(radialIndex(c, { x: 600, y: 400 }, 4, 40)).toBe(1);
    expect(radialIndex(c, { x: 500, y: 500 }, 4, 40)).toBe(2);
    expect(radialIndex(c, { x: 400, y: 400 }, 4, 40)).toBe(3);
    expect(radialIndex(c, { x: 420, y: 310 }, 4, 40)).toBe(0);
  });
  it("มือใกล้กลางเมนูยังไม่เลือก", () => {
    expect(radialIndex(c, { x: 510, y: 410 }, 4, 40)).toBeNull();
    expect(radialIndex(c, { x: 600, y: 400 }, 0, 40)).toBeNull();
  });
  it("เมนูไม่ล้นขอบจอ", () => {
    expect(clampMenuCenter({ x: 5, y: 900 }, 120, 1280, 800)).toEqual({ x: 144, y: 656 });
    expect(clampMenuCenter({ x: 50, y: 50 }, 120, 200, 800)).toEqual({ x: 100, y: 144 });
  });
});

describe("GestureEngine", () => {
  const viewport = { width: 1280, height: 800 };
  const STEP = 33;

  /** ป้อนท่าเดิมต่อเนื่อง คืนผลทุกเฟรม */
  function feed(engine: GestureEngine, shape: HandShape | null, fromMs: number, toMs: number, point = { x: 640, y: 400 }, speaking = false) {
    const outputs: GestureOutput[] = [];
    for (let now = fromMs; now <= toMs; now += STEP) {
      const frame: GestureFrame = { shape, point, now, speaking, viewport };
      outputs.push(engine.update(frame));
    }
    return outputs;
  }
  const commandsOf = (outputs: GestureOutput[]) => outputs.flatMap((o) => o.commands);

  it("ชูนิ้วชี้ค้าง 0.8 วิ สั่งฟังครั้งเดียว ค้างต่อก็ไม่สั่งซ้ำ", () => {
    const engine = new GestureEngine(4);
    expect(commandsOf(feed(engine, "indexUp", 0, 760))).toEqual([]);
    expect(commandsOf(feed(engine, "indexUp", 793, 3000))).toEqual([{ type: "listen" }]);
  });

  it("ค้างไม่ครบเวลาแล้วปล่อย ไม่สั่งอะไร และวงนับถอยหลังแสดงความคืบหน้า", () => {
    const engine = new GestureEngine(4);
    const out = feed(engine, "indexUp", 0, 400);
    expect(out.at(-1)?.hold?.kind).toBe("listen");
    expect(out.at(-1)?.hold?.progress).toBeCloseTo(396 / 800, 2);
    expect(commandsOf([...out, ...feed(engine, "none", 433, 1500)])).toEqual([]);
  });

  it("ภาพกระตุกแวบเดียวไม่ทำให้นับใหม่", () => {
    const engine = new GestureEngine(4);
    const out = [...feed(engine, "indexUp", 0, 396), ...feed(engine, null, 429, 462), ...feed(engine, "indexUp", 495, 900)];
    expect(commandsOf(out)).toEqual([{ type: "listen" }]);
  });

  it("ยืนยันต้องค้าง 1.8 วิ ยกเลิกค้าง 1 วิ", () => {
    const up = new GestureEngine(4);
    expect(commandsOf(feed(up, "thumbsUp", 0, 1700))).toEqual([]);
    expect(commandsOf(feed(up, "thumbsUp", 1733, 1900))).toEqual([{ type: "confirm" }]);
    const down = new GestureEngine(4);
    expect(commandsOf(feed(down, "thumbsDown", 0, 950))).toEqual([]);
    expect(commandsOf(feed(down, "thumbsDown", 983, 1100))).toEqual([{ type: "cancel" }]);
  });

  it("แบมือค้างตอนลูน่าพูด หยุดเสียงหลังราวครึ่งวินาทีและไม่เปิดเมนู", () => {
    const engine = new GestureEngine(4);
    const brief = new GestureEngine(4);
    expect(commandsOf(feed(brief, "open", 0, 300, { x: 640, y: 400 }, true))).toEqual([]);
    const out = feed(engine, "open", 0, 1000, { x: 640, y: 400 }, true);
    expect(commandsOf(out)).toEqual([{ type: "stopSpeaking" }]);
    const firedAt = out.findIndex((o) => o.commands.length > 0) * STEP;
    expect(firedAt).toBeGreaterThanOrEqual(550);
    expect(firedAt).toBeLessThanOrEqual(700);
    expect(out.every((o) => o.menu === null)).toBe(true);
  });

  it("แบมือค้างเปิดเมนู เลื่อนมือไปขวาแล้วกำมือ เลือกช่องขวา", () => {
    const engine = new GestureEngine(4);
    const opened = feed(engine, "open", 0, 640);
    const menu = opened.at(-1)?.menu;
    expect(menu?.center).toEqual({ x: 640, y: 400 });
    expect(engine.menuOpen).toBe(true);

    const hover = feed(engine, "open", 660, 700, { x: 760, y: 400 });
    expect(hover.at(-1)?.menu?.highlighted).toBe(1);
    const chosen = feed(engine, "fist", 733, 1100, { x: 760, y: 400 });
    expect(commandsOf(chosen)).toEqual([{ type: "menuSelect", item: 1 }]);
    expect(engine.menuOpen).toBe(false);
  });

  it("กำมือกลางเมนู (ยังไม่ได้ชี้ช่องไหน) ไม่เลือกอะไร", () => {
    const engine = new GestureEngine(4);
    feed(engine, "open", 0, 640);
    expect(commandsOf(feed(engine, "fist", 660, 1200))).toEqual([]);
    expect(engine.menuOpen).toBe(true);
  });

  it("เมนูปิดเองเมื่อมือหายหรือเลื่อนออกไปไกล", () => {
    const lost = new GestureEngine(4);
    feed(lost, "open", 0, 640);
    feed(lost, null, 660, 900);
    expect(lost.menuOpen).toBe(true);
    feed(lost, null, 933, 1200);
    expect(lost.menuOpen).toBe(false);

    const away = new GestureEngine(4);
    feed(away, "open", 0, 640);
    feed(away, "open", 660, 700, { x: 1200, y: 400 });
    expect(away.menuOpen).toBe(false);
  });

  it("ระหว่างเปิดเมนู ท่าอื่นไม่สั่งงาน", () => {
    const engine = new GestureEngine(4);
    feed(engine, "open", 0, 640);
    expect(commandsOf(feed(engine, "thumbsUp", 660, 3000))).toEqual([]);
    expect(commandsOf(feed(engine, "indexUp", 3033, 5000))).toEqual([]);
  });
});
