import { safeHttpUrl } from "../conversation/richText";

/**
 * เปิดหน้าเว็บในแท็บใหม่หรือเบราว์เซอร์ของระบบ คืน false ถ้าเปิดไม่ได้
 * (เช่นถูกตัวกันป๊อปอัปของเบราว์เซอร์บล็อก) ซึ่งผู้ใช้ยังกดลิงก์ในบทสนทนาเองได้
 *
 * เบราว์เซอร์จะเลื่อนไปยังข้อความที่ลิงก์ชี้ (text fragment) ก็ต่อเมื่อแท็บใหม่ถูกเปิดแบบ noopener
 * ในจังหวะที่ยังมีการแตะของผู้ใช้ แต่การเปิดแบบ noopener ทำให้ window.open คืน null เสมอ จึงตรวจไม่ได้ว่าถูกบล็อกไหม
 * - ยังมีการแตะของผู้ใช้ค้างอยู่ (พิมพ์สั่งแล้วได้คำตอบเร็ว): เบราว์เซอร์ยอมเปิดแน่ จึงเปิดแบบ noopener ได้ข้อความที่ไฮไลต์
 * - ไม่มีการแตะ (คำสั่งเสียง): เบราว์เซอร์ไม่ไฮไลต์ให้อยู่แล้วไม่ว่าเปิดแบบใด จึงเปิดแบบที่ตรวจได้ว่าถูกบล็อกไหม
 */
export function openExternalPage(url: string): boolean {
  const safe = safeHttpUrl(url);
  if (!safe) return false;

  try {
    if (navigator.userActivation?.isActive) {
      window.open(safe, "_blank", "noopener,noreferrer");
      return true;
    }

    // ไม่ใส่ noopener ในตัวเลือก เพราะจะทำให้ตรวจไม่ได้ว่าเปิดสำเร็จหรือไม่ จึงตัดการเชื่อมกลับเองทีหลัง
    const opened = window.open(safe, "_blank");
    if (!opened) return false;
    opened.opener = null;
    return true;
  } catch {
    return false;
  }
}

/**
 * พาแท็บนี้ไปยังหน้าเว็บนั้น คืน false ถ้าไปไม่ได้ ใช้เมื่อเบราว์เซอร์ไม่ยอมเปิดแท็บใหม่
 * หน้าเว็บพาแท็บของตัวเองไปได้โดยไม่ต้องมีการแตะของผู้ใช้ แม้เพิ่งถูกบล็อกแท็บใหม่ (วัดใน Chrome และ Edge)
 * ผู้เรียกต้องเก็บสิ่งที่อยากให้อยู่ต่อไว้ก่อน เพราะเมื่อผู้ใช้กดย้อนกลับ หน้านี้มักถูกโหลดใหม่ทั้งหน้า
 */
export function leaveToPage(url: string): boolean {
  const safe = safeHttpUrl(url);
  if (!safe) return false;

  try {
    window.location.assign(safe);
    return true;
  } catch {
    return false;
  }
}
