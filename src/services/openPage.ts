import { safeHttpUrl } from "../conversation/richText";

/**
 * เปิดหน้าเว็บในแท็บใหม่หรือเบราว์เซอร์ของระบบ คืน false ถ้าเปิดไม่ได้
 * (เช่นถูกตัวกันป๊อปอัปของเบราว์เซอร์บล็อก) ซึ่งผู้ใช้ยังกดลิงก์ในบทสนทนาเองได้
 */
export function openExternalPage(url: string): boolean {
  const safe = safeHttpUrl(url);
  if (!safe) return false;

  try {
    // ไม่ใส่ noopener ในตัวเลือก เพราะจะทำให้ตรวจไม่ได้ว่าเปิดสำเร็จหรือไม่ จึงตัดการเชื่อมกลับเองทีหลัง
    const opened = window.open(safe, "_blank");
    if (!opened) return false;
    opened.opener = null;
    return true;
  } catch {
    return false;
  }
}
