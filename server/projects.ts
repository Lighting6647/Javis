import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProjectScriptAction = "build" | "test" | "lint";
export type ProjectAction = ProjectScriptAction | "cloud-status" | "redeploy";

export interface ProjectCatalogEntry {
  id: string;
  name: string;
  category: string;
  folderName?: string;
  githubRepo?: string;
  vercelProject?: string;
  webUrl?: string;
  aliases?: string[];
}

export interface ProjectGitStatus {
  hasGit: boolean;
  branch: string | null;
  dirtyCount: number;
  summary: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  category: string;
  folderName: string | null;
  localPresent: boolean;
  githubRepo: string | null;
  vercelProject: string | null;
  webUrl: string | null;
  scripts: ProjectScriptAction[];
  availableActions: ProjectAction[];
  git: ProjectGitStatus | null;
}

export interface ProjectHubListing {
  mode: "local" | "cloud";
  rootDir: string | null;
  projects: ProjectSummary[];
}

const DEFAULT_LOCAL_ROOT = "d:\\AI\\Light";
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const ALLOWED_SCRIPTS: readonly ProjectScriptAction[] = ["build", "test", "lint"];

/** ทะเบียนโปรเจกต์ทั้งหมดของทีม/องค์กร (รองรับทั้งโหมด Local และ Cloud บน Vercel) */
export const DEFAULT_PROJECT_CATALOG: readonly ProjectCatalogEntry[] = [
  {
    id: "javis",
    name: "Javis",
    category: "Assistant & AI",
    folderName: "Javis",
    githubRepo: "Lighting6647/Javis",
    vercelProject: "javis",
    webUrl: "https://javis-bice.vercel.app",
    aliases: ["จาวิส", "voice studio"]
  },
  {
    id: "sale-page-light",
    name: "Sale page Light",
    category: "Marketing & Web",
    folderName: "Sale page Light",
    githubRepo: "Lighting6647/Sales-Page-Structure-and-Concept",
    aliases: ["sale page", "เซลเพจ"]
  },
  {
    id: "tamsang",
    name: "Tamsang",
    category: "POS & Commerce",
    folderName: "Tamsang",
    githubRepo: "Lighting6647/Tamsang-POS",
    aliases: ["ตามสั่ง", "pos"]
  },
  {
    id: "fitness",
    name: "Fitness",
    category: "Operations & Wellness",
    folderName: "Fitness",
    githubRepo: "Lighting6647/Fitness",
    aliases: ["ฟิตเนส"]
  },
  {
    id: "inventory-ai-light",
    name: "Inventoty AI Light",
    category: "Inventory & AI",
    folderName: "Inventoty AI Light",
    githubRepo: "Lighting6647/inventory",
    aliases: ["inventory", "สต็อก", "คลังสินค้า"]
  },
  {
    id: "ios-asset-light",
    name: "IOS,Asset Light",
    category: "Assets & Devices",
    folderName: "IOS,Asset Light",
    githubRepo: "fernclinicit-bit/ios-device-monitor",
    aliases: ["ios", "asset", "device monitor", "อุปกรณ์"]
  },
  {
    id: "remote-light",
    name: "Remote Light",
    category: "Operations & Support",
    folderName: "Remote Light",
    githubRepo: "fernclinicit-bit/organization-remote-support",
    aliases: ["remote", "รีโมท"]
  },
  {
    id: "tracking-light",
    name: "Tracking Light",
    category: "Operations & Tasks",
    folderName: "Tracking Light",
    githubRepo: "Lighting6647/team-task-tracking",
    aliases: ["tracking", "ติดตามงาน"]
  },
  {
    id: "dashboard-light",
    name: "แดชบอร์ด Light",
    category: "Analytics & Dashboard",
    folderName: "แดชบอร์ด Light",
    githubRepo: "fernclinicit-bit/it-monthly-dashboard",
    aliases: ["dashboard", "แดชบอร์ด"]
  },
  {
    id: "accounting-light",
    name: "บัญชี Light",
    category: "Finance & Admin",
    folderName: "บัญชี Light",
    aliases: ["บัญชี", "accounting"]
  },
  {
    id: "ceo",
    name: "CEO",
    category: "Assistant & AI",
    folderName: "CEO",
    githubRepo: "fernclinicit-bit/CEO"
  },
  {
    id: "all-chat-light",
    name: "All Chat Light",
    category: "Communication",
    folderName: "All Chat Light",
    githubRepo: "fernclinicit-bit/fern-clinic-chat-app",
    aliases: ["all chat", "แชท"]
  },
  {
    id: "pass-app-light",
    name: "Pass App Light",
    category: "Security & Access",
    folderName: "Pass App Light",
    githubRepo: "fernclinicit-bit/Pass-App",
    aliases: ["pass app", "password"]
  },
  {
    id: "ad-manager-light",
    name: "Ad Manager Light",
    category: "Marketing & Web",
    folderName: "Ad Manager Light",
    aliases: ["ad manager", "โฆษณา"]
  },
  {
    id: "tikkethub",
    name: "บัตรคอน Light",
    category: "POS & Commerce",
    folderName: "บัตรคอน Light",
    githubRepo: "Lighting6647/Tikkethub",
    aliases: ["tikkethub", "ticket", "บัตรคอนเสิร์ต"]
  },
  {
    id: "tour",
    name: "ทัวร์",
    category: "Operations & Events",
    folderName: "ทัวร์",
    githubRepo: "Lighting6647/vnt-event-app",
    aliases: ["vnt", "event"]
  },
  {
    id: "quotation-light",
    name: "ใบเสนอรา Light",
    category: "Finance & Admin",
    folderName: "ใบเสนอรา Light",
    aliases: ["ใบเสนอราคา", "quotation"]
  }
];

