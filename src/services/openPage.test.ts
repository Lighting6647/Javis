import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalPage } from "./openPage";

const URL_WITH_HIGHLIGHT = "https://www.goldtraders.or.th/#:~:text=62%2C350";

/** จำลองเบราว์เซอร์: มีการแตะของผู้ใช้ค้างอยู่หรือไม่ และ window.open คืนอะไร */
function browser(options: { active?: boolean; opens: () => unknown }) {
  const open = vi.fn(options.opens);
  vi.stubGlobal("window", { open });
  vi.stubGlobal("navigator", options.active === undefined ? {} : { userActivation: { isActive: options.active } });
  return open;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openExternalPage", () => {
  it("ไม่มีการแตะของผู้ใช้ (คำสั่งเสียง): เปิดแบบที่ตรวจได้ว่าสำเร็จ แล้วตัดการเชื่อมกลับมายังแอป", () => {
    const tab = { opener: {} as unknown };
    const open = browser({ active: false, opens: () => tab });

    expect(openExternalPage(URL_WITH_HIGHLIGHT)).toBe(true);
    expect(open).toHaveBeenCalledWith(URL_WITH_HIGHLIGHT, "_blank");
    expect(tab.opener).toBeNull();
  });

  it("ไม่มีการแตะของผู้ใช้ และเบราว์เซอร์บล็อกแท็บใหม่: บอกว่าเปิดไม่ได้ ให้แอปแสดงปุ่มให้แตะ", () => {
    const open = browser({ active: false, opens: () => null });

    expect(openExternalPage(URL_WITH_HIGHLIGHT)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("ยังมีการแตะของผู้ใช้ค้างอยู่ (พิมพ์สั่งแล้วได้คำตอบเร็ว): เปิดแบบตัดการเชื่อมตั้งแต่ต้น ซึ่งเป็นเงื่อนไขที่เบราว์เซอร์จะไฮไลต์ข้อความให้", () => {
    // เปิดแบบ noopener แล้ว window.open คืน null เสมอแม้เปิดสำเร็จ จึงใช้เฉพาะตอนที่รู้ว่าเบราว์เซอร์ยอมเปิดแน่
    const open = browser({ active: true, opens: () => null });

    expect(openExternalPage(URL_WITH_HIGHLIGHT)).toBe(true);
    expect(open).toHaveBeenCalledWith(URL_WITH_HIGHLIGHT, "_blank", "noopener,noreferrer");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("เบราว์เซอร์รุ่นเก่าที่บอกไม่ได้ว่ามีการแตะค้างอยู่ไหม: เปิดแบบที่ตรวจได้", () => {
    const open = browser({ opens: () => ({ opener: {} }) });

    expect(openExternalPage("https://example.com/")).toBe(true);
    expect(open).toHaveBeenCalledWith("https://example.com/", "_blank");
  });

  it.each(["javascript:alert(1)", "not a url", ""])("ลิงก์ที่ไม่ปลอดภัย (%j): ไม่เปิด", (url) => {
    const open = browser({ active: true, opens: () => ({}) });

    expect(openExternalPage(url)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("เบราว์เซอร์โยนข้อผิดพลาดตอนเปิด: ถือว่าเปิดไม่ได้ ไม่ทำให้แอปล้ม", () => {
    browser({
      active: false,
      opens: () => {
        throw new Error("blocked by policy");
      }
    });

    expect(openExternalPage("https://example.com/")).toBe(false);
  });
});
