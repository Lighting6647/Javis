const LOCK_NAME = "javis.listening";

/** ส่วนของระบบล็อกข้ามแท็บของเบราว์เซอร์ (Web Locks) ที่ใช้ แยกไว้เพื่อให้ทดสอบได้ด้วยตัวจำลอง */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown) => Promise<void> | void
  ): Promise<unknown>;
}

export interface ListeningLock {
  /**
   * ขอเป็นแท็บที่ฟัง คืน false เมื่อแท็บอื่นฟังอยู่และไม่ได้สั่งให้ย้ายมา
   * @param steal ผู้ใช้เปิดไมโครโฟนที่แท็บนี้เอง: ย้ายการฟังมาที่แท็บนี้ แม้แท็บอื่นจะฟังอยู่
   * @param onLost เรียกเมื่อแท็บอื่นย้ายการฟังไปจากแท็บนี้
   */
  acquire(options: { steal: boolean; onLost: () => void }): Promise<boolean>;
  release(): void;
}

interface HeldLock {
  release: () => void;
  /** จบเมื่อเบราว์เซอร์ปล่อยล็อกจริงแล้ว */
  released: Promise<void>;
}

/**
 * ให้ Javis ฟังอยู่ได้ทีละแท็บ: โหมดฟังตลอดเวลาเริ่มฟังเองทุกแท็บที่เปิด ถ้าไม่กันไว้ สองแท็บจะแย่งไมโครโฟนกัน
 * หรือได้ยินคำสั่งเดียวกันแล้วตอบซ้อนกันสองครั้ง
 * @param locks ระบบล็อกของเบราว์เซอร์ หรือ null ถ้าไม่มี ซึ่งจะถือว่าฟังได้เสมอ
 */
export function createListeningLock(locks: LockManagerLike | null): ListeningLock {
  /** การขอและการปล่อยทำตามลำดับที่สั่ง ไม่แซงกัน ไม่เช่นนั้นการปล่อยแล้วขอใหม่ติดกันจะเห็นล็อกของตัวเองว่าเป็นของแท็บอื่น */
  let queue: Promise<void> = Promise.resolve();
  let held: HeldLock | null = null;

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function request(manager: LockManagerLike, steal: boolean, onLost: () => void): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let release: () => void = () => undefined;
      const holding = new Promise<void>((finish) => {
        release = finish;
      });
      let entry: HeldLock | null = null;

      const released: Promise<void> = Promise.resolve()
        .then(() =>
          manager.request(LOCK_NAME, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
            if (!lock) {
              resolve(false);
              return undefined;
            }
            entry = { release, released };
            held = entry;
            resolve(true);
            return holding;
          })
        )
        .then(
          () => undefined,
          () => {
            if (!entry) {
              // เบราว์เซอร์ปฏิเสธคำขอ จึงไม่มีล็อกให้ใช้: ถือว่าฟังได้ ดีกว่าทำให้ฟังไม่ได้เลย
              resolve(true);
              return;
            }
            // ถืออยู่แล้วแท็บอื่นย้ายการฟังไป
            if (held === entry) {
              held = null;
              onLost();
            }
          }
        );
    });
  }

  return {
    acquire: ({ steal, onLost }) =>
      enqueue(async () => {
        if (held || !locks) return true;
        return request(locks, steal, onLost);
      }),
    release: () => {
      void enqueue(async () => {
        const current = held;
        if (!current) return;
        held = null;
        current.release();
        await current.released;
      });
    }
  };
}

/** ล็อกการฟังของแท็บนี้ */
export const listeningLock: ListeningLock = createListeningLock(
  typeof navigator !== "undefined" && "locks" in navigator ? (navigator.locks as unknown as LockManagerLike) : null
);
