/** ส่วนของระบบล็อกข้ามแท็บของเบราว์เซอร์ (Web Locks) ที่ใช้ แยกไว้เพื่อให้ทดสอบได้ด้วยตัวจำลอง */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<void> | void
  ): Promise<unknown>;
}

/** สิทธิ์ที่มีได้ทีละแท็บ เช่นการเป็นแท็บที่ฟังเสียง */
export interface TabLock {
  /**
   * ขอสิทธิ์ให้แท็บนี้ คืน false เมื่อแท็บอื่นถืออยู่และไม่ได้สั่งให้ย้ายมา
   * @param steal ผู้ใช้สั่งที่แท็บนี้เอง: ย้ายสิทธิ์มาที่แท็บนี้ แม้แท็บอื่นจะถืออยู่
   * @param onLost เรียกเมื่อแท็บอื่นย้ายสิทธิ์ไปจากแท็บนี้
   */
  acquire(options: { steal: boolean; onLost: () => void }): Promise<boolean>;
  /**
   * รอจนไม่มีแท็บใดถือสิทธิ์นี้ (ได้เกือบทันทีถ้าว่างอยู่แล้ว) แล้วถือไว้ให้แท็บนี้ และเรียก onAcquired หนึ่งครั้ง
   * ต่างจากการถามครั้งเดียวตรงที่ไม่พลาดเมื่อแท็บที่ถืออยู่กำลังถูกปิด: เบราว์เซอร์ปล่อยสิทธิ์ของแท็บที่ปิดช้ากว่าที่แท็บใหม่เปิดได้
   * @param onLost เรียกเมื่อแท็บอื่นย้ายสิทธิ์ไปจากแท็บนี้หลังได้มาแล้ว
   * @returns ฟังก์ชันยกเลิกการรอ ซึ่งไม่มีผลเมื่อได้สิทธิ์มาแล้ว (ปล่อยด้วย release)
   */
  waitFor(options: { onAcquired: () => void; onLost: () => void }): () => void;
  release(): void;
}

interface HeldLock {
  release: () => void;
  /** จบเมื่อเบราว์เซอร์ปล่อยล็อกจริงแล้ว */
  released: Promise<void>;
}

/** ระบบล็อกข้ามแท็บของเบราว์เซอร์นี้ หรือ null ถ้าไม่มี */
export function browserLocks(): LockManagerLike | null {
  return typeof navigator !== "undefined" && "locks" in navigator ? (navigator.locks as unknown as LockManagerLike) : null;
}

/**
 * สิทธิ์ที่แท็บของ Javis ถือได้ทีละแท็บ ผ่านระบบล็อกข้ามแท็บของเบราว์เซอร์
 * เบราว์เซอร์ปล่อยล็อกให้เองเมื่อแท็บที่ถืออยู่ถูกปิดหรือพัง จึงไม่มีสิทธิ์ค้างจากแท็บที่ไม่อยู่แล้ว
 * @param locks ระบบล็อกของเบราว์เซอร์ หรือ null ถ้าไม่มี ซึ่งจะถือว่าได้สิทธิ์เสมอ
 * @param name ชื่อของล็อก ล็อกคนละชื่อไม่กันกัน
 */
export function createTabLock(locks: LockManagerLike | null, name: string): TabLock {
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

  /**
   * ขอล็อกจากเบราว์เซอร์หนึ่งครั้ง คืน true เมื่อได้ และ false เมื่อแท็บอื่นถืออยู่ (ขอแบบถ้าว่าง) หรือการรอถูกยกเลิก
   * @param options ถ้าว่าง (ifAvailable) · ย้ายมา (steal) · หรือต่อคิวรอจนว่าง โดยยกเลิกได้ด้วย signal
   */
  function request(
    manager: LockManagerLike,
    options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    onLost: () => void
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let release: () => void = () => undefined;
      const holding = new Promise<void>((finish) => {
        release = finish;
      });
      let entry: HeldLock | null = null;

      const released: Promise<void> = Promise.resolve()
        .then(() =>
          manager.request(name, options, (lock) => {
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
              // ผู้เรียกยกเลิกการรอเอง: ไม่ได้สิทธิ์ นอกนั้นคือเบราว์เซอร์ปฏิเสธคำขอ จึงไม่มีล็อกให้ใช้
              // ซึ่งถือว่าได้สิทธิ์ ดีกว่าทำให้ใช้งานไม่ได้เลย
              resolve(!options.signal?.aborted);
              return;
            }
            // ถืออยู่แล้วแท็บอื่นย้ายสิทธิ์ไป
            if (held === entry) {
              held = null;
              onLost();
            }
          }
        );
    });
  }

  const release = (): void => {
    void enqueue(async () => {
      const current = held;
      if (!current) return;
      held = null;
      current.release();
      await current.released;
    });
  };

  return {
    acquire: ({ steal, onLost }) =>
      enqueue(async () => {
        if (held || !locks) return true;
        return request(locks, steal ? { steal: true } : { ifAvailable: true }, onLost);
      }),
    waitFor: ({ onAcquired, onLost }) => {
      let cancelled = false;
      if (!locks) {
        // ไม่มีระบบล็อก จึงได้สิทธิ์เสมอ แต่ยังเรียกทีหลังเหมือนกรณีอื่น เพื่อให้ผู้เรียกยกเลิกทัน
        queueMicrotask(() => {
          if (!cancelled) onAcquired();
        });
        return () => {
          cancelled = true;
        };
      }

      // ไม่เข้าคิวของการขอและปล่อย เพราะการรออาจนานเป็นชั่วโมง และต้องไม่ขวางคำสั่งอื่น
      const waiting = new AbortController();
      void request(locks, { signal: waiting.signal }, onLost).then((mine) => {
        if (!mine) return;
        // ได้สิทธิ์มาในจังหวะเดียวกับที่ผู้เรียกยกเลิก: ไม่มีใครใช้ จึงปล่อยคืน ไม่ให้ค้าง
        if (cancelled) release();
        else onAcquired();
      });
      return () => {
        cancelled = true;
        waiting.abort();
      };
    },
    release
  };
}
