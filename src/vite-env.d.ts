/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** "off" = ปิดคำเรียกชื่อทั้งระบบ ฟังทุกประโยคแบบเดิม */
  readonly VITE_WAKE_GATE?: string;
  /** คำเรียกชื่อคั่นด้วยจุลภาค ค่าเริ่มต้น "hey luna,ลูน่า,ลูนา,luna" */
  readonly VITE_WAKE_PHRASES?: string;
}

/** มีไฟล์ public/audio/boot-music.mp3 ตอน build หรือตอนรัน dev server (ดู vite.config.ts) */
declare const __BOOT_MUSIC__: boolean;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
