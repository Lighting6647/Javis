/** เวลาที่เผื่อให้เบราว์เซอร์เริ่มบันทึกไฟล์ ก่อนคืนหน่วยความจำของไฟล์นั้น */
const RELEASE_AFTER_MS = 10_000;

/**
 * ให้ผู้ใช้บันทึกข้อความเป็นไฟล์ลงเครื่อง ต้องเรียกจากจังหวะที่ผู้ใช้กดปุ่ม
 * ไฟล์สร้างในเบราว์เซอร์ของผู้ใช้เอง ไม่ได้ส่งเนื้อหาไปที่ใด
 */
export function downloadTextFile(name: string, text: string): void {
  // นำหน้าด้วยเครื่องหมาย UTF-8 เพื่อให้โปรแกรมบน Windows รุ่นเก่าแสดงภาษาไทยถูก
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), RELEASE_AFTER_MS);
}
