import { spawn } from "node:child_process";
import { type CloudProjectStatus, fetchProjectCloudStatus, triggerProjectRedeploy } from "./cloudControl.js";
import { type ProjectAction, type ProjectScriptAction, type ProjectSummary, resolveLocalRootDir, resolveSafeProjectDir } from "./projects.js";
import { sanitizeUpstreamMessage } from "./upstreamError.js";

const SCRIPT_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_CHARS = 1_800;

export interface ProjectActionResult {
  ok: boolean;
  action: ProjectAction;
  projectId: string;
  projectName: string;
  durationMs: number;
  summary: string;
  output?: string;
  cloud?: CloudProjectStatus;
}

function runNpmScript(projectDir: string, script: ProjectScriptAction, timeoutMs = SCRIPT_TIMEOUT_MS): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const command = isWin ? process.env.ComSpec || "cmd.exe" : "npm";
    const args = isWin ? ["/d", "/s", "/c", "npm.cmd", "run", script] : ["run", script];
    const child = spawn(command, args, {
      cwd: projectDir,
      shell: false,
      windowsHide: true,
      env: { ...process.env, CI: "true" }
    });

    let combined = "";
    let timedOut = false;
    const append = (chunk: Buffer) => {
      combined += chunk.toString("utf8");
      if (combined.length > MAX_OUTPUT_CHARS * 4) {
        combined = combined.slice(-MAX_OUTPUT_CHARS * 2);
      }
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, output: error.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const tail = sanitizeUpstreamMessage(combined).trim().slice(-MAX_OUTPUT_CHARS);
      if (timedOut) {
        resolve({ code: 124, output: `${tail ? `${tail}\n` : ""}(คำสั่งใช้เวลาเกินกำหนด ${Math.round(timeoutMs / 1000)} วินาที)` });
        return;
      }
      resolve({ code: code ?? 1, output: tail });
    });
  });
}

/** รันคำสั่งที่อยู่ในรายการอนุญาต (Allowlist) เท่านั้น ห้ามรับคำสั่ง shell อิสระ */
export async function runProjectAction(
  project: ProjectSummary,
  action: ProjectAction,
  options: { rootDir?: string | null; scriptRunner?: typeof runNpmScript } = {}
): Promise<ProjectActionResult> {
  const started = Date.now();

  if (action === "cloud-status") {
    const cloud = await fetchProjectCloudStatus(project);
    const parts: string[] = [];
    if (cloud.github.repo) {
      parts.push(
        cloud.github.reachable
          ? `GitHub (${cloud.github.repo}): ${cloud.github.latestCommitMessage ?? "ปกติ"}${cloud.github.ciConclusion ? ` [CI: ${cloud.github.ciConclusion}]` : ""}`
          : `GitHub (${cloud.github.repo}): ${cloud.github.note}`
      );
    }
    if (cloud.vercel.project) {
      parts.push(
        cloud.vercel.state
          ? `Vercel (${cloud.vercel.project}): ${cloud.vercel.state}`
          : `Vercel (${cloud.vercel.project}): ${cloud.vercel.note}`
      );
    }
    return {
      ok: cloud.github.reachable || Boolean(cloud.vercel.state),
      action,
      projectId: project.id,
      projectName: project.name,
      durationMs: Date.now() - started,
      summary: parts.join(" | ") || "ยังไม่ได้ผูกข้อมูล Cloud ของโปรเจกต์นี้",
      cloud
    };
  }

  if (action === "redeploy") {
    const outcome = await triggerProjectRedeploy(project);
    return {
      ok: outcome.ok,
      action,
      projectId: project.id,
      projectName: project.name,
      durationMs: Date.now() - started,
      summary: outcome.detail,
      ...(outcome.url ? { output: `URL: ${outcome.url}` } : {})
    };
  }

  const rootDir = options.rootDir !== undefined ? options.rootDir : resolveLocalRootDir();
  if (!rootDir) {
    return {
      ok: false,
      action,
      projectId: project.id,
      projectName: project.name,
      durationMs: Date.now() - started,
      summary: `คำสั่ง ${action} รันได้เฉพาะในโหมด Local/Desktop บนเครื่องของคุณไลท์ครับ (ตอนนี้เซิร์ฟเวอร์ทำงานบน Cloud)`
    };
  }

  const projectDir = project.folderName ? resolveSafeProjectDir(rootDir, project.folderName) : null;
  if (!projectDir || !project.localPresent) {
    return {
      ok: false,
      action,
      projectId: project.id,
      projectName: project.name,
      durationMs: Date.now() - started,
      summary: `ไม่พบโฟลเดอร์ของโปรเจกต์ ${project.name} ในเครื่องครับ`
    };
  }

  if (!project.scripts.includes(action)) {
    return {
      ok: false,
      action,
      projectId: project.id,
      projectName: project.name,
      durationMs: Date.now() - started,
      summary: `โปรเจกต์ ${project.name} ไม่มีสคริปต์ "${action}" ใน package.json ครับ`
    };
  }

  const runner = options.scriptRunner ?? runNpmScript;
  const result = await runner(projectDir, action);
  return {
    ok: result.code === 0,
    action,
    projectId: project.id,
    projectName: project.name,
    durationMs: Date.now() - started,
    summary:
      result.code === 0
        ? `รัน ${action} ของโปรเจกต์ ${project.name} ผ่านเรียบร้อยครับ`
        : `รัน ${action} ของโปรเจกต์ ${project.name} ไม่ผ่าน (exit ${result.code})`,
    output: result.output
  };
}
