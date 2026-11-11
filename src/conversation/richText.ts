const MARKDOWN_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
/** ลิงก์อ้างอิงที่อยู่ในวงเล็บทั้งก้อน เช่น ([reuters.com](https://...)) */
const PARENTHESIZED_LINK = /\s*\(\s*\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)\s*\)/g;
const BARE_URL = /https?:\/\/\S+/g;

export type TextSegment =
  | { type: "text"; text: string }
  | { type: "link"; label: string; url: string };

/** รับเฉพาะลิงก์ http/https ที่ไม่ฝังชื่อผู้ใช้หรือรหัสผ่าน คืน null ถ้าไม่ปลอดภัย */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !URL.canParse(value)) return null;

  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.href;
}

/** ชื่อเว็บไซต์สำหรับแสดงให้ผู้ใช้เห็นว่าลิงก์พาไปที่ใด */
export function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, "") : url;
}

/** แยกข้อความคำตอบออกเป็นส่วนข้อความกับลิงก์อ้างอิง เพื่อแสดงลิงก์ให้กดได้ */
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const [whole, label = "", rawUrl = ""] = match;
    const url = safeHttpUrl(rawUrl);
    if (!url) continue;

    if (match.index > cursor) segments.push({ type: "text", text: text.slice(cursor, match.index) });
    segments.push({ type: "link", label, url });
    cursor = match.index + whole.length;
  }

  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });
  return segments;
}

/** ตัดลิงก์และที่อยู่เว็บออกจากข้อความที่จะอ่านออกเสียง */
export function stripLinks(text: string): string {
  return text.replace(PARENTHESIZED_LINK, "").replace(MARKDOWN_LINK, "$1").replace(BARE_URL, "");
}
