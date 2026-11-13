import type { PageLink } from "./types";

/** บอกผู้ใช้ว่าหน้าเว็บเปิดที่ไหนแล้ว หรือต้องแตะเอง และเพราะอะไร */
export function describeLinkStatus(link: PageLink): string {
  if (link.framed) return "แสดงในกรอบแล้ว แตะเพื่อดูอีกครั้ง";
  if (link.inPlace) return link.opened ? "เปิดในแท็บนี้แล้ว แตะเพื่อเปิดอีกครั้ง" : "กำลังเปิดในแท็บนี้";
  if (link.opened) return "เปิดให้แล้ว แตะเพื่อเปิดอีกครั้ง";
  return link.blocked ? "เบราว์เซอร์บล็อกแท็บใหม่ แตะเพื่อเปิด" : "แตะเพื่อเปิดหน้าเว็บ";
}

/**
 * ควรแนะนำวิธีอนุญาตให้เว็บนี้เปิดแท็บใหม่ไว้ใต้ลิงก์ไหม
 * แนะนำเมื่อเบราว์เซอร์บล็อกจนผู้ใช้ต้องแตะเอง หรือจนต้องเปิดในแท็บนี้แทน (ซึ่งทำให้ Javis หายจากจอ)
 * ไม่แนะนำระหว่างที่กำลังจะออกจากหน้า เพราะอ่านไม่ทันและทำให้จอกระตุก
 */
export function needsPopupHelp(link: PageLink): boolean {
  return link.blocked || (link.inPlace && link.opened);
}
