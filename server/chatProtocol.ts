/**
 * เหตุการณ์ที่ backend ส่งให้หน้าเว็บระหว่างตอบ หนึ่งบรรทัด JSON ต่อหนึ่งเหตุการณ์ (NDJSON)
 * ต้องตรงกับชนิด ChatEvent ใน src/conversation/types.ts
 */
export interface WebSource {
  title: string;
  url: string;
}

export type ChatEvent =
  /** ข้อความคำตอบส่วนถัดไป */
  | { type: "delta"; text: string }
  /** AI กำลังค้นข้อมูลจากเว็บ คำตอบจะตามมา */
  | { type: "status"; status: "searching" }
  /** แหล่งที่มาที่ใช้ตอบ ส่งครั้งเดียวตอนท้าย */
  | { type: "sources"; sources: WebSource[] }
  /**
   * ผู้ใช้สั่งให้เปิดหน้าเว็บ auto = false เมื่อคำตอบรอบนี้อ่านเนื้อหาจากเว็บมาก่อน
   * หน้าเว็บจะแสดงเป็นลิงก์ให้ผู้ใช้กดเอง ไม่เปิดให้อัตโนมัติ
   * embed = true เมื่อเซิร์ฟเวอร์ตรวจแล้วว่าเจ้าของเว็บยอมให้แสดงหน้านั้นในกรอบของเว็บอื่น (ดู server/frameCheck.ts)
   * ส่งเฉพาะเมื่อหน้าเว็บของผู้ใช้บอกมาว่าแสดงหน้าในกรอบของตัวเองได้
   */
  | { type: "open"; url: string; title: string; auto: boolean; embed?: boolean }
  /**
   * AI เสนอค่าที่จะกรอกลงฟอร์มของหน้าเว็บที่ผู้ใช้เปิดอยู่
   * หน้าเว็บต้องแสดงรายการให้ผู้ใช้ยืนยันก่อนเสมอ และไม่มีการกดส่งฟอร์มให้
   */
  | { type: "fill"; fields: FillProposal[] }
  /**
   * AI ขอจำเรื่องใหม่ (added เป็นข้อความ) หรือลืมเรื่องเดิม (removed เป็นรหัสความจำ)
   * ความจำเก็บอยู่ในอุปกรณ์ของผู้ใช้ หน้าเว็บเป็นผู้บันทึกและแสดงให้ผู้ใช้เห็นพร้อมปุ่มยกเลิก
   */
  | { type: "memory"; added: string[]; removed: string[] }
  /**
   * แถบคำค้นที่เกี่ยวข้องของ Google (HTML สำเร็จรูปจาก Google) สำหรับคำตอบที่ได้จากการค้นด้วย Google
   * เงื่อนไขการใช้ของ Google กำหนดให้แสดงคู่กับคำตอบโดยไม่ดัดแปลง หน้าเว็บต้องแสดงแบบที่ HTML นี้รันสคริปต์ไม่ได้
   */
  | { type: "suggestions"; html: string[] };

/** ความจำหนึ่งเรื่องที่ผู้ใช้เก็บไว้ในอุปกรณ์ ส่งมากับคำถามเพื่อให้ AI ใช้ตอบ */
export interface MemoryEntry {
  id: string;
  text: string;
}

/** ช่องกรอกข้อมูลของหน้าเว็บที่ผู้ใช้เปิดอยู่ ส่งมาจากแอปเดสก์ท็อป */
export interface PageField {
  id: string;
  label: string;
  type: string;
  options?: string[];
}

export interface FillProposal {
  id: string;
  label: string;
  value: string;
}