/** แปลง URL ของ git remote (https หรือ ssh) เป็น owner/repo โดยตัดข้อมูลยืนยันตัวตนออกทั้งหมด */
export function parseGitHubRepo(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  const sshMatch = /^git@github\.com:([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (sshMatch) {
    return GITHUB_REPO_PATTERN.test(sshMatch[1]) ? sshMatch[1] : null;
  }

  try {
    const url = new URL(trimmed);
    if (!/^(?:www\.)?github\.com$/i.test(url.hostname)) return null;
    const cleaned = url.pathname.replace(/^\/+|(?:\.git|\/)+$/g, "");
    return GITHUB_REPO_PATTERN.test(cleaned) ? cleaned : null;
  } catch {
    return null;
  }
}

/** ตรวจว่าชื่อโฟลเดอร์ไม่มี path traversal และอยู่ใน rootDir จริงเท่านั้น */
export function resolveSafeProjectDir(rootDir: string, folderName: string): string | null {
  if (!folderName || folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
    return null;
  }
  const base = path.resolve(rootDir);
  const target = path.resolve(base, folderName);
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (!target.startsWith(prefix)) return null;
  return target;
}

export function resolveLocalRootDir(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL === "1" || env.VERCEL === "true") return null;
  if (env.JAVIS_LOCAL_PROJECTS?.trim().toLowerCase() === "false") return null;
  const candidate = env.JAVIS_PROJECT_ROOT?.trim() || DEFAULT_LOCAL_ROOT;
  return existsSync(candidate) ? path.resolve(candidate) : null;
}

function readPackageScripts(projectDir: string): ProjectScriptAction[] {
  const pkgPath = path.join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, unknown> };
    if (!raw.scripts || typeof raw.scripts !== "object") return [];
    return ALLOWED_SCRIPTS.filter((script) => typeof raw.scripts?.[script] === "string");
  } catch {
    return [];
  }
}

async function readGitRemoteRepo(projectDir: string): Promise<string | null> {
  if (!existsSync(path.join(projectDir, ".git"))) return null;
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectDir, "remote", "get-url", "origin"], {
      timeout: 2500,
      windowsHide: true
    });
    return parseGitHubRepo(stdout);
  } catch {
    return null;
  }
}

export async function readLocalGitStatus(projectDir: string): Promise<ProjectGitStatus> {
  if (!existsSync(path.join(projectDir, ".git"))) {
    return { hasGit: false, branch: null, dirtyCount: 0, summary: null };
  }
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectDir, "status", "--short", "--branch"], {
      timeout: 3000,
      windowsHide: true
    });
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    const header = lines[0]?.startsWith("## ") ? lines[0].slice(3) : null;
    const branch = header ? header.split("...")[0]?.trim() ?? null : null;
    const changes = lines.filter((line) => !line.startsWith("## "));
    const summary = branch
      ? changes.length > 0
        ? `${branch} (แก้ไขค้าง ${changes.length} ไฟล์)`
        : `${branch} (สะอาด)`
      : null;
    return { hasGit: true, branch, dirtyCount: changes.length, summary };
  } catch {
    return { hasGit: true, branch: null, dirtyCount: 0, summary: "อ่านสถานะ git ไม่สำเร็จ" };
  }
}

function loadCustomCatalog(env: NodeJS.ProcessEnv): ProjectCatalogEntry[] {
  const raw = env.JAVIS_PROJECTS_JSON?.trim();
  if (!raw) return [...DEFAULT_PROJECT_CATALOG];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_PROJECT_CATALOG];
    const entries: ProjectCatalogEntry[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.id !== "string" || typeof obj.name !== "string") continue;
      entries.push({
        id: obj.id.trim().slice(0, 80),
        name: obj.name.trim().slice(0, 120),
        category: typeof obj.category === "string" ? obj.category.trim().slice(0, 60) : "Workspace",
        ...(typeof obj.folderName === "string" ? { folderName: obj.folderName.trim() } : {}),
        ...(typeof obj.githubRepo === "string" && GITHUB_REPO_PATTERN.test(obj.githubRepo.trim())
          ? { githubRepo: obj.githubRepo.trim() }
          : {}),
        ...(typeof obj.vercelProject === "string" ? { vercelProject: obj.vercelProject.trim() } : {}),
        ...(typeof obj.webUrl === "string" && obj.webUrl.startsWith("https://") ? { webUrl: obj.webUrl.trim() } : {})
      });
    }
    return entries.length > 0 ? entries : [...DEFAULT_PROJECT_CATALOG];
  } catch {
    return [...DEFAULT_PROJECT_CATALOG];
  }
}

