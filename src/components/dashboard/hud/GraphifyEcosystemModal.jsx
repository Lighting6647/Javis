import { useState, useMemo } from 'react';
import { X, Network, Layers, Sparkles, Filter } from 'lucide-react';
import { playClickSound } from '../../../utils/soundEffects';

const ECOSYSTEM_NODES = [
  { id: 'ceo', label: 'CEO Master Platform', category: 'Core Hub', port: 5173, status: 'Active', tech: 'React 19 + Vite', connections: ['jarvis', 'inventory', 'clinic', 'sync'] },
  { id: 'jarvis', label: 'J.A.R.V.I.S. Hologram HUD', category: 'Cognitive Core', port: 5173, status: 'Active', tech: 'R3F + WebGL + Gemini', connections: ['ceo', 'gemini-api', 'git-pipeline'] },
  { id: 'gemini-api', label: 'Google Gemini Bridge', category: 'Cognitive Core', port: 'Cloud', status: 'Online', tech: 'Gemini 3.8 / Flash-Lite', connections: ['jarvis'] },
  { id: 'git-pipeline', label: 'Autonomous Git Pipeline', category: 'DevOps', port: 'CLI', status: 'Armed', tech: 'Git CLI + GitHub OAuth', connections: ['ceo', 'jarvis'] },
  { id: 'inventory', label: 'Inventory AI System', category: 'Commercial Webapp', port: 5174, status: 'Ready', tech: 'React + Node + SQLite', connections: ['ceo', 'accounting'] },
  { id: 'clinic', label: 'Fern Clinic IT Hub', category: 'Commercial Webapp', port: 5175, status: 'Ready', tech: 'React + Tailwind + Supabase', connections: ['ceo', 'quotation'] },
  { id: 'fitness', label: 'Titan Fitness Tracking', category: 'Commercial Webapp', port: 5176, status: 'Standby', tech: 'PWA + Vite', connections: ['ceo'] },
  { id: 'pass-app', label: 'Stark Vault Pass App', category: 'Security', port: 5177, status: 'Ready', tech: 'WebCrypto + Biometrics', connections: ['ceo'] },
  { id: 'quotation', label: 'Quotation & PromptPay EMVCo', category: 'Finance', port: 'Internal', status: 'Active', tech: 'CRC-16 + QR Engine', connections: ['clinic', 'accounting'] },
  { id: 'accounting', label: 'Krob Accounting Core', category: 'Finance', port: 5178, status: 'Ready', tech: 'Vite + PostgreSQL', connections: ['ceo', 'quotation'] },
  { id: 'sync', label: 'Cloud Sync Engine (v15)', category: 'DevOps', port: 'Cron', status: 'Active', tech: 'Service Worker + Cache', connections: ['ceo'] },
  { id: 'doctor', label: 'Workspace Migration Doctor', category: 'DevOps', port: 'CLI', status: 'Active', tech: 'Node File System', connections: ['ceo'] },
  { id: 'line-bot', label: 'LINE AI Notification Hub', category: 'Integration', port: 3000, status: 'Standby', tech: 'Webhook + Express', connections: ['ceo', 'clinic'] },
  { id: 'tts-service', label: 'Neural Thai TTS Proxy', category: 'Cognitive Core', port: 'Vercel', status: 'Online', tech: 'Google Audio DSP', connections: ['jarvis'] },
  { id: 'multimodal', label: 'Vision & OCR Pipeline', category: 'Cognitive Core', port: 'Internal', status: 'Ready', tech: 'Gemini Vision', connections: ['jarvis', 'inventory'] },
  { id: 'backup-vault', label: 'Disaster Recovery Vault', category: 'Security', port: 'Cold Storage', status: 'Secure', tech: 'Auto .bak Engine', connections: ['ceo'] },
  { id: 'trading-bot', label: 'Algorithmic Market Sentinel', category: 'Finance', port: 5180, status: 'Standby', tech: 'WebSocket + Python', connections: ['ceo'] },
  { id: 'mcp-server', label: 'Local MCP Tool Provider', category: 'Core Hub', port: 4000, status: 'Ready', tech: 'JSON-RPC Stdio', connections: ['jarvis', 'ceo'] },
];

