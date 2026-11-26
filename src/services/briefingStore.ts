import { createFlagStore } from "./flagStore";

/** สรุปเช้าอัตโนมัติเมื่อเปิดแอปครั้งแรกของวัน (เปิดเป็นค่าเริ่มต้น ปิดได้ในหน้าตั้งค่า) */
export const autoBriefingStore = createFlagStore("luna.autoBriefing");

/** บอกสภาพอากาศในสรุปเช้า (ใช้ตำแหน่งของอุปกรณ์ เฉพาะเมื่อผู้ใช้อนุญาตตำแหน่งให้เว็บนี้แล้ว) */
export const briefingWeatherStore = createFlagStore("luna.briefingWeather");
