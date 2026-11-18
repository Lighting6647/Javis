import { API_BASE } from "./http";
import { sessionStore } from "./sessionStore";

export type ProjectScriptAction = "build" | "test" | "lint";
export type ProjectAction = ProjectScriptAction | "cloud-status" | "redeploy";

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

export interface ProjectsListResponse {
  ok: boolean;
  mode: "local" | "cloud";
  githubConfigured: boolean;
  vercelConfigured: boolean;
  projects: ProjectSummary[];
}

export interface CloudStatusPayload {
  github: {
    configured: boolean;
    reachable: boolean;
    repo: string | null;
    latestCommitMessage: string | null;
    latestCommitDate: string | null;
    ciConclusion: string | null;
    htmlUrl: string | null;
    note: string;
  };
  vercel: {
    configured: boolean;
    project: string | null;
    state: string | null;
    url: string | null;
    note: string;
  };
}

export interface ProjectActionResponse {
  ok: boolean;
  action: ProjectAction;
  projectId: string;
  projectName: string;
  durationMs: number;
  summary: string;
  output?: string;
  cloud?: CloudStatusPayload;
}

export async function fetchProjects(): Promise<ProjectsListResponse> {
  const response = await fetch(`${API_BASE}/api/projects`, {
    headers: sessionStore.authHeaders()
  });
  if (response.status === 401) {
    sessionStore.clear();
    throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
  }
  if (!response.ok) {
    throw new Error("ไม่สามารถโหลดรายการโปรเจกต์ได้ครับ");
  }
  return (await response.json()) as ProjectsListResponse;
}

export async function runProjectActionRequest(
  projectId: string,
  action: ProjectAction
): Promise<ProjectActionResponse> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...sessionStore.authHeaders()
    },
    body: JSON.stringify({ action })
  });
  if (response.status === 401) {
    sessionStore.clear();
    throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
  }
  const payload = (await response.json()) as ProjectActionResponse;
  return payload;
}
