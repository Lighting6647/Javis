import { describe, expect, it } from "vitest";
import { createFlagStore, readFlagChoice } from "./flagStore";

/** ที่เก็บจำลองของเบราว์เซอร์ */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    }
  };
}

describe("readFlagChoice", () => {
  it("ผู้ใช้ปิดไว้: ปิด", () => {
    expect(readFlagChoice("off")).toBe(false);
  });

  it.each(["on", null, undefined, "", "OFF", 0, false, {}])("ค่าอื่นหรือยังไม่เคยเลือก (%j): เปิด ซึ่งเป็นค่าเริ่มต้น", (value) => {
    expect(readFlagChoice(value)).toBe(true);
  });
});

describe("createFlagStore", () => {
  it("ยังไม่เคยเลือก: เปิด", () => {
    expect(createFlagStore("javis.test", fakeStorage()).get()).toBe(true);
  });

  it("อ่านค่าที่ผู้ใช้เคยปิดไว้กลับมา", () => {
    expect(createFlagStore("javis.test", fakeStorage({ "javis.test": "off" })).get()).toBe(false);
  });

  it("เปลี่ยนค่าแล้วเก็บลงเครื่องด้วยชื่อของตัวเอง และแจ้งผู้ติดตาม", () => {
    const storage = fakeStorage();
    const store = createFlagStore("javis.test", storage);
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    store.set(false);
    expect(store.get()).toBe(false);
    expect(storage.items.get("javis.test")).toBe("off");

    store.set(true);
    expect(storage.items.get("javis.test")).toBe("on");
    expect(notified).toBe(2);

    unsubscribe();
    store.set(false);
    expect(notified).toBe(2);
  });

  it("ที่เก็บของเบราว์เซอร์ใช้ไม่ได้: ค่ายังมีผลจนกว่าจะปิดหน้า และไม่ล้ม", () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: (): void => {
        throw new Error("blocked");
      }
    };
    const store = createFlagStore("javis.test", broken);

    expect(store.get()).toBe(true);
    expect(() => store.set(false)).not.toThrow();
    expect(store.get()).toBe(false);
  });
});
