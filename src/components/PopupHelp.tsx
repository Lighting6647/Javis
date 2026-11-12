import { Capacitor } from "@capacitor/core";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { hasSeenPopupHelp, markPopupHelpSeen, popupHelpFor } from "../services/popupHelp";

/**
 * คำแนะนำใต้ลิงก์ที่เบราว์เซอร์ไม่ยอมเปิดแท็บใหม่ให้: วิธีอนุญาตให้เว็บนี้เปิดแท็บใหม่เอง
 * ถ้าไม่ตั้ง Javis ยังเปิดหน้าเว็บให้ได้โดยพาแท็บนี้ไปแทน แต่ Javis จะหายจากจอจนกว่าผู้ใช้จะกดย้อนกลับ
 * ตั้งครั้งเดียวแล้วหน้าเว็บจะเปิดในแท็บใหม่ โดย Javis ยังอยู่ที่เดิมและฟังคำสั่งต่อได้
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
        <span>ตั้งครั้งเดียวใน {help.browser} แล้วหน้าเว็บจะเปิดในแท็บใหม่ โดย Javis ยังอยู่ที่แท็บนี้และฟังคำสั่งต่อได้</span>
        <ol>
          {help.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </details>
  );
}
