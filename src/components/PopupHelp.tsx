import { Capacitor } from "@capacitor/core";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { hasSeenPopupHelp, markPopupHelpSeen, popupHelpFor } from "../services/popupHelp";

/**
 * คำแนะนำใต้ลิงก์ที่เบราว์เซอร์ไม่ยอมเปิดให้: วิธีอนุญาตให้เว็บนี้เปิดแท็บใหม่เอง
 * ตั้งครั้งเดียวแล้วคำสั่งเสียงครั้งต่อไปจะเปิดหน้าเว็บได้ทันที
 * ครั้งแรกในอุปกรณ์นี้กางขั้นตอนให้เห็นเลย ครั้งถัดไปพับไว้
 */
export function PopupHelp() {
  const [help] = useState(() => popupHelpFor(navigator.userAgent));
  const [openAtFirst] = useState(() => !hasSeenPopupHelp());

  useEffect(() => {
    markPopupHelpSeen();
  }, []);

  // แอปมือถือเปิดหน้าเว็บด้วยเบราว์เซอร์ของระบบ ไม่มีการตั้งค่าป๊อปอัปให้ผู้ใช้แก้
  if (Capacitor.isNativePlatform()) return null;

  return (
    <details className="popup-help" open={openAtFirst}>
      <summary>
        ให้ Javis เปิดแท็บใหม่เองทุกครั้ง
        <ChevronDown size={14} aria-hidden />
      </summary>
      <div className="popup-help-body">
        <span>ตั้งครั้งเดียวใน {help.browser} ครั้งต่อไปสั่งด้วยเสียงแล้วหน้าเว็บจะเปิดเองทันที</span>
        <ol>
          {help.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </details>
  );
}
