import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { startMeetingSync } from "./meeting/meetingSync";
import { startMemorySync } from "./memory/memorySync";
import { themeStore } from "./services/themeStore";
import "./fonts";
import "./styles.css";
import "./hud.css";

themeStore.init();
// รวมความจำในเครื่องกับบนเซิร์ฟเวอร์ และบันทึกกลับทุกครั้งที่จำหรือลืม (เซิร์ฟเวอร์ไม่ตอบ ความจำในเครื่องยังใช้ได้)
startMemorySync();
// ประวัติสรุปการประชุมซิงก์แบบเดียวกัน ให้เห็นประวัติของตัวเองบนอุปกรณ์อื่น
startMeetingSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
