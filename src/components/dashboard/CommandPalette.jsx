import { useState, useEffect, useRef } from 'react';
import {
  Search,
  ShieldCheck,
  FileSpreadsheet,
  FileDown,
  Printer,
  Moon,
  Sun,
  KeyRound,
  Bell,
  Terminal,
  Activity,
  Folder,
  ArrowRight,
  Database,
  Bot,
  Sparkles,
} from 'lucide-react';

export function CommandPalette({
  isOpen,
  onClose,
  projects,
  onSelectProject,
  onRunAudit,
  onExportCsv,
  onExportPdf,
  onExportMarkdown,
  onToggleTheme,
  theme,
  onOpenHooks,
  onOpenNotify,
  onOpenEnvVault,
  onOpenVuln,
  onOpenBackup,
  onSelectView
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build command list
  const systemActions = [
    {
      id: 'jarvis',
      title: 'เปิดห้องควบคุม J.A.R.V.I.S. MARK 3 (สั่งการด้วยเสียงภาษาไทย)',
      category: 'การสั่งการด่วน',
      icon: <Sparkles className="h-4 w-4 text-cyan-400" />,
      action: () => { onSelectView('jarvis'); onClose(); }
    },
    {
      id: 'audit',
      title: 'รัน Full QA Audit 13 โปรเจกต์',
      category: 'การสั่งการด่วน',
      icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
      action: () => { onRunAudit(); onClose(); }
    },
    {
      id: 'theme',
      title: theme === 'dark' ? 'สลับเป็นธีมสว่าง (Light Executive)' : 'สลับเป็นธีมมืด (Dark Slate)',
      category: 'การสั่งการด่วน',
      icon: theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-cyan-400" />,
      action: () => { onToggleTheme(); onClose(); }
    },
    {
      id: 'export-csv',
      title: 'ส่งออกรายงานข้อมูลเป็น CSV (Excel / Sheets)',
      category: 'ส่งออกข้อมูล',
      icon: <FileSpreadsheet className="h-4 w-4 text-emerald-400" />,
      action: () => { onExportCsv(); onClose(); }
    },
    {
      id: 'export-pdf',
      title: 'เปิดหน้าต่างพิมพ์รายงานหรือบันทึก PDF',
      category: 'ส่งออกข้อมูล',
      icon: <Printer className="h-4 w-4 text-purple-400" />,
      action: () => { onExportPdf(); onClose(); }
    },
    {
      id: 'export-md',
      title: 'ดาวน์โหลดรายงานสรุปละเอียด Markdown (.md)',
      category: 'ส่งออกข้อมูล',
      icon: <FileDown className="h-4 w-4 text-cyan-400" />,
      action: () => { onExportMarkdown(); onClose(); }
    },
    {
      id: 'view-uptime',
      title: 'สลับไปยังหน้าจอ Live Uptime Monitor',
      category: 'มุมมองหน้าจอ',
      icon: <Activity className="h-4 w-4 text-cyan-400" />,
      action: () => { onSelectView('uptime'); onClose(); }
    },
    {
      id: 'view-logs',
      title: 'สลับไปยังหน้าจอ Audit Trail Logs',
      category: 'มุมมองหน้าจอ',
      icon: <Terminal className="h-4 w-4 text-indigo-400" />,
      action: () => { onSelectView('logs'); onClose(); }
    },
    {
      id: 'view-agents',
      title: 'สลับไปยังหน้าจอ AI Squads (10 Agents: บริหารธุรกิจ & ทีมเขียนโค้ด)',
      category: 'มุมมองหน้าจอ',
      icon: <Bot className="h-4 w-4 text-emerald-400" />,
      action: () => { onSelectView('agents'); onClose(); }
    },
    {
      id: 'open-hooks',
      title: 'เปิดหน้าต่างจัดการ Git Hooks (11 คลัง)',
      category: 'เครื่องมือระบบ',
      icon: <Terminal className="h-4 w-4 text-emerald-400" />,
      action: () => { onOpenHooks(); onClose(); }
    },
    {
      id: 'open-env',
      title: 'เปิดระบบ Environment Variable Vault',
      category: 'เครื่องมือระบบ',
      icon: <KeyRound className="h-4 w-4 text-cyan-400" />,
      action: () => { onOpenEnvVault(); onClose(); }
    },
    {
      id: 'open-notify',
      title: 'ตั้งค่าการแจ้งเตือน Telegram / Webhook Bot',
      category: 'เครื่องมือระบบ',
      icon: <Bell className="h-4 w-4 text-amber-400" />,
      action: () => { onOpenNotify(); onClose(); }
    },
    {
      id: 'open-vuln',
      title: 'เปิดตัวสแกนช่องโหว่ Dependency Vulnerability Scanner',
      category: 'เครื่องมือระบบ',
      icon: <ShieldCheck className="h-4 w-4 text-rose-400" />,
      action: () => { onOpenVuln(); onClose(); }
    },
    {
      id: 'open-backup',
      title: 'จัดการระบบ Auto-Backup & Snapshots',
      category: 'เครื่องมือระบบ',
      icon: <Database className="h-4 w-4 text-teal-400" />,
      action: () => { onOpenBackup(); onClose(); }
    }
  ];

  const projectActions = projects.map((p) => ({
    id: `project-${p.id}`,
    title: `${p.name} (${p.thName})`,
    category: 'โปรเจกต์ในระบบ',
    icon: <Folder className="h-4 w-4 text-slate-400" />,
    badge: `Grade ${p.score}`,
    action: () => { onSelectProject(p); onClose(); }
  }));

  const allItems = [...systemActions, ...projectActions];

  const filteredItems = allItems.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

      {/* Palette Dialog */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-slate-800 px-4 py-3">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="พิมพ์คำสั่ง ค้นหาโปรเจกต์ หรือการทำงาน..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => (
              <div
                key={item.id}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs cursor-pointer transition-all ${
                  selectedIndex === index
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="shrink-0">{item.icon}</div>
                  <span className="font-medium truncate">{item.title}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">{item.category}</span>
                  {item.badge && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                      {item.badge}
                    </span>
                  )}
                  <ArrowRight className="h-3 w-3 text-slate-500 opacity-60" />
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              ไม่พบคำสั่งหรือโปรเจกต์ที่ตรงกับ "{query}"
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-4 py-2 text-[11px] text-slate-500">
          <span>กด ↑↓ เพื่อเลือก • Enter เพื่อตกลง</span>
          <span className="font-mono text-cyan-400">Antigravity Command Engine</span>
        </div>
      </div>
    </div>
  );
}
