import { useCallback, useEffect, useState } from "react";

/** เหตุการณ์ที่เบราว์เซอร์ส่งมาเมื่อเว็บนี้ติดตั้งเป็นแอปได้ (ยังไม่อยู่ในชนิดมาตรฐานของ TypeScript) */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * ให้หน้าจอรู้ว่าติดตั้ง Javis เป็นแอปหน้าต่างของตัวเองได้ไหม และสั่งเปิดหน้าต่างติดตั้งของเบราว์เซอร์
 * canInstall เป็น false บนเบราว์เซอร์ที่ไม่รองรับ หรือเมื่อเปิดจากแอปที่ติดตั้งแล้ว
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // เก็บไว้เรียกเองจากปุ่มในหน้าตั้งค่า แทนแถบแจ้งเตือนของเบราว์เซอร์
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // เบราว์เซอร์ให้ใช้เหตุการณ์นี้ได้ครั้งเดียว
    setPromptEvent(null);
    if (outcome === "accepted") setInstalled(true);
  }, [promptEvent]);

  return { canInstall: promptEvent !== null && !installed, installed, install };
}
