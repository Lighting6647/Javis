import { describe, expect, it, vi } from "vitest";
import { createListeningLock, type LockManagerLike } from "./listeningLock";

/** รอให้งานอะซิงก์ที่ค้างอยู่เดินจนสุด */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * ระบบล็อกข้ามแท็บจำลอง (ส่วนของ Web Locks ที่ใช้): ถือได้ทีละราย ขอแบบ ifAvailable ได้ null ถ้าไม่ว่าง
 * และขอแบบ steal จะแย่งจากผู้ถือเดิม ซึ่งคำขอของผู้ถือเดิมจะล้มเหลว
 */
function fakeLocks() {
  let holder: { broken: (error: Error) => void } | null = null;
  const requests: Array<{ ifAvailable?: boolean; steal?: boolean }> = [];

  const manager: LockManagerLike = {
    request(_name, options, callback) {
      requests.push(options);
      if (holder && !options.steal) {
        if (!options.ifAvailable) throw new Error("ตัวจำลองไม่รองรับการต่อคิวรอ");
        return Promise.resolve(callback(null));
      }
      holder?.broken(Object.assign(new Error("lock broken"), { name: "AbortError" }));

      return new Promise((resolve, reject) => {
        const mine = { broken: reject };
        holder = mine;
        Promise.resolve(callback({ name: "javis.listening" })).then(() => {
          if (holder === mine) holder = null;
          resolve(undefined);
        }, reject);
      });
    }
  };
  return { manager, requests, isHeld: () => holder !== null };
}

describe("createListeningLock", () => {
  it("ไม่มีแท็บอื่นฟังอยู่: ได้เป็นแท็บที่ฟัง", async () => {
    const { manager, isHeld } = fakeLocks();
    const tab = createListeningLock(manager);

    expect(await tab.acquire({ steal: false, onLost: vi.fn() })).toBe(true);
    expect(isHeld()).toBe(true);
  });

  it("แท็บอื่นฟังอยู่: ไม่ได้ และไม่แย่งมาเอง", async () => {
    const { manager } = fakeLocks();
    const first = createListeningLock(manager);
    const second = createListeningLock(manager);
    const firstLost = vi.fn();

    await first.acquire({ steal: false, onLost: firstLost });

    expect(await second.acquire({ steal: false, onLost: vi.fn() })).toBe(false);
    await flush();
    expect(firstLost).not.toHaveBeenCalled();
  });

  it("ผู้ใช้เปิดไมโครโฟนที่แท็บนี้เอง: ย้ายมาฟังที่แท็บนี้ และบอกแท็บเดิมว่าไม่ได้ฟังแล้ว", async () => {
    const { manager } = fakeLocks();
    const first = createListeningLock(manager);
    const second = createListeningLock(manager);
    const firstLost = vi.fn();
    const secondLost = vi.fn();

    await first.acquire({ steal: false, onLost: firstLost });

    expect(await second.acquire({ steal: true, onLost: secondLost })).toBe(true);
    await flush();
    expect(firstLost).toHaveBeenCalledTimes(1);
    expect(secondLost).not.toHaveBeenCalled();
    // แท็บเดิมขอกลับแบบไม่แย่ง: ไม่ได้ เพราะแท็บใหม่ฟังอยู่
    expect(await first.acquire({ steal: false, onLost: firstLost })).toBe(false);
  });

  it("ปล่อยแล้ว แท็บอื่นขอได้", async () => {
    const { manager, isHeld } = fakeLocks();
    const first = createListeningLock(manager);
    const second = createListeningLock(manager);

    await first.acquire({ steal: false, onLost: vi.fn() });
    first.release();
    await flush();

    expect(isHeld()).toBe(false);
    expect(await second.acquire({ steal: false, onLost: vi.fn() })).toBe(true);
  });

  it("ขอซ้ำขณะถืออยู่: ได้เลย ไม่ขอซ้อน", async () => {
    const { manager, requests } = fakeLocks();
    const tab = createListeningLock(manager);

    expect(await tab.acquire({ steal: false, onLost: vi.fn() })).toBe(true);
    expect(await tab.acquire({ steal: true, onLost: vi.fn() })).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it("ปล่อยแล้วขอใหม่ติดกันทันที: ได้ ไม่เข้าใจผิดว่าแท็บอื่นถืออยู่", async () => {
    const { manager } = fakeLocks();
    const tab = createListeningLock(manager);

    void tab.acquire({ steal: false, onLost: vi.fn() });
    tab.release();
    const again = tab.acquire({ steal: false, onLost: vi.fn() });

    expect(await again).toBe(true);
  });

  it("ปล่อยแล้วไม่ถูกบอกว่าเสียสิทธิ์ แม้แท็บอื่นจะมาขอต่อ", async () => {
    const { manager } = fakeLocks();
    const first = createListeningLock(manager);
    const second = createListeningLock(manager);
    const firstLost = vi.fn();

    await first.acquire({ steal: false, onLost: firstLost });
    first.release();
    await flush();
    await second.acquire({ steal: true, onLost: vi.fn() });
    await flush();

    expect(firstLost).not.toHaveBeenCalled();
  });

  it("ปล่อยโดยไม่ได้ถืออยู่: ไม่ล้ม", async () => {
    const tab = createListeningLock(fakeLocks().manager);

    expect(() => tab.release()).not.toThrow();
    await flush();
    expect(await tab.acquire({ steal: false, onLost: vi.fn() })).toBe(true);
  });

  it("เบราว์เซอร์ไม่มีระบบล็อกข้ามแท็บ: ฟังได้เสมอ", async () => {
    const tab = createListeningLock(null);

    expect(await tab.acquire({ steal: false, onLost: vi.fn() })).toBe(true);
    expect(() => tab.release()).not.toThrow();
  });

  it("เบราว์เซอร์ปฏิเสธคำขอล็อก: ถือว่าฟังได้ ดีกว่าทำให้ฟังไม่ได้เลย", async () => {
    const refusing: LockManagerLike = { request: () => Promise.reject(new Error("SecurityError")) };
    const tab = createListeningLock(refusing);
    const lost = vi.fn();

    expect(await tab.acquire({ steal: false, onLost: lost })).toBe(true);
    await flush();
    expect(lost).not.toHaveBeenCalled();
  });
});
