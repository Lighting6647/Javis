import { Capacitor } from "@capacitor/core";
import { type RefObject, useEffect, useState } from "react";
import { isDesktopApp } from "../browser/browserStore";
import { browserMeterDeps, canMeterMicrophone, createMicMeter, type MicMeter } from "../speech/micMeter";

/** ความสูงของแท่งตอนเงียบ ใกล้กับตอนที่ยังไม่ได้วัด เพื่อไม่ให้วงกระตุกตอนเริ่มมีข้อมูล */
const REST_SCALE = 0.22;
const REST_OPACITY = 0.45;

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

/** สร้างตัววัดเมื่ออุปกรณ์นี้วัดได้ คืน null ถ้าไม่ควรวัด (วงคลื่นเสียงจะขยับตามจังหวะแทน) */
function createMeter(): MicMeter | null {
  return micLevelsAvailable() ? createMicMeter(browserMeterDeps()) : null;
}

/**
 * ทำให้แท่งของวงคลื่นเสียงขยับตามเสียงไมโครโฟนจริงระหว่างที่ Javis กำลังฟัง
 * เขียนลงองค์ประกอบโดยตรงทุกเฟรม ไม่ผ่านสถานะของ React เพราะมี 60 แท่งที่เปลี่ยนทุกเฟรม
 * ถ้าวัดไม่ได้ จะไม่แตะอะไรเลย วงคลื่นเสียงจึงขยับตามจังหวะด้วย CSS เหมือนเดิม
 * เบราว์เซอร์หยุดเรียกทุกเฟรมเองเมื่อแท็บไม่ได้อยู่หน้าจอ จึงไม่กินแบตตอนผู้ใช้ไม่ได้ดู
 * @param bars กลุ่มของแท่งใน SVG
 * @param metering ควรวัดอยู่ไหม: กำลังฟัง และแผงสถานะกำลังแสดงอยู่
 */
export function useMicBars(bars: RefObject<SVGGElement | null>, metering: boolean): void {
  const [meter] = useState(createMeter);

  useEffect(() => {
    const group = bars.current;
    if (!meter || !metering || !group) return;

    const rects = [...group.querySelectorAll<SVGRectElement>("rect")];
    const levels = new Float32Array(rects.length);
    let frame = 0;
    let live = false;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (!meter.read(levels)) return;

      if (!live) {
        // มีค่าที่วัดได้จริงแล้ว: ปิดการขยับตามจังหวะของ CSS เพื่อให้ค่าที่วัดมีผล
        live = true;
        group.classList.add("live");
      }
      rects.forEach((rect, index) => {
        const level = levels[index] ?? 0;
        rect.style.transform = `scaleY(${(REST_SCALE + (1 - REST_SCALE) * level).toFixed(3)})`;
        rect.style.opacity = (REST_OPACITY + (1 - REST_OPACITY) * level).toFixed(3);
      });
    };

    void meter.start();
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      meter.stop();
      group.classList.remove("live");
      for (const rect of rects) {
        rect.style.transform = "";
        rect.style.opacity = "";
      }
    };
  }, [bars, meter, metering]);
}
