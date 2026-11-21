/**
 * รายการโปรแกรม/แอปที่อนุญาตให้เดลลูน่าเสนอเปิดบนคอมพิวเตอร์และอุปกรณ์เคลื่อนที่ (Allowlist)
 * ใช้รหัสแอปคงที่เท่านั้น ห้ามรับคำสั่ง shell หรือพาธอิสระจาก AI เพื่อป้องกัน Command Injection
 */
export const ALLOWED_APP_IDS = [
  "chrome",
  "edge",
  "vscode",
  "notepad",
  "calculator",
  "explorer",
  "terminal",
  "excel",
  "word",
  "line",
  "spotify",
  "gmail",
  "calendar",
  "maps",
  "youtube",
  "settings"
] as const;

export type AllowedAppId = (typeof ALLOWED_APP_IDS)[number];

export interface AllowedAppDefinition {
  id: AllowedAppId;
  name: string;
  aliases: readonly string[];
  /** ลิงก์สำรองสำหรับเปิดผ่านเว็บเมื่อไม่ได้อยู่บนแอปเดสก์ท็อป/มือถือ */
  webUrl?: string;
}

export const ALLOWED_APPS: readonly AllowedAppDefinition[] = [
  { id: "chrome", name: "Google Chrome", aliases: ["chrome", "โครม", "google chrome", "เบราว์เซอร์"] },
  { id: "edge", name: "Microsoft Edge", aliases: ["edge", "เอดจ์", "microsoft edge"] },
  { id: "vscode", name: "Visual Studio Code", aliases: ["vscode", "vs code", "code", "โค้ด", "visual studio code"] },
  { id: "notepad", name: "Notepad", aliases: ["notepad", "โน้ตแพด", "สมุดบันทึก"] },
  { id: "calculator", name: "Calculator", aliases: ["calculator", "calc", "เครื่องคิดเลข"] },
  { id: "explorer", name: "File Explorer", aliases: ["explorer", "files", "finder", "โฟลเดอร์", "ไฟล์"] },
  { id: "terminal", name: "Terminal", aliases: ["terminal", "powershell", "cmd", "เทอร์มินัล"] },
  { id: "excel", name: "Microsoft Excel", aliases: ["excel", "เอกซ์เซล", "เอ็กเซล", "สเปรดชีต"] },
  { id: "word", name: "Microsoft Word", aliases: ["word", "เวิร์ด", "microsoft word"] },
  { id: "line", name: "LINE", aliases: ["line", "ไลน์"] },
  { id: "spotify", name: "Spotify", aliases: ["spotify", "สปอติฟาย"], webUrl: "https://open.spotify.com" },
  { id: "gmail", name: "Gmail", aliases: ["gmail", "จีเมล", "เมล", "อีเมล"], webUrl: "https://mail.google.com" },
  {
    id: "calendar",
    name: "Google Calendar",
    aliases: ["calendar", "ปฏิทิน", "google calendar", "นัดหมาย"],
    webUrl: "https://calendar.google.com"
  },
  { id: "maps", name: "Google Maps", aliases: ["maps", "แผนที่", "google maps"], webUrl: "https://maps.google.com" },
  { id: "youtube", name: "YouTube", aliases: ["youtube", "ยูทูบ", "ยูทูป"], webUrl: "https://www.youtube.com" },
  { id: "settings", name: "System Settings", aliases: ["settings", "ตั้งค่า", "การตั้งค่า"] }
] as const;

const APP_BY_ID = new Map<string, AllowedAppDefinition>(ALLOWED_APPS.map((app) => [app.id, app]));

export function resolveAllowedApp(input: unknown): AllowedAppDefinition | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  const exact = APP_BY_ID.get(normalized);
  if (exact) return exact;

  return (
    ALLOWED_APPS.find((app) => app.aliases.some((alias) => alias.toLowerCase() === normalized)) ??
    ALLOWED_APPS.find((app) => app.name.toLowerCase() === normalized) ??
    null
  );
}