export function GraphifyEcosystemModal({ isOpen, onClose }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeNode, setActiveNode] = useState(ECOSYSTEM_NODES[0]);

  const categories = useMemo(() => {
    return ['All', 'Core Hub', 'Cognitive Core', 'Commercial Webapp', 'Finance', 'DevOps', 'Security'];
  }, []);

  const filteredNodes = useMemo(() => {
    if (selectedCategory === 'All') return ECOSYSTEM_NODES;
    return ECOSYSTEM_NODES.filter((n) => n.category === selectedCategory);
  }, [selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-2xl">
      <div className="relative w-full max-w-5xl h-[85vh] rounded-2xl border border-cyan-500/40 bg-slate-950/90 shadow-[0_0_50px_rgba(6,182,212,0.18)] flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-slate-900 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/40 text-cyan-400">
              <Network className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-wide text-white">
                  GRAPHIFY // 18 PROJECTS ARCHITECTURE MAP
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  D:\LIGHT ECOSYSTEM
                </span>
              </div>
              <p className="text-xs text-slate-400">
                ระบบวิเคราะห์ผังความเชื่อมโยงและสถาปัตยกรรมทั้ง 18 โปรเจกต์ในเครือข่ายของ sir ไลท์
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-slate-800 bg-slate-900/60 overflow-x-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-slate-400 font-mono text-[11px] shrink-0">หมวดหมู่:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                playClickSound();
                setSelectedCategory(cat);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 overflow-hidden">
          
          {/* Left 2 Cols: Interactive Graph Grid */}
          <div className="md:col-span-2 p-4 overflow-y-auto space-y-3 bg-gradient-to-b from-transparent to-cyan-950/10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredNodes.map((node) => {
                const isSelected = activeNode?.id === node.id;
                return (
                  <div
                    key={node.id}
                    onClick={() => {
                      playClickSound();
                      setActiveNode(node);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                        : 'border-slate-800/90 bg-slate-900/50 hover:border-cyan-500/50 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        <h3 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                          {node.label}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {node.port}
                      </span>
                    </div>

                    <p className="text-[11px] text-cyan-300/80 font-mono mb-2">
                      {node.tech}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400">{node.category}</span>
                      <span className="font-mono text-cyan-400 flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {node.connections.length} เชื่อมโยง
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Col: Node Deep Inspector */}
          <div className="p-4 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950/80 flex flex-col justify-between">
            {activeNode ? (
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase">
                    NODE INSPECTOR // {activeNode.category}
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">{activeNode.label}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      STATUS: {activeNode.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                      PORT: {activeNode.port}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase font-mono">
                    Technology Stack
                  </label>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300">
                    {activeNode.tech}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase font-mono">
                    Connected Dependencies ({activeNode.connections.length})
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeNode.connections.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-1 rounded-lg bg-slate-900 border border-cyan-500/30 text-[11px] font-mono text-slate-200"
                      >
                        ⚡ {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-cyan-500/[0.05] border border-cyan-500/30 text-xs text-slate-300 leading-relaxed">
                  <p className="flex items-center gap-1.5 font-bold text-cyan-300 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    AI Architectural Sentinel
                  </p>
                  โปรเจกต์นี้ได้รับการควบคุมมาตรฐานโดยสกิล <strong>UI UX Pro Max</strong> และรองรับการสั่งการอัตโนมัติผ่าน <strong>J.A.R.V.I.S. Mark 3</strong>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                เลือก Node ในผังด้านซ้ายเพื่อดูรายละเอียดเชิงลึก
              </div>
            )}

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>GRAPH ENGINE: v2.4</span>
              <span className="text-cyan-400 font-bold">18 NODES SYNCHRONIZED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
