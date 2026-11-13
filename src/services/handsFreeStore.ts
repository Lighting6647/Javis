import { createFlagStore } from "./flagStore";

/**
 * สวิตช์ไมโครโฟนของการฟังตลอดเวลา: เปิด = Javis ฟังเองตั้งแต่เปิดหน้า ปิด = ไม่ฟังจนกว่าผู้ใช้จะเปิดเอง
 * เปิดเป็นค่าเริ่มต้นและเก็บไว้ในเครื่อง ผู้ใช้ที่ปิดไมโครโฟนไว้จึงไม่ถูกเปิดฟังเองในครั้งถัดไป
 * มีผลเฉพาะที่ที่ฟังตลอดเวลาได้ (ดู src/speech/handsFree.ts)
 */
export const handsFreeStore = createFlagStore("javis.handsFree");
