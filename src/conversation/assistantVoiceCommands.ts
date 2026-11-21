import { resolveContactFromList, type VoiceContact } from "../services/contactsStore";
import type { CustomDesktopApp } from "../services/customAppsStore";
import type { HudAccent, HudScreenEffect, ReactorStyle } from "../services/hudEffectsStore";

export type AssistantVoiceCommand =
  | { kind: "time"; reply: string }
  | { kind: "date"; reply: string }
  | { kind: "timer-set"; durationMs: number; label: string; reply: string }
  | { kind: "timer-cancel"; reply: string }
  | { kind: "navigate"; target: "chat" | "workspace" | "projects" | "settings"; reply: string }
  | { kind: "speech-rate"; delta: "faster" | "slower" | "normal"; reply: string }
  | { kind: "theme"; theme: "holo" | "plain"; reply: string }
  | { kind: "clear-chat"; reply: string }
  | { kind: "think-hard"; enabled: boolean; reply: string }
  | { kind: "hud-accent"; accent: HudAccent; reply: string }
  | { kind: "hud-style"; style: ReactorStyle; reply: string }
  | { kind: "hud-effect"; effect: HudScreenEffect; reply: string }
  | { kind: "hand-control"; enabled: boolean; reply: string }
  | { kind: "clap-wake"; enabled: boolean; reply: string }
  | { kind: "open-url"; url: string; reply: string }
  | { kind: "launch-custom-app"; app: CustomDesktopApp; reply: string };

const WAKE_PREFIX = /^(?:(?:เดลลูน่า|เดลูนา|ลูน่า|delluna|จาวิส|javis|นีน่า|nina|โอเค\s*กูเกิล|ok\s*google|hey\s*google)\s*[,:]?\s*)?/i;
const POLITE_SUFFIX = /(?:\s*(?:ให้หน่อย|หน่อย|ให้ฟังหน่อย|ให้ที|ด้วย|สิ|นะ|นะคะ|นะครับ|ค่ะ|ครับ))*$/i;

function stripWakeAndPolite(rawText: string): string {
  return rawText.trim().replace(/[?.!,]/g, "").replace(WAKE_PREFIX, "").replace(POLITE_SUFFIX, "").trim();
}

export function formatThaiClock(now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok"
  }).format(now);
  return `ตอนนี้เวลา ${formatted} นาฬิกาครับ`;
}

export function formatThaiDate(now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(now);
  return `วันนี้เป็น${formatted}ครับ`;
}

/**
 * จับคำสั่งเสียงผู้ช่วยทั่วไปสไตล์ Google Assistant ที่ทำได้ทันทีในเครื่อง (Zero-Quota)
 * เช่น ถามเวลา/วันที่, ตั้งตัวจับเวลา, นำทาง Google Maps, เปิดเพลง YouTube, โทรออก,
 * สลับหน้าจอ, ปรับความเร็วเสียง/ธีม, และเปิดโปรแกรมเฉพาะทางในเครื่อง
 */
