/**
 * วิธีอนุญาตให้เว็บนี้เปิดแท็บใหม่เอง แยกตามเบราว์เซอร์ของผู้ใช้
 * เบราว์เซอร์ไม่มีทางให้เว็บขอสิทธิ์นี้เอง ผู้ใช้ต้องตั้งในเบราว์เซอร์หนึ่งครั้ง
 * ชื่อเมนูมีภาษาอังกฤษกำกับ เพราะคำแปลไทยต่างกันในแต่ละรุ่น
 */
export interface PopupHelp {
  /** ชื่อเบราว์เซอร์ที่ขั้นตอนนี้ใช้ได้ */
  browser: string;
  steps: string[];
}

const SEEN_KEY = "javis.popupHelpSeen";
type SeenStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * อุปกรณ์นี้เคยเห็นคำแนะนำแล้วหรือยัง ครั้งแรกจะกางขั้นตอนให้เห็นเลย ครั้งถัดไปพับไว้ไม่ให้รกบทสนทนา
 * ถ้าเบราว์เซอร์ปิดการเก็บข้อมูล ถือว่าเคยเห็นแล้ว เพื่อไม่ให้กางซ้ำทุกครั้ง
 */
export function hasSeenPopupHelp(storage: SeenStorage = localStorage): boolean {
  try {
    return storage.getItem(SEEN_KEY) !== null;
  } catch {
    return true;
  }
}

export function markPopupHelpSeen(storage: SeenStorage = localStorage): void {
  try {
    storage.setItem(SEEN_KEY, "1");
  } catch {
    // เก็บไม่ได้ก็ไม่เป็นไร คำแนะนำยังเปิดอ่านเองได้เสมอ
  }
}

const TRY_AGAIN = "สั่ง Javis อีกครั้ง หน้าเว็บจะเปิดในแท็บใหม่เองทันที";

/**
 * ผู้ใช้อ่านคำแนะนำนี้หลังกลับมาจากเว็บที่ Javis พาแท็บไป ไอคอนแจ้งบล็อกที่ปลายแถบที่อยู่ไม่อยู่แล้วในตอนนั้น
 * จึงพาไปทางการตั้งค่าของเว็บไซต์ ซึ่งเปิดได้ทุกเมื่อ
 */
const chromiumDesktop = (browser: string, siteSettings: string): PopupHelp => ({
  browser,
  steps: [
    `กดไอคอนซ้ายสุดของแถบที่อยู่ (หน้าที่อยู่เว็บ) แล้วเลือก ${siteSettings}`,
    "ที่รายการ ป๊อปอัปและการเปลี่ยนเส้นทาง (Pop-ups and redirects) เลือก อนุญาต (Allow) แล้วกลับมาที่หน้านี้",
    TRY_AGAIN
  ]
});

/** เลือกขั้นตอนจากชื่อเบราว์เซอร์ใน user agent เบราว์เซอร์ที่ไม่รู้จักได้ขั้นตอนทั่วไป */
export function popupHelpFor(userAgent: string): PopupHelp {
  // เบราว์เซอร์ทุกตัวบน iPhone และ iPad ใช้เครื่องยนต์ของ Safari แต่มีสวิตช์ป๊อปอัปเป็นของตัวเอง
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return {
      browser: "iPhone และ iPad",
      steps: [
        "Safari: เปิดแอป การตั้งค่า > แอป > Safari ส่วน Chrome: เปิดเมนูของ Chrome > การตั้งค่า > การตั้งค่าเนื้อหา (Content Settings)",
        "ปิดตัวเลือก บล็อกป๊อปอัป (Block Pop-ups)",
        TRY_AGAIN
      ]
    };
  }

  if (/Firefox\//.test(userAgent)) {
    return {
      browser: "Firefox",
      steps: [
        "เปิดเมนู > การตั้งค่า (Settings) > ความเป็นส่วนตัวและความปลอดภัย (Privacy & Security) แล้วเลื่อนไปที่ สิทธิ์อนุญาต (Permissions)",
        "ข้างตัวเลือก ปิดกั้นหน้าต่างป๊อปอัป (Block pop-up windows) กด ข้อยกเว้น (Exceptions) ใส่ที่อยู่ของเว็บนี้ กด อนุญาต (Allow) แล้วบันทึก",
        TRY_AGAIN
      ]
    };
  }

  if (/Android/.test(userAgent) && /Chrome\//.test(userAgent)) {
    return {
      browser: "Chrome บน Android",
      steps: [
        "แตะเมนูสามจุดของ Chrome แล้วเข้า การตั้งค่า > การตั้งค่าเว็บไซต์ (Site settings)",
        "เปิด ป๊อปอัปและการเปลี่ยนเส้นทาง (Pop-ups and redirects)",
        TRY_AGAIN
      ]
    };
  }

  if (/Edg\//.test(userAgent)) return chromiumDesktop("Edge", "สิทธิ์สำหรับไซต์นี้ (Permissions for this site)");
  if (/Chrome\//.test(userAgent)) return chromiumDesktop("Chrome", "การตั้งค่าเว็บไซต์ (Site settings)");

  if (/Safari\//.test(userAgent) && /Macintosh/.test(userAgent)) {
    return {
      browser: "Safari",
      steps: [
        "เปิดเมนู Safari > การตั้งค่า > เว็บไซต์ (Websites) > หน้าต่างป๊อปอัป (Pop-up Windows)",
        "ตั้งเว็บนี้เป็น อนุญาต (Allow)",
        TRY_AGAIN
      ]
    };
  }

  return {
    browser: "เบราว์เซอร์นี้",
    steps: ["เปิดการตั้งค่าของเบราว์เซอร์ แล้วหาหัวข้อ สิทธิ์ของเว็บไซต์ หรือ ป๊อปอัป", "อนุญาตป๊อปอัปให้เว็บนี้", TRY_AGAIN]
  };
}
