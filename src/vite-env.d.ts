/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** "off" = ปิดคำเรียกชื่อทั้งระบบ ฟังทุกประโยคแบบเดิม */
  readonly VITE_WAKE_GATE?: string;
  /** คำเรียกชื่อคั่นด้วยจุลภาค ค่าเริ่มต้น "hey luna,ลูน่า,ลูนา,luna,hey jarvis,จาร์วิส,จาวิส,jarvis" */
  readonly VITE_WAKE_PHRASES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
