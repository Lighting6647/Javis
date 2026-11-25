import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * กติกาความปลอดภัยของเครื่องมือควบคุมคอมพิวเตอร์ ตรวจโดยเซิร์ฟเวอร์เอง ไม่ขึ้นกับคำสั่งที่ให้ AI
 * อาร์กิวเมนต์ทั้งหมดมาจาก AI จึงถือว่าไม่น่าไว้ใจ
 */
export type PolicyResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const deny = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

const MAX_PATH_LENGTH = 400;
const MAX_COMMAND_LENGTH = 500;

/** อักขระควบคุมและอักขระสลับทิศทางข้อความ ซึ่งทำให้สิ่งที่แสดงบนการ์ดยืนยันต่างจากสิ่งที่รันจริง */
// eslint-disable-next-line no-control-regex
const HIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** ชื่อไฟล์หรือโฟลเดอร์ที่มักเก็บกุญแจ รหัสผ่าน หรือเซสชัน */
const SENSITIVE_SEGMENT =
  /^\.env|^\.git$|^\.ssh$|^\.aws$|^\.azure$|^\.gnupg$|^\.kube$|^\.docker$|^\.claude|^\.codex$|^\.gemini$|^\.npmrc$|^\.netrc$|^_netrc$|^\.pypirc$|^\.git-credentials$|^id_(?:rsa|dsa|ecdsa|ed25519)|\.(?:pem|key|pfx|p12|kdbx?|jks|keystore|ppk|gpg|asc)$|credential|secret|password|passwd|รหัสผ่าน|service[-_]?account|^cookies|^login data|^web data|(?:^|[-_.])tokens?(?:[-_.]|$)/i;

export function isSensitivePath(target: string): boolean {
  return target.split(/[\\/]+/).some((segment) => SENSITIVE_SEGMENT.test(segment));
}

export interface PathPolicy {
  /** โฟลเดอร์ที่อนุญาต */
  roots: string[];
  /** ชื่อสั้นที่ผู้ใช้พูด เช่น downloads */
  aliases: Record<string, string>;
  realpath: (target: string) => string;
}

/** โฟลเดอร์ที่อนุญาตบนเครื่องนี้ รวมโฟลเดอร์ที่ OneDrive ย้ายไป */
export function defaultPathPolicy(home: string = homedir()): PathPolicy {
  const pick = (name: string) => {
    for (const base of [path.join(home, "OneDrive", name), path.join(home, name)]) {
      try {
        return realpathSync.native(base);
      } catch {
        // ไม่มีโฟลเดอร์นี้ ลองตำแหน่งถัดไป
      }
    }
    return path.join(home, name);
  };
  const desktop = pick("Desktop");
  const documents = pick("Documents");
  const downloads = path.join(home, "Downloads");
  const projects = "D:\\AI\\Light";
  return {
    roots: [desktop, documents, downloads, path.join(home, "Desktop"), path.join(home, "Documents"), projects],
    aliases: {
      desktop,
      เดสก์ท็อป: desktop,
      หน้าจอ: desktop,
      documents,
      เอกสาร: documents,
      downloads,
      download: downloads,
      ดาวน์โหลด: downloads,
      projects,
      โปรเจกต์: projects
    },
    realpath: realpathSync.native
  };
}

function isInside(root: string, target: string): boolean {
  const relative = path.win32.relative(root.toLowerCase(), target.toLowerCase());
  return relative === "" || (!relative.startsWith("..") && !path.win32.isAbsolute(relative));
}

/** พาธจริงหลังตามลิงก์ของโฟลเดอร์ชั้นที่มีอยู่แล้ว แล้วต่อด้วยส่วนที่ยังไม่มี (ไฟล์ใหม่) */
function resolveReal(target: string, realpath: (value: string) => string): string | null {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      return path.win32.join(realpath(current), ...missing);
    } catch {
      const parent = path.win32.dirname(current);
      if (parent === current) return null;
      missing.unshift(path.win32.basename(current));
      current = parent;
    }
  }
}

