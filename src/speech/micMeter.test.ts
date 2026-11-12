import { describe, expect, it, vi } from "vitest";
import { canMeterMicrophone, createMicMeter, spectrumToLevels, type MeterAnalyser, type MeterStream, type MicMeterDeps } from "./micMeter";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** รอให้งานอะซิงก์ที่ค้างอยู่เดินจนสุด ไม่ขึ้นกับจำนวนจังหวะของ Promise ข้างใน */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** สตรีมไมโครโฟนจำลอง: จดว่าแทร็กถูกปิดแล้วหรือยัง */
function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } satisfies MeterStream };
}

/** ตัววิเคราะห์จำลอง: คืนสเปกตรัมที่กำหนดไว้ทุกครั้งที่อ่าน */
function fakeAnalyser(spectrum: number[]) {
  const analyser = {
    binCount: spectrum.length,
    read: vi.fn((bins: Uint8Array) => bins.set(spectrum)),
    close: vi.fn()
  } satisfies MeterAnalyser;
  return analyser;
}

const LOUD = Array.from({ length: 64 }, () => 200);

/** ระบบของเบราว์เซอร์จำลอง ค่าเริ่มต้นคือได้รับสิทธิ์ไมโครโฟนแล้วและเปิดสตรีมได้ทันที */
function setup(overrides: Partial<MicMeterDeps> = {}) {
  const { track, stream } = fakeStream();
  const analyser = fakeAnalyser(LOUD);
  const deps = {
    permission: vi.fn(async () => "granted"),
    open: vi.fn(async (): Promise<MeterStream> => stream),
    analyse: vi.fn((): MeterAnalyser => analyser),
    ...overrides
  } satisfies MicMeterDeps;
  return { meter: createMicMeter(deps), deps, track, analyser };
}

const levels = () => new Float32Array(60);

