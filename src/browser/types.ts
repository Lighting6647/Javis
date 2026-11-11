/** ช่องกรอกข้อมูลหนึ่งช่องในหน้าเว็บที่ผู้ใช้เปิดอยู่ */
export interface FormField {
  /** รหัสชั่วคราวที่ Javis ติดไว้กับช่องนั้น เช่น f1 */
  id: string;
  label: string;
  /** text, email, tel, textarea, select, checkbox, radio ฯลฯ */
  type: string;
  /** ตัวเลือกของช่องแบบเลือกรายการ */
  options?: string[];
}

/** ข้อมูลของหน้าเว็บที่ส่งให้ AI เพื่อให้รู้ว่ามีช่องอะไรให้กรอก */
export interface PageContext {
  url: string;
  title: string;
  fields: FormField[];
}

/** ค่าที่จะกรอกลงช่องหนึ่งช่อง พร้อมชื่อช่องสำหรับแสดงให้ผู้ใช้ตรวจ */
export interface FillValue {
  id: string;
  label: string;
  value: string;
}

export type FillFailure = "page-changed" | "unavailable";

export interface FillResult {
  /** จำนวนช่องที่กรอกสำเร็จ */
  filled: number;
  /** รหัสช่องที่หาไม่เจอหรือกรอกไม่ได้ */
  missing: string[];
  /** กรอกไม่ได้เลยทั้งรายการ พร้อมสาเหตุ */
  failure?: FillFailure;
}

/** ตัวเชื่อมกับหน้าเว็บที่เปิดอยู่ในเบราว์เซอร์ในตัว มีเฉพาะในแอปเดสก์ท็อป */
export interface PageBridge {
  /** อ่านช่องกรอกข้อมูลของหน้าปัจจุบัน คืน null ถ้ายังไม่มีหน้าที่พร้อมใช้ */
  getContext(): Promise<PageContext | null>;
  /** กรอกค่าลงช่องที่ระบุ โดยหน้าต้องยังเป็นหน้าเดิมกับตอนที่อ่านช่อง ไม่กดส่งฟอร์ม */
  fill(pageUrl: string, values: FillValue[]): Promise<FillResult>;
}

export const FIELD_ID_PATTERN = /^f\d{1,3}$/;
export const MAX_FORM_FIELDS = 40;
export const MAX_FIELD_LABEL_LENGTH = 80;
export const MAX_FILL_VALUE_LENGTH = 500;
