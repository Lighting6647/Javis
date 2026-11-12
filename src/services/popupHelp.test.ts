import { describe, expect, it } from "vitest";
import { hasSeenPopupHelp, markPopupHelpSeen, popupHelpFor } from "./popupHelp";

const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/142.0.0.0`;
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const FIREFOX_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0";

describe("popupHelpFor", () => {
  it.each([
    ["Chrome บนคอมพิวเตอร์", CHROME_WINDOWS, "Chrome", "Always allow pop-ups and redirects"],
    ["Edge บนคอมพิวเตอร์", EDGE_WINDOWS, "Edge", "Always allow pop-ups and redirects"],
    ["Chrome บน Android", CHROME_ANDROID, "Chrome บน Android", "Pop-ups and redirects"],
    ["Safari บน iPhone", SAFARI_IPHONE, "iPhone และ iPad", "Block Pop-ups"],
    ["Chrome บน iPhone ซึ่งใช้การตั้งค่าของตัวเอง", CHROME_IPHONE, "iPhone และ iPad", "Block Pop-ups"],
    ["Safari บน Mac", SAFARI_MAC, "Safari", "Pop-up Windows"],
    ["Firefox", FIREFOX_WINDOWS, "Firefox", "Allow pop-ups for this site"]
  ])("%s: บอกขั้นตอนของเบราว์เซอร์นั้น", (_name, userAgent, browser, label) => {
    const help = popupHelpFor(userAgent);

    expect(help.browser).toBe(browser);
    expect(help.steps.join(" ")).toContain(label);
  });

  it("เบราว์เซอร์ที่ไม่รู้จัก: บอกขั้นตอนทั่วไป แทนการเดาชื่อเมนู", () => {
    const help = popupHelpFor("SomeNewBrowser/1.0");

    expect(help.browser).toBe("เบราว์เซอร์นี้");
    expect(help.steps.join(" ")).toContain("ป๊อปอัป");
  });

  it("จำว่าอุปกรณ์นี้เคยเห็นคำแนะนำแล้ว เพื่อกางขั้นตอนให้เห็นเฉพาะครั้งแรก", () => {
    const saved = new Map<string, string>();
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => void saved.set(key, value) };

    expect(hasSeenPopupHelp(storage)).toBe(false);
    markPopupHelpSeen(storage);
    expect(hasSeenPopupHelp(storage)).toBe(true);
    expect([...saved.keys()]).toEqual(["javis.popupHelpSeen"]);
  });

  it("เบราว์เซอร์ที่ปิดการเก็บข้อมูล: ถือว่าเคยเห็นแล้ว ไม่กางคำแนะนำซ้ำทุกครั้ง และไม่ล้ม", () => {
    const refusing = {
      getItem: () => {
        throw new Error("storage is disabled");
      },
      setItem: () => {
        throw new Error("storage is disabled");
      }
    };

    expect(hasSeenPopupHelp(refusing)).toBe(true);
    expect(() => markPopupHelpSeen(refusing)).not.toThrow();
  });

  it("ทุกชุดมีไม่เกินสามขั้น และขั้นสุดท้ายบอกให้สั่งอีกครั้ง เพื่อให้ผู้ใช้เห็นผลทันที", () => {
    for (const userAgent of [CHROME_WINDOWS, EDGE_WINDOWS, CHROME_ANDROID, SAFARI_IPHONE, SAFARI_MAC, FIREFOX_WINDOWS, ""]) {
      const { steps } = popupHelpFor(userAgent);

      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(steps.length).toBeLessThanOrEqual(3);
      expect(steps.at(-1)).toContain("สั่ง Javis อีกครั้ง");
    }
  });
});
