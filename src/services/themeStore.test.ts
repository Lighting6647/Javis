import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, sanitizeTheme, themeStore } from "./themeStore";

describe("sanitizeTheme", () => {
  it("รับธีมที่รู้จัก", () => {
    expect(sanitizeTheme("holo")).toBe("holo");
    expect(sanitizeTheme("plain")).toBe("plain");
  });

  it.each([null, undefined, "", "dark", "HOLO", 3, {}])("ใช้ธีมโฮโลแกรมเมื่อค่าที่เก็บไว้ไม่ถูกต้อง (%j)", (value) => {
    expect(sanitizeTheme(value)).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe("holo");
  });
});

describe("themeStore", () => {
  it("เปลี่ยนธีมแล้วแจ้งผู้ติดตาม และไม่รับค่าที่ไม่รู้จัก", () => {
    let notified = 0;
    const unsubscribe = themeStore.subscribe(() => {
      notified += 1;
    });

    themeStore.set("plain");
    expect(themeStore.get()).toBe("plain");

    themeStore.set("neon" as never);
    expect(themeStore.get()).toBe("holo");
    expect(notified).toBe(2);

    unsubscribe();
    themeStore.set("plain");
    expect(notified).toBe(2);
    themeStore.set("holo");
  });
});