/** ตรวจพาธจาก AI คืนพาธจริงที่ใช้ได้ */
export function checkPath(input: unknown, policy: PathPolicy): PolicyResult<string> {
  if (typeof input !== "string" || !input.trim()) return deny("ไม่ได้ระบุไฟล์หรือโฟลเดอร์");
  const raw = input.trim().replace(/\//g, "\\");
  if (raw.length > MAX_PATH_LENGTH || HIDDEN_CHARACTERS.test(raw)) return deny("ชื่อไฟล์ไม่ถูกต้อง");
  if (raw.startsWith("\\")) return deny("ไม่อนุญาตพาธเครือข่ายหรือพาธพิเศษ");

  const [first = "", ...rest] = raw.split("\\");
  const alias = policy.aliases[first.toLowerCase()];
  const absolute = alias ? path.win32.join(alias, ...rest) : raw;
  if (!/^[a-z]:\\/i.test(absolute)) return deny("ต้องเป็นพาธเต็ม หรือขึ้นต้นด้วย Desktop, Documents, Downloads หรือ Projects");
  // เครื่องหมาย : ตรงอื่นคือสตรีมซ่อนของ NTFS ส่วนจุดหรือช่องว่างท้ายชื่อถูก Windows ตัดทิ้ง
  if (absolute.slice(2).includes(":") || /[<>"|?*]/.test(absolute)) return deny("ชื่อไฟล์มีอักขระที่ไม่อนุญาต");

  const normalized = path.win32.normalize(absolute);
  if (normalized.split("\\").some((segment) => segment.length > 0 && /[. ]$/.test(segment))) return deny("ชื่อไฟล์ไม่ถูกต้อง");

  const real = resolveReal(normalized, policy.realpath);
  if (!real) return deny("ไม่พบไดรฟ์หรือโฟลเดอร์นี้");
  if (!policy.roots.some((root) => isInside(root, real))) {
    return deny("อยู่นอกโฟลเดอร์ที่อนุญาต ใช้ได้เฉพาะ Desktop, Documents, Downloads และ D:\\AI\\Light");
  }
  if (isSensitivePath(normalized) || isSensitivePath(real)) return deny("เป็นไฟล์ที่อาจเก็บกุญแจหรือรหัสผ่าน จึงไม่เปิดให้ใช้");
  return { ok: true, value: real };
}

/** คำสั่งที่ไม่รันแม้ผู้ใช้จะยืนยัน: ลบ ทำลาย เปลี่ยนระบบ ซ่อนคำสั่ง หรือแตะไฟล์กุญแจ */
const FORBIDDEN_COMMANDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:^|[\s;|&({'"])(?:rm|ri|del|erase|rd|rmdir|remove-item|clear-content|clc|rimraf|unlink)(?:\.exe)?(?=$|[\s;|&)'"])/i, "เป็นคำสั่งลบไฟล์"],
  [/(?:\.|::)delete\s*\(|unlinkSync|rmSync|rmtree|clear-recyclebin|robocopy\b.*\/(?:mir|purge)/i, "เป็นคำสั่งลบไฟล์"],
  [/(?:^|[;|&(]\s*)format(?:\.com)?\s+[a-z]:|\b(?:format-volume|diskpart|cipher\s+\/w|bcdedit|vssadmin|clear-disk)\b/i, "เป็นคำสั่งที่ทำลายข้อมูล"],
  [/\breg(?:\.exe)?\s+(?:delete|add|import)|(?:set|new|remove)-itemproperty|\bHK(?:LM|CU|CR)\b|HKEY_/i, "เป็นคำสั่งแก้รีจิสทรี"],
  [/\b(?:shutdown|restart-computer|stop-computer|net\s+user|net\s+localgroup|takeown|icacls|set-executionpolicy|set-mppreference|netsh|schtasks|new-service|sc\.exe)\b/i, "เป็นคำสั่งเปลี่ยนการตั้งค่าระบบ"],
  [/-e(?:c|nc|ncodedcommand)?\s+[a-z0-9+/=]{16,}|frombase64string|invoke-expression|\biex\b|downloadstring|-verb\s+runas/i, "เป็นคำสั่งที่ซ่อนสิ่งที่จะทำ หรือขอสิทธิ์ผู้ดูแล"],
  [/\bgit\s+(?:push|reset\s+--hard|clean|filter-branch|branch\s+-D)\b/i, "เป็นคำสั่ง Git ที่ย้อนกลับไม่ได้"],
  [/\.env\b|\.ssh\b|id_rsa|id_ed25519|\.aws\b|\.git-credentials|\.npmrc|get-childitem\s+env:|\bgci\s+env:|\bdir\s+env:|\$env:\w*(?:key|token|secret|pass)/i, "แตะไฟล์หรือค่าที่อาจเป็นกุญแจ"],
  [/\b(?:cmdkey|vaultcmd|get-credential|convertfrom-securestring|mimikatz)\b/i, "แตะรหัสผ่านที่บันทึกไว้"]
];

/**
 * ตรวจคำสั่งจาก AI ก่อนแสดงการ์ดให้ผู้ใช้กดรัน
 * รายการนี้ช่วยกรองเท่านั้น ด่านจริงคือผู้ใช้อ่านคำสั่งบนการ์ดแล้วกดเอง
 */
export function checkCommand(input: unknown): PolicyResult<string> {
  if (typeof input !== "string" || !input.trim()) return deny("ไม่ได้ระบุคำสั่ง");
  const command = input.trim();
  if (command.length > MAX_COMMAND_LENGTH) return deny("คำสั่งยาวเกินไป");
  if (HIDDEN_CHARACTERS.test(command)) return deny("คำสั่งต้องอยู่ในบรรทัดเดียว และไม่มีอักขระซ่อน");
  // เครื่องหมาย ` ใน PowerShell ใช้คั่นกลางชื่อคำสั่งเพื่อหลบการตรวจได้
  if (command.includes("`")) return deny("ไม่อนุญาตเครื่องหมาย ` ในคำสั่ง");
  const hit = FORBIDDEN_COMMANDS.find(([pattern]) => pattern.test(command));
  return hit ? deny(hit[1]) : { ok: true, value: command };
}

/** ช่องกรอกที่ไม่พิมพ์ให้: รหัสผ่าน รหัสยืนยัน บัตร และบัญชีธนาคาร */
const SENSITIVE_FIELD = /pass(?:word|wd|code)?\b|รหัส|\botp\b|one-time|\bpin\b|cvv|cvc|\bcc-|card.?number|credit|เลขบัตร|บัตรเครดิต|iban|account.?number|เลขบัญชี|เลขประจำตัว|\bssn\b/i;
/** ปุ่มที่ไม่กดให้: จ่ายเงิน ลบ */
const FORBIDDEN_BUTTON = /\bpay\b|payment|checkout|check\s*out|place\s*order|buy\s*now|purchase|subscribe|donate|transfer|ชำระ|จ่ายเงิน|สั่งซื้อ|ซื้อเลย|ยืนยันการโอน|โอนเงิน|\bdelete\b|\bremove\b|ลบ/i;

export interface ElementFacts {
  tag: string;
  type: string;
  /** ข้อความและคำอธิบายทั้งหมดของส่วนนั้นในหน้าเว็บจริง */
  text: string;
  hasPassword: boolean;
  hasCard: boolean;
}

export function checkBrowserTarget(action: "click" | "type", facts: ElementFacts, value = ""): string | null {
  if (facts.hasPassword) return "หน้านี้มีช่องรหัสผ่าน ให้ผู้ใช้กรอกและกดเอง";
  if (facts.hasCard) return "หน้านี้มีช่องบัตรหรือการชำระเงิน ให้ผู้ใช้ทำเอง";
  if (action === "type") {
    if (facts.type === "password" || SENSITIVE_FIELD.test(facts.text)) return "ช่องนี้ใช้กรอกข้อมูลลับ ให้ผู้ใช้กรอกเอง";
    if (/\d{13,}/.test(value.replace(/[\s-]/g, ""))) return "ข้อความมีเลขยาวแบบเลขบัตรหรือเลขประจำตัว ให้ผู้ใช้กรอกเอง";
    return null;
  }
  return FORBIDDEN_BUTTON.test(facts.text) ? "ปุ่มนี้เกี่ยวกับการจ่ายเงินหรือการลบ ให้ผู้ใช้กดเอง" : null;
}
