import { describe, expect, it } from "vitest";
import { describeLinkStatus, needsPopupHelp } from "./pageLink";
import type { PageLink } from "./types";

const link = (state: Partial<PageLink>): PageLink => ({
  title: "Pantip",
  url: "https://pantip.com/",
  opened: false,
  blocked: false,
  inPlace: false,
  ...state
});

describe("describeLinkStatus", () => {
  it.each([
    ["เปิดในแท็บใหม่แล้ว", link({ opened: true }), "เปิดให้แล้ว แตะเพื่อเปิดอีกครั้ง"],
    ["กำลังจะพาแท็บนี้ไป", link({ inPlace: true }), "กำลังเปิดในแท็บนี้"],
    ["พาแท็บนี้ไปแล้ว และผู้ใช้กลับมา", link({ inPlace: true, opened: true }), "เปิดในแท็บนี้แล้ว แตะเพื่อเปิดอีกครั้ง"],
    ["ถูกบล็อกและพาแท็บนี้ไปไม่ได้", link({ blocked: true }), "เบราว์เซอร์บล็อกแท็บใหม่ แตะเพื่อเปิด"],
    ["ลิงก์ที่ตั้งใจให้ผู้ใช้แตะเอง", link({}), "แตะเพื่อเปิดหน้าเว็บ"]
  ])("%s", (_name, state, text) => {
    expect(describeLinkStatus(state)).toBe(text);
  });
});

describe("needsPopupHelp", () => {
  it("แนะนำวิธีอนุญาตแท็บใหม่ เมื่อเบราว์เซอร์บล็อกจนต้องแตะเอง หรือจนต้องเปิดในแท็บนี้แทน", () => {
    expect(needsPopupHelp(link({ blocked: true }))).toBe(true);
    expect(needsPopupHelp(link({ inPlace: true, opened: true }))).toBe(true);
  });

  it("ไม่แนะนำเมื่อเปิดแท็บใหม่ได้อยู่แล้ว เมื่อเป็นลิงก์ที่ให้แตะเอง หรือระหว่างที่กำลังจะออกจากหน้า", () => {
    expect(needsPopupHelp(link({ opened: true }))).toBe(false);
    expect(needsPopupHelp(link({}))).toBe(false);
    // อีกอึดใจเดียวหน้านี้จะถูกแทนที่ คำแนะนำที่โผล่มาแวบเดียวอ่านไม่ทันและทำให้จอกระตุก
    expect(needsPopupHelp(link({ inPlace: true }))).toBe(false);
  });
});
