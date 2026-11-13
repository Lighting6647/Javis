import { browserLocks, createTabLock, type TabLock } from "../services/tabLock";

/**
 * สิทธิ์เป็นแท็บที่มีการประชุมอยู่ (กำลังจด พัก หรือกำลังสรุป)
 * บันทึกที่ยังไม่ได้สรุปเก็บไว้ที่เดียวในเครื่องและทุกแท็บมองเห็น แท็บที่เปิดทีหลังจึงต้องรู้ว่าบันทึกนั้นเป็นของการประชุม
 * ที่ยังดำเนินอยู่ในแท็บอื่น หรือเป็นของค้างจากแท็บที่ปิดไปแล้ว ซึ่งควรนำกลับมาให้สรุป
 */
export const meetingLock: TabLock = createTabLock(browserLocks(), "javis.meeting");
