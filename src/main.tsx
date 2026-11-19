import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { startMemorySync } from "./memory/memorySync";
import { themeStore } from "./services/themeStore";
import "./fonts";
import "./styles.css";
import "./hud.css";

themeStore.init();
// รวมความจำในเครื่องกับบนเซิร์ฟเวอร์ และบันทึกกลับทุกครั้งที่จำหรือลืม (เซิร์ฟเวอร์ไม่ตอบ ความจำในเครื่องยังใช้ได้)
startMemorySync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
