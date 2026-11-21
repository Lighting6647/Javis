import {
  Cloud,
  ExternalLink,
  FolderGit2,
  Hammer,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Terminal,
  X
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchProjects,
  type ProjectAction,
  type ProjectActionResponse,
  type ProjectsListResponse,
  type ProjectSummary,
  runProjectActionRequest
} from "../services/projectsApi";

interface ProjectsPanelProps {
  onClose: () => void;
  onAskJavis: (prompt: string) => void;
  onOpenWeb?: (url: string) => void;
}

const SCRIPT_META: Record<"build" | "test" | "lint", { label: string; icon: typeof Hammer }> = {
  build: { label: "Build", icon: Hammer },
  test: { label: "Test", icon: Terminal },
  lint: { label: "Lint", icon: ShieldCheck }
};

export function ProjectsPanel({ onClose, onAskJavis, onOpenWeb }: ProjectsPanelProps) {
  const [data, setData] = useState<ProjectsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ProjectActionResponse | null>(null);

  const loadList = useCallback(async () => {
    try {
      const response = await fetchProjects();
      setData(response);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดรายการโปรเจกต์ไม่สำเร็จครับ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchProjects()
      .then((response) => {
        if (active) {
          setData(response);
          setError(null);
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "โหลดรายการโปรเจกต์ไม่สำเร็จครับ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAction = async (project: ProjectSummary, action: ProjectAction) => {
    const key = `${project.id}:${action}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      const result = await runProjectActionRequest(project.id, action);
      setLastResult(result);
      await loadList();
    } catch (cause) {
      setLastResult({
        ok: false,
        action,
        projectId: project.id,
        projectName: project.name,
        durationMs: 0,
        summary: cause instanceof Error ? cause.message : "ดำเนินคำสั่งไม่สำเร็จครับ"
      });
    } finally {
      setBusyKey(null);
    }
  };

  const projects = data?.projects ?? [];
  const categories = ["ทั้งหมด", ...new Set(projects.map((p) => p.category))];
  const filtered = projects.filter((p) => {
    if (category !== "ทั้งหมด" && p.category !== category) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.githubRepo?.toLowerCase().includes(q) ?? false) ||
      p.category.toLowerCase().includes(q)
    );
  });

  return (
    <section className="projects-hub" aria-label="ศูนย์ควบคุมโปรเจกต์ทั้งหมด">
      <div className="projects-head">
        <div>
          <h2>Project Control Hub</h2>
          <p>
            {data
              ? data.mode === "local"
                ? `โหมด Local Bridge — เชื่อมต่อ ${projects.filter((p) => p.localPresent).length} โปรเจกต์ในเครื่อง + Cloud API`
                : `โหมด Cloud Control — ดูสถานะ GitHub / Vercel และสั่งงานได้จากทุกอุปกรณ์`
              : "กำลังเชื่อมต่อรายการโปรเจกต์…"}
          </p>
        </div>
        <div className="projects-head-actions">
          <button
            type="button"
            className="studio-pill-btn"
            onClick={() => {
              setLoading(true);
              void loadList();
            }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : undefined} aria-hidden />
            <span>รีเฟรช</span>
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="กลับไปหน้าสนทนา">
            <X size={17} aria-hidden />
          </button>
        </div>
      </div>

      <div className="projects-toolbar">
        <label className="projects-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อโปรเจกต์ หรือ GitHub repo…"
            aria-label="ค้นหาโปรเจกต์"
          />
        </label>
        <div className="studio-tabs" role="tablist" aria-label="หมวดหมู่โปรเจกต์">
          {categories.slice(0, 6).map((cat) => (
            <button
              key={cat}
              type="button"
              className="studio-tab"
              aria-pressed={category === cat}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="toast error" role="alert">
          {error}
        </div>
      )}

      {lastResult && (
        <div className={`project-result-banner ${lastResult.ok ? "ok" : "error"}`} role="status">
          <div className="project-result-top">
            <strong>{lastResult.summary}</strong>
            <button type="button" className="icon-button" onClick={() => setLastResult(null)} aria-label="ปิดผลลัพธ์">
              <X size={15} aria-hidden />
            </button>
          </div>
          {lastResult.output && <pre className="project-output">{lastResult.output}</pre>}
        </div>
      )}

      {loading && !data ? (
        <div className="projects-grid">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
      ) : (
        <div className="projects-grid">
          {filtered.map((project) => (
            <article key={project.id} className="project-card">
              <div className="project-card-head">
                <div className="project-title-group">
                  <span className="project-cat">{project.category}</span>
                  <h3>{project.name}</h3>
                </div>
                {project.git?.hasGit ? (
                  <span className={`project-git-badge ${project.git.dirtyCount > 0 ? "dirty" : "clean"}`}>
                    <FolderGit2 size={13} aria-hidden />
                    {project.git.branch || "git"}
                    {project.git.dirtyCount > 0 ? ` • ${project.git.dirtyCount} แก้ไข` : " • สะอาด"}
                  </span>
                ) : (
                  <span className="project-git-badge muted">
                    {project.localPresent ? "โฟลเดอร์เครื่อง" : "Cloud"}
                  </span>
                )}
              </div>

              {project.githubRepo && <p className="project-repo">{project.githubRepo}</p>}

              <div className="project-actions">
                {project.scripts.map((script) => {
                  const meta = SCRIPT_META[script];
                  const Icon = meta.icon;
                  const busy = busyKey === `${project.id}:${script}`;
                  return (
                    <button
                      key={script}
                      type="button"
                      className="studio-pill-btn"
                      disabled={Boolean(busyKey)}
                      onClick={() => void handleAction(project, script)}
                    >
                      {busy ? <LoaderCircle size={13} className="spin" aria-hidden /> : <Icon size={13} aria-hidden />}
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
                {(project.githubRepo || project.vercelProject) && (
                  <button
                    type="button"
                    className="studio-pill-btn"
                    disabled={Boolean(busyKey)}
                    onClick={() => void handleAction(project, "cloud-status")}
                  >
                    {busyKey === `${project.id}:cloud-status` ? (
                      <LoaderCircle size={13} className="spin" aria-hidden />
                    ) : (
                      <Cloud size={13} aria-hidden />
                    )}
                    <span>Cloud</span>
                  </button>
                )}
                {project.vercelProject && (
                  <button
                    type="button"
                    className="studio-pill-btn"
                    disabled={Boolean(busyKey)}
                    onClick={() => void handleAction(project, "redeploy")}
                  >
                    {busyKey === `${project.id}:redeploy` ? (
                      <LoaderCircle size={13} className="spin" aria-hidden />
                    ) : (
                      <Rocket size={13} aria-hidden />
                    )}
                    <span>Redeploy</span>
                  </button>
                )}
                <button
                  type="button"
                  className="studio-pill-btn"
                  onClick={() => onAskJavis(`ช่วยสรุปสถานะโปรเจกต์ ${project.name} ทั้ง Git และออนไลน์ให้ฟังหน่อย`)}
                >
                  <MessageSquare size={13} aria-hidden />
                  <span>ถามลูน่า</span>
                </button>
                {project.webUrl && onOpenWeb && (
                  <button type="button" className="studio-pill-btn" onClick={() => onOpenWeb(project.webUrl!)}>
                    <ExternalLink size={13} aria-hidden />
                    <span>เปิดเว็บ</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
