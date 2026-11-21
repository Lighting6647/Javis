/**
 * การตัดสินว่าหน้าที่สั่งเปิดจะแสดงในกรอบของ Javis ได้ไหม และการเปิดแยกอัตโนมัติเมื่อแสดงไม่ได้
 * แยกออกจาก src/components/FrameView.tsx เพื่อให้ทดสอบได้โดยไม่ต้องวาดหน้าจอ
 */

/**
 * แปลงลิงก์ของบริการยอดนิยมที่บล็อก iframe ปกติ (เช่น Google Maps, YouTube)
 * ให้เป็นรูปแบบ embed ที่เปิดแสดงภายใน LUNA ได้โดยไม่ขึ้น refused to connect
 */
export function toEmbeddableFrameUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    if (host === "maps.google.com" || ((host === "www.google.com" || host === "google.com") && parsed.pathname.startsWith("/maps"))) {
      if (parsed.searchParams.get("output") === "embed") return rawUrl;
      const searchMatch = parsed.pathname.match(/\/maps\/(?:search|place)\/([^/]+)/);
      const query =
        parsed.searchParams.get("q") ||
        parsed.searchParams.get("destination") ||
        (searchMatch ? decodeURIComponent(searchMatch[1] ?? "").replace(/\+/g, " ") : "Thailand");
      return `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(query)}`;
    }

    if ((host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") && parsed.pathname === "/watch") {
      const videoId = parsed.searchParams.get("v");
      if (videoId) return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
    }

    if ((host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") && parsed.pathname.startsWith("/shorts/")) {
      const videoId = parsed.pathname.split("/")[2];
      if (videoId) return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
    }

    if ((host === "www.youtube.com" || host === "youtube.com") && parsed.pathname === "/playlist") {
      const listId = parsed.searchParams.get("list");
      if (listId) return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}`;
    }

    if (host === "youtu.be" && parsed.pathname.length > 1) {
      const videoId = parsed.pathname.slice(1).split("/")[0];
      if (videoId) return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;
    }
  } catch {
    return rawUrl;
  }
  return rawUrl;
}

/** เว็บยอดนิยมที่บล็อกการฝังใน iframe ด้วย X-Frame-Options: SAMEORIGIN หากไม่ใช่ URL แบบ embed */
export function isKnownFrameBlocked(frameSrc: string): boolean {
  if (!frameSrc) return false;
  try {
    const parsed = new URL(frameSrc);
    const host = parsed.hostname.toLowerCase();
    if ((host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") && !parsed.pathname.startsWith("/embed/")) {
      return true;
    }
    if ((host === "www.google.com" || host === "google.com") && parsed.searchParams.get("output") !== "embed") {
      return true;
    }
    if (host === "mail.google.com" || host === "calendar.google.com" || host === "line.me" || host === "open.spotify.com") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * ผลการเปิดหน้าแยกอัตโนมัติของคำสั่งหนึ่งครั้ง
 * - opened: เปิดแท็บหรือหน้าต่างใหม่ให้แล้ว
 * - blocked: เบราว์เซอร์กันหน้าต่างเด้ง (ไม่ได้มาจากการกดของผู้ใช้) ผู้ใช้ต้องกดปุ่มเปิดเอง
 */
export type AutoOpenStatus = "opened" | "blocked";

/** ตัวเปิดหน้าแยกอัตโนมัติ: เก็บผลของคำสั่งล่าสุดไว้ให้หน้าจออ่านด้วย useSyncExternalStore */
export interface ExternalAutoOpener {
  /** ลองเปิดหน้าของคำสั่งนี้ คืนผล หรือ null ถ้าคำสั่งนี้ลองไปแล้ว (หรือไม่มีที่อยู่) */
  attempt(requestId: number, url: string): AutoOpenStatus | null;
  /** ผลของคำสั่งนั้น หรือ null ถ้ายังไม่ได้ลอง */
  statusOf(requestId: number): AutoOpenStatus | null;
  subscribe(listener: () => void): () => void;
}

/**
 * ตัวเปิดหน้าแยกอัตโนมัติที่เปิดได้ครั้งเดียวต่อหนึ่งคำสั่ง (requestId) ไม่ว่าหน้าจอจะถูกวาดใหม่กี่ครั้ง
 * จึงไม่วนเปิดซ้ำ และไม่ลองใหม่เองเมื่อถูกกัน: ครั้งถัดไปต้องมาจากผู้ใช้กดปุ่ม
 * @param open เปิดหน้าในแท็บใหม่ คืน false ถ้าเปิดไม่ได้ (เช่นถูกกันหน้าต่างเด้ง)
 */
export function createExternalAutoOpener(open: (url: string) => boolean): ExternalAutoOpener {
  let last: { requestId: number; status: AutoOpenStatus } | null = null;
  const listeners = new Set<() => void>();

  const tryOpen = (url: string): boolean => {
    try {
      return open(url);
    } catch {
      return false;
    }
  };

  return {
    attempt(requestId, url) {
      if (!url || last?.requestId === requestId) return null;
      last = { requestId, status: tryOpen(url) ? "opened" : "blocked" };
      listeners.forEach((listener) => listener());
      return last.status;
    },
    statusOf: (requestId) => (last?.requestId === requestId ? last.status : null),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
