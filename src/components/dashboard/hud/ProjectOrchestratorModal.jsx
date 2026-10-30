import { useState, useEffect, useCallback } from 'react';
import {
  X,
  FolderOpen,
  FileCode,
  GitBranch,
  UploadCloud,
  RefreshCw,
  Sparkles,
  Save,
  Terminal,
} from 'lucide-react';
import { playClickSound, playSuccessSound, playAlertSound } from '../../../utils/soundEffects';

export function ProjectOrchestratorModal({ isOpen, onClose, initialProject = 'CEO' }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(initialProject);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [gitOutput, setGitOutput] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const loadFileContent = useCallback(async (relPath) => {
    setSelectedFile(relPath);
    setIsLoading(true);
    try {
      const res = await fetch('/api/projects/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_file', projectName: selectedProject, filePath: relPath }),
      });
      const data = await res.json();
      if (data.success) {
        setFileContent(data.content);
        setStatusMessage(`โหลดไฟล์ ${relPath} สำเร็จ`);
      } else {
        setStatusMessage(`ไม่สามารถเปิดไฟล์: ${data.error}`);
      }
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProject]);

  // Fetch all 18 projects in D:\Light on mount
  useEffect(() => {
    if (!isOpen) return;
    const loadProjects = async () => {
      try {
        const res = await fetch('/api/projects/list');
        const data = await res.json();
        if (data.success && data.projects) {
          setProjects(data.projects);
          if (!selectedProject && data.projects.length > 0) {
            setSelectedProject(data.projects[0].name);
          }
        }
      } catch (err) {
        console.error('[Load Projects Error]:', err);
      }
    };
    loadProjects();
  }, [isOpen, selectedProject]);

  // Fetch files when selectedProject changes
  useEffect(() => {
    if (!selectedProject || !isOpen) return;
    const loadFiles = async () => {
      setIsLoading(true);
      setFiles([]);
      setSelectedFile('');
      setFileContent('');
      setGitOutput('');
      setAiAnalysis('');
      try {
        const res = await fetch('/api/projects/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list_files', projectName: selectedProject }),
        });
        const data = await res.json();
        if (data.success && data.files) {
          setFiles(data.files);
          // auto-select package.json or first file
          const pkg = data.files.find((f) => f.name === 'package.json') || data.files.find((f) => !f.isDirectory);
          if (pkg) {
            loadFileContent(pkg.relPath);
          }
        }
      } catch (err) {
        console.error('[Load Files Error]:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadFiles();
  }, [selectedProject, isOpen, loadFileContent]);

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    playClickSound();
    setIsSaving(true);
    try {
      const res = await fetch('/api/projects/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_file',
          projectName: selectedProject,
          filePath: selectedFile,
          content: fileContent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        playSuccessSound();
        setStatusMessage(`บันทึกโค้ดสำเร็จ! สร้างไฟล์สำรองที่ ${data.backup}`);
      } else {
        playAlertSound();
        setStatusMessage(`บันทึกไม่สำเร็จ: ${data.error}`);
      }
    } catch (err) {
      playAlertSound();
      setStatusMessage(`Save Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiAnalyze = async () => {
    if (!fileContent) return;
    playClickSound();
    setIsAnalyzing(true);
    setAiAnalysis('');
    try {
      const prompt = `ช่วยวิเคราะห์โค้ดไฟล์ ${selectedFile} ในโปรเจกต์ ${selectedProject} ของ sir ไลท์ สรุปจุดสำคัญและแนะนำวิธีปรับปรุงให้มีประสิทธิภาพสูงสุด:
\`\`\`
${fileContent.slice(0, 4000)}
\`\`\``;

      const res = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context: `Project: ${selectedProject}` }),
      });
      const data = await res.json();
      if (data.success && data.reply) {
        playSuccessSound();
        setAiAnalysis(data.reply);
      } else {
        playAlertSound();
        setAiAnalysis(data.error || 'วิเคราะห์ไม่สำเร็จ');
      }
    } catch (err) {
      playAlertSound();
      setAiAnalysis(`Error: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGitPush = async () => {
    playClickSound();
    setIsPushing(true);
    setGitOutput('');
    try {
      const res = await fetch('/api/projects/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'git_push',
          projectName: selectedProject,
          commitMessage: `[J.A.R.V.I.S.] Auto-update for ${selectedProject} by sir ไลท์`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        playSuccessSound();
        setGitOutput(data.output || 'Git push executed successfully!');
        setStatusMessage(`Push โปรเจกต์ ${selectedProject} ขึ้น GitHub สำเร็จ!`);
      } else {
        playAlertSound();
        setGitOutput(data.error || data.output || 'Git push failed');
        setStatusMessage(`Push ไม่สำเร็จ: ${data.error || 'โปรดตรวจสอบการล็อกอิน Git'}`);
      }
    } catch (err) {
      playAlertSound();
      setGitOutput(`Error: ${err.message}`);
    } finally {
      setIsPushing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 md:p-6 backdrop-blur-md animate-fade-in text-slate-200">
      <div className="relative w-full max-w-6xl h-[88vh] flex flex-col rounded-2xl border-2 border-cyan-400/90 bg-[#020b22]/98 shadow-[0_0_70px_rgba(0,240,255,0.4)] backdrop-blur-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/30 px-5 py-3.5 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-2">
                18-PROJECT AUTONOMOUS CODE ORCHESTRATOR
                <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/40 font-mono">
                  D:\LIGHT ECOSYSTEM
                </span>
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">PHASE 2 & 3: FILE BRIDGE, CODE EDITOR & GITHUB PIPELINE</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-cyan-950/50 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Grid: Left Projects / Middle Files / Right Editor */}
        <div className="flex-1 flex overflow-hidden">
          {/* Column 1: Projects Selector (18 Projects) */}
          <div className="w-56 border-r border-cyan-500/20 bg-slate-950/60 flex flex-col overflow-y-auto p-2 space-y-1 scrollbar-thin">
            <div className="text-[10px] font-bold text-cyan-400 px-2 py-1 uppercase tracking-wider flex items-center justify-between">
              <span>PROJECTS ({projects.length})</span>
            </div>
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProject(p.name)}
                className={`w-full text-left p-2 rounded-xl text-xs font-mono transition-all flex items-center justify-between cursor-pointer ${
                  selectedProject === p.name
                    ? 'border border-cyan-400/80 bg-cyan-950/80 text-cyan-200 shadow-sm'
                    : 'border border-transparent hover:bg-slate-900/80 text-slate-400 hover:text-white'
                }`}
              >
                <span className="truncate">{p.name}</span>
                {p.hasGit && <GitBranch className="h-3 w-3 text-emerald-400 shrink-0 ml-1" title="Git Enabled" />}
              </button>
            ))}
          </div>

          {/* Column 2: Files in Selected Project */}
          <div className="w-60 border-r border-cyan-500/20 bg-slate-900/40 flex flex-col overflow-y-auto p-2 space-y-1 scrollbar-thin">
            <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider flex items-center justify-between">
              <span>FILES ({files.length})</span>
              {isLoading && <RefreshCw className="h-3 w-3 animate-spin text-cyan-400" />}
            </div>
            {files.map((f, i) => (
              <button
                key={i}
                type="button"
                disabled={f.isDirectory}
                onClick={() => loadFileContent(f.relPath)}
                className={`w-full text-left p-2 rounded-lg text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
                  f.isDirectory
                    ? 'text-slate-500 opacity-60 cursor-default'
                    : selectedFile === f.relPath
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50'
                    : 'hover:bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {f.isDirectory ? <FolderOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" /> : <FileCode className="h-3.5 w-3.5 text-cyan-400 shrink-0" />}
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>

          {/* Column 3: Code Editor & AI Analysis */}
          <div className="flex-1 flex flex-col bg-[#010817] overflow-hidden">
            {/* Editor Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-cyan-500/20 bg-slate-950/80 text-xs font-mono">
              <div className="flex items-center gap-2 truncate text-slate-300">
                <span className="text-cyan-400 font-bold">{selectedProject}</span>
                <span>/</span>
                <span className="text-white truncate">{selectedFile || '(เลือกไฟล์เพื่อดูโค้ด)'}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAiAnalyze}
                  disabled={!fileContent || isAnalyzing}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-purple-500/60 bg-purple-950/50 text-purple-200 hover:bg-purple-900/60 text-xs font-bold cursor-pointer disabled:opacity-40"
                  title="ให้ Google Gemini วิเคราะห์ไฟล์นี้"
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-300" />
                  <span>{isAnalyzing ? 'กำลังวิเคราะห์...' : 'AI วิเคราะห์'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveFile}
                  disabled={!selectedFile || isSaving}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-emerald-500/60 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/60 text-xs font-bold cursor-pointer disabled:opacity-40"
                  title="บันทึกโค้ดลงไฟล์จริงพร้อมสำรองไฟล์เดิม .bak"
                >
                  <Save className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกโค้ด'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleGitPush}
                  disabled={isPushing}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 cursor-pointer shadow-md disabled:opacity-50"
                  title="สั่ง git add, commit และ push ขึ้น GitHub ของโปรเจกต์นี้"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>{isPushing ? 'กำลัง PUSH...' : '1-CLICK PUSH GITHUB'}</span>
                </button>
              </div>
            </div>

            {/* Code Textarea */}
            <div className="flex-1 relative flex overflow-hidden">
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                placeholder="คลิกเลือกไฟล์ทางซ้ายเพื่อแสดงและแก้ไขโค้ดที่นี่..."
                spellCheck="false"
                className="flex-1 w-full p-4 font-mono text-xs leading-relaxed text-slate-200 bg-transparent resize-none focus:outline-none scrollbar-thin selection:bg-cyan-500/30"
              />
            </div>

            {/* Bottom Panel: AI Analysis Output or Git Output */}
            {(aiAnalysis || gitOutput || statusMessage) && (
              <div className="h-44 border-t border-cyan-500/20 bg-black/90 p-3 overflow-y-auto font-mono text-xs scrollbar-thin">
                <div className="flex items-center justify-between mb-1 pb-1 border-b border-cyan-500/20 text-[10px] text-cyan-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Terminal className="h-3 w-3" />
                    OUTPUT TELEMETRY & AI COGNITIVE FEEDBACK
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAiAnalysis('');
                      setGitOutput('');
                    }}
                    className="text-slate-500 hover:text-white"
                  >
                    ล้าง
                  </button>
                </div>
                {statusMessage && <div className="text-emerald-400 mb-1">➜ {statusMessage}</div>}
                {gitOutput && (
                  <pre className="text-cyan-300 whitespace-pre-wrap leading-tight text-[11px] mb-2">{gitOutput}</pre>
                )}
                {aiAnalysis && (
                  <div className="text-purple-200 whitespace-pre-wrap leading-relaxed text-[11px]">
                    <div className="font-bold text-purple-300 mb-1">🤖 Google Gemini Analysis:</div>
                    {aiAnalysis}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
