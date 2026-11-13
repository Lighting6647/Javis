import { type RefObject, useEffect } from "react";
import { getSessionMeter } from "../speech/sessionMeter";

/** ความสูงของแท่งตอนเงียบ ใกล้กับตอนที่ยังไม่ได้วัด เพื่อไม่ให้วงกระตุกตอนเริ่มมีข้อมูล */
const REST_SCALE = 0.22;
const REST_OPACITY = 0.45;

/**
 * ทำให้แท่งของวงคลื่นเสียงขยับตามเสียงไมโครโฟนจริงระหว่างที่ Javis กำลังฟัง
 * อ่านจากตัววัดของแท็บ ซึ่งถูกเปิดและปิดตามช่วงที่ Javis ฟังอยู่ (ดู src/hooks/useHandsFree.ts) ตรงนี้วาดอย่างเดียว
 * เขียนลงองค์ประกอบโดยตรงทุกเฟรม ไม่ผ่านสถานะของ React เพราะมี 60 แท่งที่เปลี่ยนทุกเฟรม
 * ถ้ายังวัดไม่ได้ จะไม่แตะอะไรเลย วงคลื่นเสียงจึงขยับตามจังหวะด้วย CSS เหมือนเดิม
 * เบราว์เซอร์หยุดเรียกทุกเฟรมเองเมื่อแท็บไม่ได้อยู่หน้าจอ จึงไม่กินแบตตอนผู้ใช้ไม่ได้ดู
 * @param bars กลุ่มของแท่งใน SVG
 * @param drawing ควรวาดตามเสียงจริงอยู่ไหม: กำลังฟัง และแผงสถานะกำลังแสดงอยู่
 */
export function useMicBars(bars: RefObject<SVGGElement | null>, drawing: boolean): void {
  useEffect(() => {
    const group = bars.current;
    const meter = getSessionMeter();
    if (!meter || !drawing || !group) return;

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

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      group.classList.remove("live");
      for (const rect of rects) {
        rect.style.transform = "";
        rect.style.opacity = "";
      }
    };
  }, [bars, drawing]);
}
