import { useState, useSyncExternalStore } from "react";
import { GESTURE_GUIDE } from "../../services/gestureLabel";
import { gestureHintStore } from "../../services/gestureHintStore";
import { handFrameStore } from "../../services/handFrameStore";

const GUIDE_KEY = "luna.gestureGuide";

const subscribe = (listener: () => void) => {
  const offFrame = handFrameStore.subscribe(listener);
  const offHint = gestureHintStore.subscribe(listener);
  return () => {
    offFrame();
    offHint();
  };
};
// คืนข้อความ (เทียบค่าได้) React จึงวาดใหม่เฉพาะตอนป้ายเปลี่ยน ไม่ใช่ทุกเฟรม
const currentLabel = () => gestureHintStore.get() ?? handFrameStore.get()?.label ?? "";

function readGuideOpen(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * แถบบอกท่ามือบน HUD (ตำแหน่งคงที่ อ่านง่ายกว่าป้ายที่ลอยตามมือ) และตารางท่ามือทั้งหมดที่เปิด/ปิดได้
 */
export function GestureHints() {
  const label = useSyncExternalStore(subscribe, currentLabel);
  const [guideOpen, setGuideOpen] = useState(readGuideOpen);

  const toggleGuide = () => {
    setGuideOpen((open) => {
      try {
        localStorage.setItem(GUIDE_KEY, open ? "0" : "1");
      } catch {
        // เก็บค่าไม่ได้ (โหมดส่วนตัว) ก็ยังใช้ได้ในรอบนี้
      }
      return !open;
    });
  };

  return (
    <div className="gesture-hints">
      {guideOpen && (
        <section className="gesture-guide" aria-label="ท่ามือทั้งหมด">
          <h2>ท่ามือที่ลูน่าเข้าใจ</h2>
          <dl>
            {GESTURE_GUIDE.map((row) => (
              <div key={row.gesture}>
                <dt>{row.gesture}</dt>
                <dd>{row.action}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <div className="gesture-hints-bar">
        <p className={`gesture-hint-line${label ? "" : " idle"}`} role="status" aria-live="polite">
          {label || "ทำท่ามือหน้ากล้องได้เลย"}
        </p>
        <button type="button" className="gesture-guide-toggle" onClick={toggleGuide} aria-expanded={guideOpen}>
          {guideOpen ? "ซ่อนท่ามือ" : "ดูท่ามือ"}
        </button>
      </div>
    </div>
  );
}
