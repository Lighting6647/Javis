// ทำงานก่อนหน้าเว็บ Javis โหลด: บอกหน้าเว็บว่ากำลังรันในแอปเดสก์ท็อป
// เปิดเผยเฉพาะข้อมูลอ่านอย่างเดียวและช่องเปิดโปรแกรมที่ผ่าน Allowlist เท่านั้น ไม่ให้หน้าเว็บเข้าถึง Node หรือระบบไฟล์
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("javisDesktop", {
  isDesktop: true,
  platform: process.platform,
  launchApp: (appId, customPath) =>
    ipcRenderer.invoke("javis:launch-app", String(appId || ""), typeof customPath === "string" ? customPath : undefined),
  pickAppFile: () => ipcRenderer.invoke("javis:pick-app-file"),
  notify: (title, body) => ipcRenderer.invoke("javis:notify", String(title || ""), String(body || "")),
  onHotkeyListen: (callback) => {
    if (typeof callback !== "function") return () => undefined;
    const listener = () => callback();
    ipcRenderer.on("javis:hotkey-listen", listener);
    return () => ipcRenderer.removeListener("javis:hotkey-listen", listener);
  }
});
