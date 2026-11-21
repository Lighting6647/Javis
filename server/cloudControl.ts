import type { ProjectSummary } from "./projects.js";

export interface GitHubStatusSummary {
  configured: boolean;
  reachable: boolean;
  repo: string | null;
  branch: string | null;
  latestCommitMessage: string | null;
  latestCommitDate: string | null;
  ciConclusion: string | null;
  htmlUrl: string | null;
  note: string;
}

export interface VercelStatusSummary {
  configured: boolean;
  project: string | null;
  state: string | null;
  url: string | null;
  createdAt: number | null;
  note: string;
}

export interface CloudProjectStatus {
  github: GitHubStatusSummary;
  vercel: VercelStatusSummary;
}

export interface RedeployOutcome {
  ok: boolean;
  detail: string;
  url?: string;
  state?: string;
}

export interface CloudControlOptions {
  githubToken?: string;
  vercelToken?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const CLOUD_TIMEOUT_MS = 6000;
const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "javis-project-hub"
};

function combineTimeout(callerSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(CLOUD_TIMEOUT_MS);
  return callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
}

/** ดึงสถานะ GitHub ล่าสุด (Commit + Actions) และ Vercel Deployment ล่าสุดของโปรเจกต์ */
export async function fetchProjectCloudStatus(
  project: Pick<ProjectSummary, "githubRepo" | "vercelProject" | "name">,
  options: CloudControlOptions = {}
): Promise<CloudProjectStatus> {
  const fetchFn = options.fetchImpl ?? fetch;
  const githubToken = (options.githubToken ?? process.env.GITHUB_TOKEN ?? "").trim();
  const vercelToken = (options.vercelToken ?? process.env.VERCEL_TOKEN ?? "").trim();
  const signal = combineTimeout(options.signal);

  let github: GitHubStatusSummary;
  if (!project.githubRepo) {
    github = {
      configured: Boolean(githubToken),
      reachable: false,
      repo: null,
      branch: null,
      latestCommitMessage: null,
      latestCommitDate: null,
      ciConclusion: null,
      htmlUrl: null,
      note: "โปรเจกต์นี้ยังไม่ได้ผูก GitHub repository"
    };
  } else {
    const headers: Record<string, string> = {
      ...GITHUB_HEADERS,
      ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {})
    };
    try {
      const [commitsRes, runsRes] = await Promise.all([
        fetchFn(`https://api.github.com/repos/${project.githubRepo}/commits?per_page=1`, { headers, signal }),
        fetchFn(`https://api.github.com/repos/${project.githubRepo}/actions/runs?per_page=1`, { headers, signal }).catch(() => null)
      ]);
      if (!commitsRes.ok) {
        const hint = commitsRes.status === 404 || commitsRes.status === 401
          ? githubToken
            ? "ไม่พบ repo หรือสิทธิ์ GITHUB_TOKEN ไม่เพียงพอ"
            : "Repo ส่วนตัว ต้องตั้งค่า GITHUB_TOKEN เพื่อเข้าถึงข้อมูล"
          : `GitHub API ตอบสถานะ ${commitsRes.status}`;
        github = {
          configured: Boolean(githubToken),
          reachable: false,
          repo: project.githubRepo,
          branch: null,
          latestCommitMessage: null,
          latestCommitDate: null,
          ciConclusion: null,
          htmlUrl: `https://github.com/${project.githubRepo}`,
          note: hint
        };
      } else {
        const commits = (await commitsRes.json()) as Array<{
          sha?: string;
          html_url?: string;
          commit?: { message?: string; author?: { date?: string } };
        }>;
        const latest = commits[0];
        let ciConclusion: string | null = null;
        if (runsRes?.ok) {
          const runsPayload = (await runsRes.json()) as {
            workflow_runs?: Array<{ conclusion?: string | null; status?: string | null; head_branch?: string | null }>;
          };
          const firstRun = runsPayload.workflow_runs?.[0];
          ciConclusion = firstRun?.conclusion || firstRun?.status || null;
        }
        github = {
          configured: Boolean(githubToken),
          reachable: true,
          repo: project.githubRepo,
          branch: null,
          latestCommitMessage: latest?.commit?.message?.split("\n")[0]?.slice(0, 120) ?? null,
          latestCommitDate: latest?.commit?.author?.date ?? null,
          ciConclusion,
          htmlUrl: latest?.html_url ?? `https://github.com/${project.githubRepo}`,
          note: "เชื่อมต่อ GitHub สำเร็จ"
        };
      }
    } catch {
      github = {
        configured: Boolean(githubToken),
        reachable: false,
        repo: project.githubRepo,
        branch: null,
        latestCommitMessage: null,
        latestCommitDate: null,
        ciConclusion: null,
        htmlUrl: `https://github.com/${project.githubRepo}`,
        note: "เชื่อมต่อ GitHub ไม่สำเร็จชั่วคราว"
      };
    }
  }

  let vercel: VercelStatusSummary;
  if (!vercelToken || !project.vercelProject) {
    vercel = {
      configured: Boolean(vercelToken),
      project: project.vercelProject ?? null,
      state: null,
      url: null,
      createdAt: null,
      note: !project.vercelProject
        ? "ยังไม่ได้ผูกชื่อโปรเจกต์ Vercel"
        : "ยังไม่ได้ตั้งค่า VERCEL_TOKEN บนเซิร์ฟเวอร์"
    };
  } else {
    try {
      const res = await fetchFn(
        `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(project.vercelProject)}&limit=1`,
        {
          headers: { Authorization: `Bearer ${vercelToken}` },
          signal
        }
      );
      if (!res.ok) {
        vercel = {
          configured: true,
          project: project.vercelProject,
          state: null,
          url: null,
          createdAt: null,
          note: `Vercel API ตอบสถานะ ${res.status}`
        };
      } else {
        const data = (await res.json()) as {
          deployments?: Array<{ state?: string; readyState?: string; url?: string; createdAt?: number }>;
        };
        const latest = data.deployments?.[0];
        vercel = {
          configured: true,
          project: project.vercelProject,
          state: latest?.readyState ?? latest?.state ?? null,
          url: latest?.url ? `https://${latest.url}` : null,
          createdAt: latest?.createdAt ?? null,
          note: latest ? "ดึงสถานะ Vercel ล่าสุดสำเร็จ" : "ยังไม่มีประวัติการ Deploy บน Vercel"
        };
      }
    } catch {
      vercel = {
        configured: true,
        project: project.vercelProject,
        state: null,
        url: null,
        createdAt: null,
        note: "เชื่อมต่อ Vercel API ไม่สำเร็จชั่วคราว"
      };
    }
  }

  return { github, vercel };
}

