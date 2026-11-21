import { resolveContactFromList, type VoiceContact } from "../services/contactsStore";
import type { CustomDesktopApp } from "../services/customAppsStore";

export type AssistantVoiceCommand =
  | { kind: "time"; reply: string }
  | { kind: "date"; reply: string }
  | { kind: "timer-set"; durationMs: number; label: string; reply: string }
  | { kind: "timer-cancel"; reply: string }
  | { kind: "navigate"; target: "chat" | "workspace" | "projects" | "settings"; reply: string }
  | { kind: "speech-rate"; delta: "faster" | "slower" | "normal"; reply: string }
  | { kind: "theme"; theme: "holo" | "plain"; reply: string }
  | { kind: "clear-chat"; reply: string }
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
  return `ตอนนี้เวลา ${formatted} นาฬิกาค่ะ`;
}

export function formatThaiDate(now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(now);
  return `วันนี้เป็น${formatted}ค่ะ`;
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
    return { kind: "timer-cancel", reply: "ยกเลิกตัวจับเวลาที่ตั้งไว้เรียบร้อยแล้วค่ะ" };
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
        reply: `ตั้งเวลาจับถอยหลัง ${label} ให้แล้วค่ะ ครบเวลาแล้วจะแจ้งเตือนทันทีนะคะ`
      };
    }
  }

  // 3. นำทาง Google Maps
  const mapMatch = text.match(/^(?:นำทาง|ขอเส้นทาง|พา|เปิดแผนที่)\s*(?:ไป|ไปยัง)?\s*(.+)$/i);
  if (mapMatch && mapMatch[1]?.trim()) {
    const dest = mapMatch[1].trim();
    return {
      kind: "open-url",
      url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,
      reply: `เปิดเส้นทางไป ${dest} บน Google Maps ให้แล้วค่ะ`
    };
  }

  // 4. เปิดเพลง / ค้นหา YouTube
  const musicMatch = text.match(/^(?:เปิดเพลง|เล่นเพลง|ฟังเพลง|เปิดยูทูบ|เปิด\s*youtube)\s*(.+)$/i);
  if (musicMatch && musicMatch[1]?.trim()) {
    const query = musicMatch[1].trim();
    return {
      kind: "open-url",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      reply: `เปิดค้นหา ${query} บน YouTube ให้แล้วค่ะ`
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
        reply: `เปิดหน้าเขียนอีเมลถึง${contact.name} (${contact.email}) ให้แล้วค่ะ`
      };
    }
  }

  // 6. นำทางหน้าจอในแอป
  if (/^(?:เปิด|ไป|ดู)?(?:หน้า)?(?:งาน|workspace|เวิร์กสเปซ)$/i.test(text)) {
    return { kind: "navigate", target: "workspace", reply: "เปิดแผง Workspace Hub ให้แล้วค่ะ" };
  }
  if (/^(?:เปิด|ไป|ดู)?(?:หน้า)?(?:โปรเจกต์|projects?)$/i.test(text)) {
    return { kind: "navigate", target: "projects", reply: "เปิดแผงควบคุมโปรเจกต์ให้แล้วค่ะ" };
  }
  if (/^(?:เปิด|ไป)?(?:หน้า)?ตั้งค่า(?:เสียง)?$/i.test(text)) {
    return { kind: "navigate", target: "settings", reply: "เปิดหน้าตั้งค่าเสียงให้แล้วค่ะ" };
  }
  if (/^(?:กลับ|ไป)(?:หน้า)?(?:หลัก|สนทนา|แชท)$/i.test(text)) {
    return { kind: "navigate", target: "chat", reply: "กลับมาหน้าสนทนาหลักแล้วค่ะ" };
  }

  // 7. ปรับความเร็วเสียงพูด & ธีม & ล้างแชท
  if (/^(?:พูด|อ่าน)?เร็ว(?:ขึ้น|กว่านี้)$/i.test(text)) {
    return { kind: "speech-rate", delta: "faster", reply: "ปรับความเร็วเสียงพูดให้เร็วขึ้นแล้วค่ะ" };
  }
  if (/^(?:พูด|อ่าน)?ช้า(?:ลง|กว่านี้)$/i.test(text)) {
    return { kind: "speech-rate", delta: "slower", reply: "ปรับความเร็วเสียงพูดให้ช้าลงแล้วค่ะ" };
  }
  if (/^(?:พูด|อ่าน)?(?:ความเร็ว)?(?:ปกติ|เท่าเดิม)$/i.test(text)) {
    return { kind: "speech-rate", delta: "normal", reply: "ปรับความเร็วเสียงพูดกลับเป็นระดับปกติแล้วค่ะ" };
  }
  if (/^(?:เปลี่ยน|สลับ)?(?:เป็น)?ธีม(?:โฮโล|มืด|เข้ม|holo|dark)$/i.test(text)) {
    return { kind: "theme", theme: "holo", reply: "เปลี่ยนเป็นธีมโฮโลให้แล้วค่ะ" };
  }
  if (/^(?:เปลี่ยน|สลับ)?(?:เป็น)?ธีม(?:สว่าง|ขาว|เรียบ|plain|light)$/i.test(text)) {
    return { kind: "theme", theme: "plain", reply: "เปลี่ยนเป็นธีมสว่างให้แล้วค่ะ" };
  }
  if (/^(?:ล้างแชท|ลบแชท|เริ่มคุยใหม่|เริ่มสนทนาใหม่)$/i.test(text)) {
    return { kind: "clear-chat", reply: "ล้างบทสนทนาและเริ่มใหม่ให้เรียบร้อยแล้วค่ะ" };
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
        reply: `กำลังเปิดโปรแกรม ${matchedApp.name} ให้ค่ะ`
      };
    }
  }

  return null;
}
