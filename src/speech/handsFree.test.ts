import { describe, expect, it } from "vitest";
import { isHandheld } from "./device";
import { canListenHandsFree } from "./handsFree";

const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/157.0.0.0`;
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

describe("isHandheld", () => {
  it.each([
    ["Chrome บน Android", CHROME_ANDROID, 5],
    ["Safari บน iPhone", SAFARI_IPHONE, 5],
    ["Safari บน iPad ซึ่งบอกตัวเองว่าเป็น Mac", SAFARI_MAC, 5]
  ])("%s: เป็นอุปกรณ์พกพา", (_name, userAgent, touchPoints) => {
    expect(isHandheld(userAgent, touchPoints)).toBe(true);
  });

  it.each([
    ["Chrome บน Windows", CHROME_WINDOWS, 0],
    ["โน้ตบุ๊ก Windows จอสัมผัส", CHROME_WINDOWS, 10],
    ["Safari บน Mac ที่ไม่มีจอสัมผัส", SAFARI_MAC, 0]
  ])("%s: ไม่ใช่อุปกรณ์พกพา", (_name, userAgent, touchPoints) => {
    expect(isHandheld(userAgent, touchPoints)).toBe(false);
  });
});

describe("canListenHandsFree", () => {
  const desktopBrowser = { userAgent: CHROME_WINDOWS, touchPoints: 0, recognition: true, native: false, desktopApp: false };

  it.each([
    ["Chrome บนคอมพิวเตอร์", {}],
    ["Edge บนคอมพิวเตอร์", { userAgent: EDGE_WINDOWS }],
    ["Safari บน Mac", { userAgent: SAFARI_MAC }],
    ["โน้ตบุ๊ก Windows จอสัมผัส", { touchPoints: 10 }]
  ])("%s: ฟังตลอดเวลาได้", (_name, env) => {
    expect(canListenHandsFree({ ...desktopBrowser, ...env })).toBe(true);
  });

  it.each([
    ["Chrome บน Android ซึ่งส่งเสียงเตือนทุกครั้งที่เริ่มฟัง", { userAgent: CHROME_ANDROID, touchPoints: 5 }],
    ["Safari บน iPhone ซึ่งต้องแตะก่อนเริ่มฟังทุกครั้ง", { userAgent: SAFARI_IPHONE, touchPoints: 5 }],
    ["Safari บน iPad", { userAgent: SAFARI_MAC, touchPoints: 5 }]
  ])("%s: ไม่ได้ ยังใช้ปุ่มไมโครโฟนตามเดิม", (_name, env) => {
    expect(canListenHandsFree({ ...desktopBrowser, ...env })).toBe(false);
  });

  it.each([
    ["เบราว์เซอร์ที่ไม่มีระบบรู้จำเสียง (เช่น Firefox)", { recognition: false }],
    ["แอปมือถือ", { native: true }],
    ["แอปเดสก์ท็อป ซึ่งทุกเสียงที่อัดต้องส่งไปแปลงเป็นข้อความและมีค่าใช้จ่าย", { desktopApp: true }]
  ])("%s: ไม่ได้", (_name, env) => {
    expect(canListenHandsFree({ ...desktopBrowser, ...env })).toBe(false);
  });
});
