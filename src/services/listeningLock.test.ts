import { describe, expect, it, vi } from "vitest";
import { createListeningLock } from "./listeningLock";
import { createTabLock, type LockManagerLike } from "./tabLock";

/** รอให้งานอะซิงก์ที่ค้างอยู่เดินจนสุด */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * ระบบล็อกข้ามแท็บจำลอง (ส่วนของ Web Locks ที่ใช้): ล็อกแต่ละชื่อถือได้ทีละราย ขอแบบ ifAvailable ได้ null ถ้าไม่ว่าง
 * ขอแบบ steal จะแย่งจากผู้ถือเดิม ซึ่งคำขอของผู้ถือเดิมจะล้มเหลว
 * และขอแบบปกติจะต่อคิวรอจนผู้ถือปล่อย หรือจนถูกยกเลิกด้วย signal
 */
function fakeLocks() {
  interface Slot {
    holder: { broken: (error: Error) => void } | null;
    waiting: Array<() => void>;
  }
  const slots = new Map<string, Slot>();
  const requests: Array<{ ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal }> = [];
  const aborted = () => Object.assign(new Error("aborted"), { name: "AbortError" });

  const slotFor = (name: string): Slot => {
    let slot = slots.get(name);
    if (!slot) {
      slot = { holder: null, waiting: [] };
      slots.set(name, slot);
    }
    return slot;
  };

  const manager: LockManagerLike = {
    request(name, options, callback) {
      requests.push(options);
      const slot = slotFor(name);

      const grant = () =>
        new Promise((resolve, reject) => {
          const mine = { broken: reject };
          slot.holder = mine;
          Promise.resolve(callback({ name })).then(() => {
            if (slot.holder === mine) {
              slot.holder = null;
              slot.waiting.shift()?.();
            }
            resolve(undefined);
          }, reject);
        });

      if (!slot.holder) return grant();
      if (options.steal) {
        slot.holder.broken(aborted());
        return grant();
      }
      if (options.ifAvailable) return Promise.resolve(callback(null));

      return new Promise((resolve, reject) => {
        const begin = () => {
          options.signal?.removeEventListener("abort", cancel);
          grant().then(resolve, reject);
        };
        const cancel = () => {
          slot.waiting.splice(slot.waiting.indexOf(begin), 1);
          reject(aborted());
        };
        options.signal?.addEventListener("abort", cancel);
        slot.waiting.push(begin);
      });
    }
  };
  return { manager, requests, isHeld: () => [...slots.values()].some((slot) => slot.holder !== null) };
}

