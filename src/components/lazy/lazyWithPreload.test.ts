import { createElement, Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { lazyWithPreload } from "./lazyWithPreload";

const Greeting = ({ name }: { name: string }) => createElement("p", null, `สวัสดี ${name}`);

const render = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(Suspense, { fallback: createElement("i", null, "กำลังโหลด") }, element));

describe("lazyWithPreload", () => {
  it("ยังไม่โหลดไฟล์จนกว่าจะถูกขอ", () => {
    const load = vi.fn().mockResolvedValue(Greeting);
    lazyWithPreload(load, "Greeting");
    expect(load).not.toHaveBeenCalled();
  });

  it("ระหว่างที่ไฟล์ยังโหลดไม่เสร็จ แสดงสิ่งที่ Suspense ให้ไว้", () => {
    const View = lazyWithPreload(() => new Promise<typeof Greeting>(() => undefined), "Greeting");
    expect(render(createElement(View, { name: "คุณไลท์" }))).toBe("<i>กำลังโหลด</i>");
  });

  it("โหลดล่วงหน้าเสร็จแล้วแสดงได้ทันทีโดยไม่ผ่านหน้ารอ", async () => {
    const View = lazyWithPreload(async () => Greeting, "Greeting");
    await View.preload();
    expect(render(createElement(View, { name: "คุณไลท์" }))).toBe("<p>สวัสดี คุณไลท์</p>");
  });

  it("preload ซ้ำหลายครั้งโหลดไฟล์ครั้งเดียว", async () => {
    const load = vi.fn().mockResolvedValue(Greeting);
    const View = lazyWithPreload(load, "Greeting");
    await Promise.all([View.preload(), View.preload()]);
    await View.preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("โหลดไม่สำเร็จแล้วลองใหม่ได้ ไม่จำความล้มเหลวไว้", async () => {
    const load = vi.fn<() => Promise<typeof Greeting>>().mockRejectedValueOnce(new Error("chunk 404")).mockResolvedValueOnce(Greeting);
    const View = lazyWithPreload(load, "Greeting");
    await expect(View.preload()).rejects.toThrow("chunk 404");
    await View.preload();
    expect(load).toHaveBeenCalledTimes(2);
    expect(render(createElement(View, { name: "อีกครั้ง" }))).toBe("<p>สวัสดี อีกครั้ง</p>");
  });

  it("ตั้งชื่อให้เห็นในเครื่องมือของ React", () => {
    expect(lazyWithPreload(async () => Greeting, "Greeting").displayName).toBe("Greeting");
  });
});
