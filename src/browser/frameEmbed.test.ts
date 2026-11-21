import { describe, expect, it, vi } from "vitest";
import { createExternalAutoOpener, isKnownFrameBlocked, toEmbeddableFrameUrl } from "./frameEmbed";

describe("isKnownFrameBlocked / toEmbeddableFrameUrl", () => {
  it("เว็บทั่วไปแสดงในกรอบได้ และไม่ถูกแปลงลิงก์", () => {
    const url = "https://th.wikipedia.org/wiki/กรุงเทพมหานคร";
    expect(toEmbeddableFrameUrl(url)).toBe(url);
    expect(isKnownFrameBlocked(toEmbeddableFrameUrl(url))).toBe(false);
  });

  it("YouTube watch และ Google Maps ถูกแปลงเป็นแบบ embed จึงแสดงในกรอบได้", () => {
    const video = toEmbeddableFrameUrl("https://www.youtube.com/watch?v=abc123");
    expect(video).toBe("https://www.youtube.com/embed/abc123?autoplay=1");
    expect(isKnownFrameBlocked(video)).toBe(false);

    const map = toEmbeddableFrameUrl("https://www.google.com/maps/search/ร้านกาแฟ");
    expect(map.startsWith("https://maps.google.com/maps?output=embed&q=")).toBe(true);
    expect(isKnownFrameBlocked(map)).toBe(false);
  });

  it("หน้าที่เจ้าของเว็บห้ามแสดงในกรอบ", () => {
    for (const url of ["https://www.youtube.com/results?search_query=lofi", "https://www.google.com/search?q=ข่าว", "https://mail.google.com/", "https://open.spotify.com/"]) {
      expect(isKnownFrameBlocked(toEmbeddableFrameUrl(url)), url).toBe(true);
    }
  });

  it("ค่าว่างหรือไม่ใช่ URL: ไม่ถือว่าถูกห้าม", () => {
    expect(isKnownFrameBlocked("")).toBe(false);
    expect(isKnownFrameBlocked("not a url")).toBe(false);
  });
});

describe("createExternalAutoOpener", () => {
  const blockedUrl = "https://www.youtube.com/results?search_query=lofi";

  it("เว็บที่ห้ามแสดงในกรอบ: เปิดแท็บใหม่ให้ครั้งเดียวต่อหนึ่งคำสั่ง แม้หน้าจอวาดใหม่หลายครั้ง", () => {
    const open = vi.fn(() => true);
    const opener = createExternalAutoOpener(open);

    expect(opener.attempt(1, blockedUrl)).toBe("opened");
    expect(opener.attempt(1, blockedUrl)).toBeNull();
    expect(opener.attempt(1, blockedUrl)).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(blockedUrl);
  });

  it("คำสั่งใหม่: เปิดได้อีกครั้ง", () => {
    const open = vi.fn(() => true);
    const opener = createExternalAutoOpener(open);

    opener.attempt(1, blockedUrl);
    expect(opener.attempt(2, blockedUrl)).toBe("opened");
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("เบราว์เซอร์กันหน้าต่างเด้ง: คืน blocked ให้การ์ดแสดงปุ่มเปิดเอง และไม่วนลองใหม่", () => {
    const open = vi.fn(() => false);
    const opener = createExternalAutoOpener(open);

    expect(opener.attempt(1, blockedUrl)).toBe("blocked");
    expect(opener.attempt(1, blockedUrl)).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
    expect(opener.statusOf(1)).toBe("blocked");
  });

  it("หน้าจออ่านผลของคำสั่งปัจจุบันได้ และได้รับแจ้งเมื่อผลเปลี่ยน", () => {
    const opener = createExternalAutoOpener(() => true);
    const listener = vi.fn();
    const stop = opener.subscribe(listener);

    expect(opener.statusOf(1)).toBeNull();
    opener.attempt(1, blockedUrl);
    expect(opener.statusOf(1)).toBe("opened");
    expect(opener.statusOf(2)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    opener.attempt(2, blockedUrl);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("การเปิดโยนข้อผิดพลาด: ถือว่าถูกกัน", () => {
    const opener = createExternalAutoOpener(() => {
      throw new Error("blocked");
    });
    expect(opener.attempt(1, blockedUrl)).toBe("blocked");
  });

  it("ไม่มีที่อยู่: ไม่เปิดอะไร", () => {
    const open = vi.fn(() => true);
    expect(createExternalAutoOpener(open).attempt(1, "")).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});
