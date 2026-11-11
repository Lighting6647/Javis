// ทำงานก่อนหน้าเว็บ Javis โหลด: บอกหน้าเว็บว่ากำลังรันในแอปเดสก์ท็อป
// เปิดเผยเฉพาะข้อมูลอ่านอย่างเดียว ไม่ให้หน้าเว็บเข้าถึง Node หรือระบบไฟล์
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("javisDesktop", {
  isDesktop: true,
  platform: process.platform
});