describe("createMicMeter", () => {
  it("ได้รับสิทธิ์ไมโครโฟนแล้ว: เปิดสตรีมและอ่านระดับเสียงของแต่ละแท่งได้", async () => {
    const { meter, deps } = setup();
    const bars = levels();
    expect(meter.read(bars)).toBe(false);

    expect(await meter.start()).toBe(true);

    expect(deps.open).toHaveBeenCalledTimes(1);
    expect(meter.read(bars)).toBe(true);
    expect(Math.max(...bars)).toBeGreaterThan(0.5);
  });

  it.each(["prompt", "denied", "unknown"])(
    "สิทธิ์ไมโครโฟนเป็น %j: ไม่เปิดไมโครโฟนเอง เพื่อไม่ให้เบราว์เซอร์ถามผู้ใช้ซ้อนกับระบบฟัง",
    async (state) => {
      const { meter, deps } = setup({ permission: vi.fn(async () => state) });

      expect(await meter.start()).toBe(false);

      expect(deps.open).not.toHaveBeenCalled();
      expect(meter.read(levels())).toBe(false);
    }
  );

  it("หยุดวัด: ปิดไมโครโฟนและตัววิเคราะห์ แล้วอ่านไม่ได้อีก", async () => {
    const { meter, track, analyser } = setup();
    await meter.start();

    meter.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(analyser.close).toHaveBeenCalledTimes(1);
    expect(meter.read(levels())).toBe(false);
  });

  it("สั่งเริ่มซ้ำระหว่างที่วัดอยู่: ไม่เปิดไมโครโฟนซ้ำ", async () => {
    const { meter, deps } = setup();

    await meter.start();
    expect(await meter.start()).toBe(true);

    expect(deps.open).toHaveBeenCalledTimes(1);
  });

  it("หยุดก่อนที่สตรีมจะมาถึง: ปิดสตรีมที่มาทีหลังทันที ไม่ทิ้งไมโครโฟนเปิดค้าง", async () => {
    const pending = deferred<MeterStream>();
    const { track, stream } = fakeStream();
    const { meter, deps } = setup({ open: vi.fn(() => pending.promise) });

    const started = meter.start();
    await flush();
    meter.stop();
    pending.resolve(stream);

    expect(await started).toBe(false);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(deps.analyse).not.toHaveBeenCalled();
    expect(meter.read(levels())).toBe(false);
  });

  it("หยุดแล้วเริ่มใหม่ทันที (React เรียก effect ซ้ำ): รอบใหม่วัดได้ และสตรีมของรอบเก่าถูกปิด", async () => {
    const first = deferred<MeterStream>();
    const second = deferred<MeterStream>();
    const old = fakeStream();
    const fresh = fakeStream();
    const open = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { meter } = setup({ open });

    const firstStart = meter.start();
    await flush();
    meter.stop();
    const secondStart = meter.start();
    await flush();
    first.resolve(old.stream);
    second.resolve(fresh.stream);

    expect(await firstStart).toBe(false);
    expect(await secondStart).toBe(true);
    expect(old.track.stop).toHaveBeenCalledTimes(1);
    expect(fresh.track.stop).not.toHaveBeenCalled();
    expect(meter.read(levels())).toBe(true);
  });

  it.each([
    ["ถามสถานะสิทธิ์ไม่ได้", { permission: vi.fn(async () => Promise.reject(new TypeError("unsupported"))) }],
    ["เปิดไมโครโฟนไม่สำเร็จ", { open: vi.fn(async () => Promise.reject(new Error("NotReadableError"))) }]
  ])("%s: วัดไม่ได้ แต่ไม่ล้ม", async (_name, overrides) => {
    const { meter } = setup(overrides);

    expect(await meter.start()).toBe(false);
    expect(meter.read(levels())).toBe(false);
    expect(() => meter.stop()).not.toThrow();
  });

  it("สร้างตัววิเคราะห์ไม่สำเร็จ: ปิดไมโครโฟนที่เปิดไปแล้ว", async () => {
    const { meter, track } = setup({
      analyse: vi.fn((): MeterAnalyser => {
        throw new Error("AudioContext is not allowed");
      })
    });

    expect(await meter.start()).toBe(false);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("ปิดตัววิเคราะห์แล้วเกิดข้อผิดพลาด: ยังปิดไมโครโฟนได้ และไม่ล้ม", async () => {
    const analyser = fakeAnalyser(LOUD);
    analyser.close.mockImplementation(() => {
      throw new Error("already closed");
    });
    const { meter, track } = setup({ analyse: vi.fn(() => analyser) });
    await meter.start();

    expect(() => meter.stop()).not.toThrow();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});

describe("spectrumToLevels", () => {
  const spectrum = (fill: (bin: number) => number, length = 256) => Uint8Array.from({ length }, (_unused, bin) => fill(bin));

  it("เงียบ: ทุกแท่งเป็นศูนย์", () => {
    const bars = levels();
    spectrumToLevels(spectrum(() => 0), bars);

    expect([...bars].every((level) => level === 0)).toBe(true);
  });

  it("ซ้ายขวาสมมาตรกัน: เสียงต่ำอยู่ด้านบนของวง เสียงสูงอยู่ด้านล่าง", () => {
    const bars = levels();
    // ดังเฉพาะย่านต่ำ
    spectrumToLevels(spectrum((bin) => (bin <= 8 ? 220 : 0)), bars);

    for (let index = 0; index < bars.length / 2; index += 1) expect(bars[index]).toBe(bars[bars.length - 1 - index]);
    expect(bars[0]).toBeGreaterThan(0.5);
    expect(bars[29]).toBe(0);
  });

  it("ไม่นับช่องแรกของสเปกตรัม ซึ่งเป็นค่าคงที่ของสัญญาณ ไม่ใช่เสียง", () => {
    const bars = levels();
    spectrumToLevels(spectrum((bin) => (bin === 0 ? 255 : 0)), bars);

    expect(Math.max(...bars)).toBe(0);
  });

  it("เสียงดังสุด: ระดับไม่เกิน 1", () => {
    const bars = levels();
    spectrumToLevels(spectrum(() => 255), bars);

    expect(Math.max(...bars)).toBe(1);
    expect(Math.min(...bars)).toBeGreaterThan(0.9);
  });

  it("เสียงพูดเบาลงตามความถี่: ชดเชยให้แท่งย่านสูงยังขยับเห็นได้", () => {
    const bars = levels();
    spectrumToLevels(spectrum(() => 100), bars);

    expect(bars[29]).toBeGreaterThan(bars[0]);
  });

  it.each([
    ["สเปกตรัมสั้นกว่าจำนวนแท่ง", 8, 60],
    ["สเปกตรัมว่าง", 0, 60],
    ["จำนวนแท่งเป็นเลขคี่", 256, 7],
    ["ไม่มีแท่งให้เติม", 256, 0]
  ])("%s: ได้ค่าระหว่าง 0 ถึง 1 ทุกแท่ง ไม่มีค่าที่ไม่ใช่ตัวเลข", (_name, bins, count) => {
    const bars = new Float32Array(count);
    spectrumToLevels(spectrum(() => 180, bins), bars);

    expect([...bars].every((level) => Number.isFinite(level) && level >= 0 && level <= 1)).toBe(true);
  });
});

describe("canMeterMicrophone", () => {
  const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
  const desktopBrowser = { userAgent: CHROME_WINDOWS, touchPoints: 0, mediaDevices: true, native: false, desktopApp: false, reducedMotion: false };

  it("เบราว์เซอร์บนคอมพิวเตอร์: วัดได้", () => {
    expect(canMeterMicrophone(desktopBrowser)).toBe(true);
    // จอสัมผัสของโน้ตบุ๊ก Windows ไม่ใช่มือถือ
    expect(canMeterMicrophone({ ...desktopBrowser, touchPoints: 10 })).toBe(true);
  });

  it.each([
    ["Chrome บน Android", { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36" }],
    ["Safari บน iPhone", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" }],
    [
      "Safari บน iPad ซึ่งบอกตัวเองว่าเป็น Mac",
      { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15", touchPoints: 5 }
    ]
  ])("%s: ไม่วัด เพราะไมโครโฟนตัวเดียวกันอาจถูกแย่งจากระบบฟัง", (_name, env) => {
    expect(canMeterMicrophone({ ...desktopBrowser, ...env })).toBe(false);
  });

  it.each([
    ["แอปมือถือ", { native: true }],
    ["แอปเดสก์ท็อป ซึ่งอัดเสียงเองอยู่แล้ว", { desktopApp: true }],
    ["เบราว์เซอร์ที่ไม่มีระบบเปิดไมโครโฟน", { mediaDevices: false }],
    ["อุปกรณ์ที่ตั้งค่าลดการเคลื่อนไหว", { reducedMotion: true }]
  ])("%s: ไม่วัด", (_name, env) => {
    expect(canMeterMicrophone({ ...desktopBrowser, ...env })).toBe(false);
  });

  it("Mac ที่ไม่มีจอสัมผัส: วัดได้", () => {
    const safariMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

    expect(canMeterMicrophone({ ...desktopBrowser, userAgent: safariMac, touchPoints: 0 })).toBe(true);
  });
});
