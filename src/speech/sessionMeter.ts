import { Capacitor } from "@capacitor/core";
import { isDesktopApp } from "../browser/browserStore";
import { micLevelStore } from "../services/micLevelStore";
import { themeStore } from "../services/themeStore";
import { browserMeterDeps, canMeterMicrophone, createMicMeter, type MicMeter } from "./micMeter";

/** อุปกรณ์และเบราว์เซอร์นี้วัดระดับเสียงไมโครโฟนให้วงคลื่นเสียงได้ไหม (ใช้ซ่อนตัวเลือกในหน้าตั้งค่าเมื่อวัดไม่ได้ด้วย) */
export function micLevelsAvailable(): boolean {
  const supported =
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof navigator.permissions?.query === "function" &&
    typeof AudioContext === "function";

  return canMeterMicrophone({
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints,
    mediaDevices: supported,
    native: Capacitor.isNativePlatform(),
    desktopApp: isDesktopApp(),
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  });
}

let meter: MicMeter | null | undefined;

/**
 * ตัววัดเสียงไมโครโฟนของแท็บนี้ ใช้ร่วมกันทั้งแอป หรือ null ถ้าอุปกรณ์นี้ไม่ควรวัด
 * ไมโครโฟนเส้นที่วัดเปิดไว้ตลอดช่วงที่ Javis ฟังอยู่ (ดู src/hooks/useHandsFree.ts) ไม่ใช่แค่ตอนวาดวงคลื่นเสียง
 * เพราะหน้าที่กำลังเปิดไมโครโฟนอยู่ เบราว์เซอร์ยอมให้พูดตอบได้โดยผู้ใช้ไม่ต้องแตะหน้าจอก่อน (วัดใน Chrome 157)
 */
export function getSessionMeter(): MicMeter | null {
  if (meter === undefined) meter = micLevelsAvailable() ? createMicMeter(browserMeterDeps()) : null;
  return meter;
}

/** ควรเปิดไมโครโฟนเส้นที่ใช้วัดเสียงไว้ระหว่างฟังไหม: เฉพาะธีมที่มีวงคลื่นเสียง และผู้ใช้ไม่ได้ปิดตัวเลือกไว้ */
export function sessionMeterWanted(): boolean {
  return themeStore.get() === "holo" && micLevelStore.get();
}

/** สถานะสิทธิ์ไมโครโฟนของเว็บนี้ โดยไม่ทำให้เบราว์เซอร์ถามผู้ใช้ หรือ null ถ้าเบราว์เซอร์ไม่บอก */
export async function queryMicrophonePermission(): Promise<PermissionStatus | null> {
  try {
    return await navigator.permissions.query({ name: "microphone" as PermissionName });
  } catch {
    return null;
  }
}