/** สั่ง Redeploy โปรเจกต์บน Vercel จาก Deployment ล่าสุด (ต้องมี VERCEL_TOKEN และผู้ใช้ยืนยันแล้วเท่านั้น) */
export async function triggerProjectRedeploy(
  project: Pick<ProjectSummary, "vercelProject" | "name">,
  options: CloudControlOptions = {}
): Promise<RedeployOutcome> {
  const fetchFn = options.fetchImpl ?? fetch;
  const vercelToken = (options.vercelToken ?? process.env.VERCEL_TOKEN ?? "").trim();
  const signal = combineTimeout(options.signal);

  if (!vercelToken) {
    return { ok: false, detail: "ยังไม่ได้ตั้งค่า VERCEL_TOKEN บนเซิร์ฟเวอร์ จึงยังสั่ง Redeploy ออนไลน์ไม่ได้ค่ะ" };
  }
  if (!project.vercelProject) {
    return { ok: false, detail: `โปรเจกต์ ${project.name} ยังไม่ได้ผูกชื่อโปรเจกต์ Vercel ค่ะ` };
  }

  try {
    const listRes = await fetchFn(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(project.vercelProject)}&limit=1`,
      {
        headers: { Authorization: `Bearer ${vercelToken}` },
        signal
      }
    );
    if (!listRes.ok) {
      return { ok: false, detail: `ไม่สามารถอ่านรายการ Deployment ของ Vercel ได้ (สถานะ ${listRes.status})` };
    }
    const listData = (await listRes.json()) as {
      deployments?: Array<{ uid?: string; name?: string; target?: string | null }>;
    };
    const latest = listData.deployments?.[0];
    if (!latest?.uid || !latest.name) {
      return { ok: false, detail: `ยังไม่มี Deployment ก่อนหน้าของโปรเจกต์ ${project.vercelProject} ให้สั่ง Redeploy` };
    }

    const deployRes = await fetchFn("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: latest.name,
        deploymentId: latest.uid,
        target: latest.target ?? "production"
      }),
      signal
    });
    if (!deployRes.ok) {
      return { ok: false, detail: `Vercel ปฏิเสธคำสั่ง Redeploy (สถานะ ${deployRes.status})` };
    }
    const deployed = (await deployRes.json()) as { url?: string; readyState?: string };
    const url = deployed.url ? `https://${deployed.url}` : undefined;
    return {
      ok: true,
      detail: `สั่ง Redeploy โปรเจกต์ ${project.name} บน Vercel สำเร็จแล้วค่ะ`,
      ...(url ? { url } : {}),
      ...(deployed.readyState ? { state: deployed.readyState } : {})
    };
  } catch {
    return { ok: false, detail: "เชื่อมต่อ Vercel API เพื่อสั่ง Redeploy ไม่สำเร็จ" };
  }
}
