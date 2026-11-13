/**
 * อุปกรณ์พกพา (มือถือหรือแท็บเล็ต) ดูจากสิ่งที่เบราว์เซอร์บอก
 * iPad บอกตัวเองว่าเป็น Mac จึงแยกด้วยจำนวนจุดสัมผัส ส่วนโน้ตบุ๊ก Windows จอสัมผัสไม่นับเป็นอุปกรณ์พกพา
 */
export function isHandheld(userAgent: string, touchPoints: number): boolean {
  if (/Android|iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && touchPoints > 1;
}