export function matchAssistantVoiceCommand(
  rawText: string,
  customApps: readonly CustomDesktopApp[] = [],
  now: Date = new Date(),
  contacts: readonly VoiceContact[] = []
): AssistantVoiceCommand | null {
  const text = stripWakeAndPolite(rawText);
  if (!text) return null;

  // 1. เวลาและวันที่
  if (/^(?:ตอนนี้)?กี่โมง(?:แล้ว)?$/i.test(text) || /^เวลาเท่าไหร่$/i.test(text)) {
    return { kind: "time", reply: formatThaiClock(now) };
  }
  if (/^(?:วันนี้)?(?:วันที่เท่าไหร่|วันอะไร|วันที่เท่าไร)$/i.test(text)) {
    return { kind: "date", reply: formatThaiDate(now) };
  }

  // 2. ตัวจับเวลา (Timer)
  if (/^(?:ยกเลิก|ปิด|หยุด)(?:ตัว)?(?:จับเวลา|ตั้งเวลา|นาฬิกาจับเวลา)$/i.test(text)) {
    return { kind: "timer-cancel", reply: "ยกเลิกตัวจับเวลาที่ตั้งไว้เรียบร้อยแล้วครับ" };
  }
  const timerMatch = text.match(/^(?:ตั้งเวลา|จับเวลา|ตั้งนาฬิกา|เตือนอีก)\s*(\d{1,3})\s*(วินาที|วิ|นาที|ชั่วโมง|ชม\.?)$/i);
  if (timerMatch) {
    const amount = Number(timerMatch[1]);
    const unitRaw = timerMatch[2]?.toLowerCase() ?? "";
    if (amount > 0) {
      const multiplier = unitRaw.startsWith("ช") ? 3_600_000 : unitRaw.startsWith("น") ? 60_000 : 1_000;
      const unitLabel = unitRaw.startsWith("ช") ? "ชั่วโมง" : unitRaw.startsWith("น") ? "นาที" : "วินาที";
      const durationMs = Math.min(amount * multiplier, 24 * 3_600_000);
      const label = `${amount} ${unitLabel}`;
      return {
        kind: "timer-set",
        durationMs,
        label,
        reply: `ตั้งเวลาจับถอยหลัง ${label} ให้แล้วครับ ครบเวลาแล้วจะแจ้งเตือนทันทีนะครับ`
      };
    }
  }

  // 3. เปิด Google Maps / นำทาง
  if (/^(?:เปิด|ดู)?\s*(?:google\s*maps?|กูเกิล\s*แมพ|แผนที่)$/i.test(text)) {
    return {
      kind: "open-url",
      url: "https://maps.google.com/maps?output=embed&q=Thailand",
      reply: "เปิดแผนที่ Google Maps ให้แล้วครับ"
    };
  }
  const mapMatch = text.match(/^(?:นำทาง|ขอเส้นทาง|พา|เปิดแผนที่|เปิด\s*google\s*maps?|เปิด\s*กูเกิล\s*แมพ)\s*(?:ไป|ไปยัง)?\s*(.+)$/i);
  if (mapMatch && mapMatch[1]?.trim()) {
    const dest = mapMatch[1].trim();
    return {
      kind: "open-url",
      url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,
      reply: `เปิดเส้นทางไป ${dest} บน Google Maps ให้แล้วครับ`
    };
  }

  // 4. เปิดเพลง / ค้นหา YouTube
  const musicMatch = text.match(/^(?:เปิดเพลง|เล่นเพลง|ฟังเพลง|เปิดยูทูบ|เปิด\s*youtube)\s*(.+)$/i);
  if (musicMatch && musicMatch[1]?.trim()) {
    const query = musicMatch[1].trim();
    return {
      kind: "open-url",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      reply: `เปิดค้นหา ${query} บน YouTube ให้แล้วครับ`
    };
  }

  // 5. โทรออก (เบอร์ตรง หรือชื่อในสมุดรายชื่อ) และส่งเมลหาคนในสมุดรายชื่อ
  const callMatch = text.match(/^(?:โทรออก|โทรหา|โทร)\s*(.+)$/i);
  if (callMatch && callMatch[1]?.trim()) {
    const rawTarget = callMatch[1].trim();
    const digits = rawTarget.replace(/[\s()-]/g, "");
    if (/^\+?\d{3,15}$/.test(digits)) {
      return {
        kind: "open-url",
        url: `tel:${digits}`,
        reply: `กำลังโทรออกไปยังหมายเลข ${digits} ค่ะ`
      };
    }
    const contact = resolveContactFromList(rawTarget, contacts);
    if (contact?.phone) {
      return {
        kind: "open-url",
        url: `tel:${contact.phone}`,
        reply: `กำลังโทรหา${contact.name}ที่หมายเลข ${contact.phone} ค่ะ`
      };
    }
  }

  const mailMatch = text.match(/^(?:ส่งเมล|ส่งอีเมล|เขียนเมล)\s*(?:หา|ถึง|ไปยัง)?\s*(.+)$/i);
  if (mailMatch && mailMatch[1]?.trim()) {
    const rawTarget = mailMatch[1].trim();
    const contact = resolveContactFromList(rawTarget, contacts);
    if (contact?.email) {
      return {
        kind: "open-url",
        url: `mailto:${contact.email}`,
        reply: `เปิดหน้าเขียนอีเมลถึง${contact.name} (${contact.email}) ให้แล้วครับ`
      };
    }
  }

  // 6. นำทางหน้าจอในแอป
  if (/^(?:เปิด|ไป|ดู)?(?:หน้า)?(?:งาน|workspace|เวิร์กสเปซ)$/i.test(text)) {
    return { kind: "navigate", target: "workspace", reply: "เปิดแผง Workspace Hub ให้แล้วครับ" };
  }
  if (/^(?:เปิด|ไป|ดู)?(?:หน้า)?(?:โปรเจกต์|projects?)$/i.test(text)) {
    return { kind: "navigate", target: "projects", reply: "เปิดแผงควบคุมโปรเจกต์ให้แล้วครับ" };
  }
  if (/^(?:เปิด|ไป)?(?:หน้า)?ตั้งค่า(?:เสียง)?$/i.test(text)) {
    return { kind: "navigate", target: "settings", reply: "เปิดหน้าตั้งค่าเสียงให้แล้วครับ" };
  }
  if (/^(?:กลับ|ไป)(?:หน้า)?(?:หลัก|สนทนา|แชท)$/i.test(text)) {
    return { kind: "navigate", target: "chat", reply: "กลับมาหน้าสนทนาหลักแล้วครับ" };
  }

  // 7. ปรับความเร็วเสียงพูด & ธีม & ล้างแชท
  if (/^(?:พูด|อ่าน)?เร็ว(?:ขึ้น|กว่านี้)$/i.test(text)) {
    return { kind: "speech-rate", delta: "faster", reply: "ปรับความเร็วเสียงพูดให้เร็วขึ้นแล้วครับ" };
  }
  if (/^(?:พูด|อ่าน)?ช้า(?:ลง|กว่านี้)$/i.test(text)) {
    return { kind: "speech-rate", delta: "slower", reply: "ปรับความเร็วเสียงพูดให้ช้าลงแล้วครับ" };
  }
  if (/^(?:พูด|อ่าน)?(?:ความเร็ว)?(?:ปกติ|เท่าเดิม)$/i.test(text)) {
    return { kind: "speech-rate", delta: "normal", reply: "ปรับความเร็วเสียงพูดกลับเป็นระดับปกติแล้วครับ" };
  }
  if (/^(?:เปลี่ยน|สลับ)?(?:เป็น)?ธีม(?:โฮโล|มืด|เข้ม|holo|dark)$/i.test(text)) {
    return { kind: "theme", theme: "holo", reply: "เปลี่ยนเป็นธีมโฮโลให้แล้วครับ" };
  }
  if (/^(?:เปลี่ยน|สลับ)?(?:เป็น)?ธีม(?:สว่าง|ขาว|เรียบ|plain|light)$/i.test(text)) {
    return { kind: "theme", theme: "plain", reply: "เปลี่ยนเป็นธีมสว่างให้แล้วครับ" };
  }
  if (/^(?:ล้างแชท|ลบแชท|เริ่มคุยใหม่|เริ่มสนทนาใหม่)$/i.test(text)) {
    return { kind: "clear-chat", reply: "ล้างบทสนทนาและเริ่มใหม่ให้เรียบร้อยแล้วครับ" };
  }
  if (/^(?:เปิด|ใช้|เข้า)?(?:โหมด)?(?:คิดลึก|วิเคราะห์ละเอียด|think\s*hard)$/i.test(text)) {
    return { kind: "think-hard", enabled: true, reply: "เปิดโหมดคิดลึกให้แล้วครับคุณไลท์" };
  }
  if (/^(?:ปิด|ออก|เลิก)?(?:โหมด)?(?:คิดลึก|วิเคราะห์ละเอียด|think\s*hard)$|^โหมดปกติ$/i.test(text)) {
    return { kind: "think-hard", enabled: false, reply: "สลับกลับเป็นโหมดตอบไวปกติแล้วครับคุณไลท์" };
  }

  // เปลี่ยนสี, รูปทรงแกนพลังงาน 3 มิติ และเอฟเฟกต์หน้าจอด้วยเสียงภาษาไทย
  if (/^(?:เปลี่ยน)?(?:สี|แกน)?(?:เป็น)?สีแดง$/i.test(text)) {
    return { kind: "hud-accent", accent: "red", reply: "เปลี่ยนสีแกนพลังงานเป็นสีแดงให้แล้วครับ" };
  }
  if (/^(?:เปลี่ยน)?(?:สี|แกน)?(?:เป็น)?สี(?:ทอง|เหลือง|ส้ม)$/i.test(text)) {
    return { kind: "hud-accent", accent: "gold", reply: "เปลี่ยนสีแกนพลังงานเป็นสีทองให้แล้วครับ" };
  }
  if (/^(?:เปลี่ยน)?(?:สี|แกน)?(?:เป็น)?สีเขียว$/i.test(text)) {
    return { kind: "hud-accent", accent: "emerald", reply: "เปลี่ยนสีแกนพลังงานเป็นสีเขียวให้แล้วครับ" };
  }
  if (/^(?:เปลี่ยน)?(?:สี|แกน)?(?:เป็น)?สีม่วง$/i.test(text)) {
    return { kind: "hud-accent", accent: "purple", reply: "เปลี่ยนสีแกนพลังงานเป็นสีม่วงให้แล้วครับ" };
  }
  if (/^(?:เปลี่ยน)?(?:สี|แกน)?(?:เป็น)?สี(?:ฟ้า|ปกติ|เดิม)$/i.test(text)) {
    return { kind: "hud-accent", accent: "cyan", reply: "เปลี่ยนสีแกนพลังงานกลับเป็นสีฟ้ามาตรฐานแล้วครับ" };
  }

  if (/^(?:เปลี่ยน)?แกน(?:แบบ)?ทรงกลม$/i.test(text)) {
    return { kind: "hud-style", style: "sphere", reply: "เปลี่ยนแกนพลังงานเป็นแบบทรงกลม 3 มิติแล้วครับ" };
  }
  if (/^(?:เปลี่ยน)?แกน(?:แบบ)?เส้น$/i.test(text)) {
    return { kind: "hud-style", style: "wire", reply: "เปลี่ยนแกนพลังงานเป็นแบบเส้นโครงสร้างแล้วครับ" };
  }
  if (/^(?:เปลี่ยน)?แกน(?:แบบ)?(?:วงแหวน|ปกติ)$/i.test(text)) {
    return { kind: "hud-style", style: "ring", reply: "เปลี่ยนแกนพลังงานเป็นแบบวงแหวนแล้วครับ" };
  }

  if (/^(?:เอฟเฟกต์)?สแกน(?:หน้าจอ)?$/i.test(text)) {
    return { kind: "hud-effect", effect: "scan", reply: "เริ่มสแกนหน้าจอแล้วครับ" };
  }
  if (/^(?:เอฟเฟกต์)?(?:แฟลช|สว่างวาบ)$/i.test(text)) {
    return { kind: "hud-effect", effect: "flash", reply: "ยิงเอฟเฟกต์แฟลชแล้วครับ" };
  }
  if (/^(?:เอฟเฟกต์)?พัลส์$/i.test(text)) {
    return { kind: "hud-effect", effect: "pulse", reply: "ส่งคลื่นพัลส์แล้วครับ" };
  }
  if (/^(?:เอฟเฟกต์)?(?:กระตุก|กลิตช์|glitch)$/i.test(text)) {
    return { kind: "hud-effect", effect: "glitch", reply: "เปิดเอฟเฟกต์กระตุกแล้วครับ" };
  }
  if (/^(?:เอฟเฟกต์)?สั่น$/i.test(text)) {
    return { kind: "hud-effect", effect: "shake", reply: "เปิดเอฟเฟกต์สั่นแล้วครับ" };
  }

  if (/^(?:เปิด|ใช้)(?:โหมด)?(?:ท่ามือ|ควบคุมด้วยมือ|กล้องท่ามือ)$/i.test(text)) {
    return { kind: "hand-control", enabled: true, reply: "เปิดโหมดควบคุมด้วยท่ามือผ่านกล้องให้แล้วครับ" };
  }
  if (/^(?:ปิด|เลิก)(?:โหมด)?(?:ท่ามือ|ควบคุมด้วยมือ|กล้องท่ามือ)$/i.test(text)) {
    return { kind: "hand-control", enabled: false, reply: "ปิดโหมดควบคุมด้วยท่ามือแล้วครับ" };
  }

  if (/^(?:เปิด|ใช้)(?:โหมด)?ตบมือ(?:ปลุก)?$/i.test(text)) {
    return { kind: "clap-wake", enabled: true, reply: "เปิดโหมดตบมือ 2 ครั้งเพื่อปลุกจาวิสแล้วครับ" };
  }
  if (/^(?:ปิด|เลิก)(?:โหมด)?ตบมือ(?:ปลุก)?$/i.test(text)) {
    return { kind: "clap-wake", enabled: false, reply: "ปิดโหมดตบมือปลุกแล้วครับ" };
  }

  // 8. เปิดโปรแกรมเฉพาะทาง (Custom Desktop Apps) ที่ผู้ใช้เพิ่มเอง
  const openCustomMatch = text.match(/^(?:เปิด|รัน|เรียก)\s*(?:โปรแกรม|แอป)?\s*(.+)$/i);
  if (openCustomMatch && openCustomMatch[1]?.trim()) {
    const targetName = openCustomMatch[1].trim().toLowerCase();
    const matchedApp = customApps.find((app) => {
      const appName = app.name.trim().toLowerCase();
      return appName === targetName || appName.includes(targetName) || targetName.includes(appName);
    });
    if (matchedApp) {
      return {
        kind: "launch-custom-app",
        app: matchedApp,
        reply: `กำลังเปิดโปรแกรม ${matchedApp.name} ให้ครับ`
      };
    }
  }

  return null;
}