describe("createTabLock", () => {
  it("ล็อกคนละชื่อไม่กันกัน: แท็บหนึ่งฟังอยู่ อีกแท็บยังเป็นเจ้าของการประชุมได้", async () => {
    const { manager } = fakeLocks();
    const listening = createTabLock(manager, "javis.listening");
    const meeting = createTabLock(manager, "javis.meeting");

    expect(await listening.acquire({ steal: false, onLost: vi.fn() })).toBe(true);
    expect(await meeting.acquire({ steal: false, onLost: vi.fn() })).toBe(true);
  });

  it("ล็อกชื่อเดียวกัน: แท็บที่สองไม่ได้ จนกว่าแท็บแรกจะปล่อย", async () => {
    const { manager } = fakeLocks();
    const first = createTabLock(manager, "javis.meeting");
    const second = createTabLock(manager, "javis.meeting");

    await first.acquire({ steal: false, onLost: vi.fn() });
    expect(await second.acquire({ steal: false, onLost: vi.fn() })).toBe(false);

    first.release();
    await flush();
    expect(await second.acquire({ steal: false, onLost: vi.fn() })).toBe(true);
  });

  describe("รอจนสิทธิ์ว่าง", () => {
    it("ไม่มีแท็บใดถืออยู่: ได้สิทธิ์เกือบทันที และถือไว้ให้แท็บนี้", async () => {
      const { manager, isHeld } = fakeLocks();
      const tab = createTabLock(manager, "javis.meeting");
      const acquired = vi.fn();

      tab.waitFor({ onAcquired: acquired, onLost: vi.fn() });
      await flush();

      expect(acquired).toHaveBeenCalledTimes(1);
      expect(isHeld()).toBe(true);
    });

    it("แท็บอื่นถืออยู่: ยังไม่ได้ จนแท็บนั้นปล่อย (เช่นถูกปิด) จึงได้เอง", async () => {
      const { manager } = fakeLocks();
      const first = createTabLock(manager, "javis.meeting");
      const second = createTabLock(manager, "javis.meeting");
      const acquired = vi.fn();
      await first.acquire({ steal: true, onLost: vi.fn() });

      second.waitFor({ onAcquired: acquired, onLost: vi.fn() });
      await flush();
      expect(acquired).not.toHaveBeenCalled();

      first.release();
      await flush();
      expect(acquired).toHaveBeenCalledTimes(1);
      expect(await first.acquire({ steal: false, onLost: vi.fn() })).toBe(false);
    });

    it("ยกเลิกการรอ: ไม่ได้สิทธิ์ แม้แท็บอื่นจะปล่อยทีหลัง", async () => {
      const { manager, isHeld } = fakeLocks();
      const first = createTabLock(manager, "javis.meeting");
      const second = createTabLock(manager, "javis.meeting");
      const acquired = vi.fn();
      await first.acquire({ steal: true, onLost: vi.fn() });

      const cancel = second.waitFor({ onAcquired: acquired, onLost: vi.fn() });
      await flush();
      cancel();
      first.release();
      await flush();

      expect(acquired).not.toHaveBeenCalled();
      expect(isHeld()).toBe(false);
    });

    it("ได้สิทธิ์จากการรอแล้ว: ถูกบอกเมื่อแท็บอื่นแย่งไป", async () => {
      const { manager } = fakeLocks();
      const first = createTabLock(manager, "javis.meeting");
      const second = createTabLock(manager, "javis.meeting");
      const lost = vi.fn();

      first.waitFor({ onAcquired: vi.fn(), onLost: lost });
      await flush();
      await second.acquire({ steal: true, onLost: vi.fn() });
      await flush();

      expect(lost).toHaveBeenCalledTimes(1);
    });

    it("ได้สิทธิ์จากการรอแล้ว: ปล่อยได้ตามปกติ", async () => {
      const { manager, isHeld } = fakeLocks();
      const tab = createTabLock(manager, "javis.meeting");

      tab.waitFor({ onAcquired: vi.fn(), onLost: vi.fn() });
      await flush();
      tab.release();
      await flush();

      expect(isHeld()).toBe(false);
    });

    it("แท็บนี้ถือสิทธิ์อยู่เองจากการขออีกทาง: การรอได้สิทธิ์หลังจากปล่อย ไม่ซ้อนกัน", async () => {
      const { manager, isHeld } = fakeLocks();
      const tab = createTabLock(manager, "javis.meeting");
      const acquired = vi.fn();
      await tab.acquire({ steal: true, onLost: vi.fn() });

      tab.waitFor({ onAcquired: acquired, onLost: vi.fn() });
      await flush();
      expect(acquired).not.toHaveBeenCalled();

      tab.release();
      await flush();
      expect(acquired).toHaveBeenCalledTimes(1);
      tab.release();
      await flush();
      expect(isHeld()).toBe(false);
    });

    it("เบราว์เซอร์ไม่มีระบบล็อกข้ามแท็บ: ถือว่าได้สิทธิ์ทันที", async () => {
      const acquired = vi.fn();

      createTabLock(null, "javis.meeting").waitFor({ onAcquired: acquired, onLost: vi.fn() });
      await flush();

      expect(acquired).toHaveBeenCalledTimes(1);
    });

    it("เบราว์เซอร์ไม่มีระบบล็อก และยกเลิกการรอทันที: ไม่ถูกเรียก", async () => {
      const acquired = vi.fn();

      createTabLock(null, "javis.meeting").waitFor({ onAcquired: acquired, onLost: vi.fn() })();
      await flush();

      expect(acquired).not.toHaveBeenCalled();
    });

    it("เบราว์เซอร์ปฏิเสธคำขอล็อก: ถือว่าได้สิทธิ์ ดีกว่าทำให้ใช้งานไม่ได้เลย", async () => {
      const refusing: LockManagerLike = { request: () => Promise.reject(new Error("SecurityError")) };
      const acquired = vi.fn();

      createTabLock(refusing, "javis.meeting").waitFor({ onAcquired: acquired, onLost: vi.fn() });
      await flush();

      expect(acquired).toHaveBeenCalledTimes(1);
    });
  });
});

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