function slugifyFolder(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `proj-${Buffer.from(name).toString("hex").slice(0, 8)}`;
}

/** รายการโปรเจกต์ทั้งหมด พร้อมสถานะ Git และคำสั่งที่อนุญาตในสภาพแวดล้อมปัจจุบัน */
export async function listProjects(
  options: { env?: NodeJS.ProcessEnv; rootDir?: string | null; includeGit?: boolean } = {}
): Promise<ProjectHubListing> {
  const env = options.env ?? process.env;
  const rootDir = options.rootDir !== undefined ? options.rootDir : resolveLocalRootDir(env);
  const catalog = loadCustomCatalog(env);
  const includeGit = options.includeGit ?? true;

  if (!rootDir) {
    return {
      mode: "cloud",
      rootDir: null,
      projects: catalog.map((entry) => {
        const actions: ProjectAction[] = [
          ...(entry.githubRepo || entry.vercelProject ? (["cloud-status"] as const) : []),
          ...(entry.vercelProject ? (["redeploy"] as const) : [])
        ];
        return {
          id: entry.id,
          name: entry.name,
          category: entry.category,
          folderName: entry.folderName ?? null,
          localPresent: false,
          githubRepo: entry.githubRepo ?? null,
          vercelProject: entry.vercelProject ?? null,
          webUrl: entry.webUrl ?? null,
          scripts: [],
          availableActions: actions,
          git: null
        };
      })
    };
  }

  const folderEntries = new Map<string, ProjectCatalogEntry>();
  for (const entry of catalog) {
    if (entry.folderName) folderEntries.set(entry.folderName, entry);
  }

  // ผนวกรวมโฟลเดอร์ใหม่ที่อาจเพิ่มใน workspace โดยไม่อ่านไฟล์ลับ
  try {
    const dirs = readdirSync(rootDir, { withFileTypes: true }).filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith("."));
    for (const dirent of dirs) {
      if (!folderEntries.has(dirent.name) && dirent.name !== "Make" && !dirent.name.endsWith("-backup")) {
        folderEntries.set(dirent.name, {
          id: slugifyFolder(dirent.name),
          name: dirent.name,
          category: "Workspace",
          folderName: dirent.name
        });
      }
    }
  } catch {
    // อ่านโฟลเดอร์ไม่สำเร็จ ใช้ทะเบียนพื้นฐานต่อได้
  }

  const allEntries = [...catalog, ...[...folderEntries.values()].filter((entry) => !catalog.some((c) => c.id === entry.id))];

  const projects = await Promise.all(
    allEntries.map(async (entry): Promise<ProjectSummary> => {
      const safeDir = entry.folderName ? resolveSafeProjectDir(rootDir, entry.folderName) : null;
      const localPresent = Boolean(safeDir && existsSync(safeDir));
      const scripts = localPresent && safeDir ? readPackageScripts(safeDir) : [];
      const detectedRepo = entry.githubRepo ?? (localPresent && safeDir ? await readGitRemoteRepo(safeDir) : null);
      const git = localPresent && safeDir && includeGit ? await readLocalGitStatus(safeDir) : null;
      const availableActions: ProjectAction[] = [
        ...scripts,
        ...(detectedRepo || entry.vercelProject ? (["cloud-status"] as const) : []),
        ...(entry.vercelProject ? (["redeploy"] as const) : [])
      ];

      return {
        id: entry.id,
        name: entry.name,
        category: entry.category,
        folderName: entry.folderName ?? null,
        localPresent,
        githubRepo: detectedRepo ?? null,
        vercelProject: entry.vercelProject ?? null,
        webUrl: entry.webUrl ?? null,
        scripts,
        availableActions,
        git
      };
    })
  );

  return { mode: "local", rootDir, projects };
}

/** ค้นหาโปรเจกต์จากรหัส ชื่อ โฟลเดอร์ หรือ alias เช่น "tamsang", "บัญชี", "inventory" */
export function findProject(query: string, projects: readonly ProjectSummary[]): ProjectSummary | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const exact = projects.find(
    (p) =>
      p.id.toLowerCase() === needle ||
      p.name.toLowerCase() === needle ||
      p.folderName?.toLowerCase() === needle ||
      p.githubRepo?.toLowerCase() === needle
  );
  if (exact) return exact;

  const catalogById = new Map(DEFAULT_PROJECT_CATALOG.map((item) => [item.id, item]));
  return (
    projects.find((p) => {
      const cat = catalogById.get(p.id);
      if (cat?.aliases?.some((alias) => alias.toLowerCase().includes(needle) || needle.includes(alias.toLowerCase()))) {
        return true;
      }
      return p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle);
    }) ?? null
  );
}
