import {
  ShieldCheck,
  FileDown,
  Printer,
  History,
  RefreshCw,
  Terminal,
  Bell,
  Activity,
  KeyRound,
  FileSpreadsheet,
  Sun,
  Moon,
  Search,
  ShieldAlert,
  Database,
  Volume2,
  VolumeX,
  Globe2,
  Bot,
  Building2,
  Stethoscope,
  Palette,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { ALL_PROJECT_DESIGN_TOKENS } from '../../data/designTokensData';

export function Header({
  activeView,
  setActiveView,
  onRunAudit,
  isAuditing,
  onExportMarkdown,
  onExportPdf,
  onExportCsv,
  onExportJson,
  onOpenHooksModal,
  onOpenNotificationModal,
  onOpenEnvVaultModal,
  onOpenVulnModal,
  onOpenBackupModal,
  onOpenDoctorModal,
  onOpenDesignSystemModal,
  activeBrandTheme = 'ceo-master',
  onSelectBrandTheme,
  onOpenCommandPalette,
  theme,
  onToggleTheme,
  isSoundActive,
  onToggleSound,
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        {/* Brand / Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-600 to-emerald-500 shadow-lg shadow-cyan-500/20">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-white">CEO Master & Krob AI Enterprise</h1>
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 border border-cyan-500/30">
                D:\Light v3.0
              </span>
              <a
                href="https://ceo-flame.vercel.app/"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-400 transition-all shadow-sm"
                title="คลิกเพื่อเปิดหน้าเว็บ Vercel Production จริง"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Vercel Live</span>
                <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            </div>
            <p className="text-xs text-slate-400">6 แผนก AI อัตโนมัติ • 8 สินค้า SaaS เปิดขาย • 17 โฟลเดอร์ใน D:\Light</p>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Command Palette Button */}
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:bg-slate-800 transition-all shadow-sm"
            title="เปิด Command Palette (กด Cmd+K หรือ Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden md:inline">คำสั่งด่วน</span>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-slate-700">
              ⌘K
            </kbd>
          </button>

          {/* View Toggles */}
          <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/60 text-xs">
            <button
              onClick={() => setActiveView('jarvis')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold transition-all ${
                activeView === 'jarvis'
                  ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 text-white shadow-lg shadow-cyan-500/20'
                  : 'text-cyan-400 hover:text-white hover:bg-slate-700/50'
              }`}
              title="เปิดห้องควบคุม J.A.R.V.I.S. สั่งการด้วยเสียงภาษาไทย"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span>J.A.R.V.I.S. AI</span>
            </button>
            <button
              onClick={() => setActiveView('company')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition-all ${
                activeView === 'company' ? 'bg-cyan-600 text-white shadow-sm' : 'text-cyan-300 hover:text-white'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              บริษัท AI (6 แผนก)
            </button>
            <button
              onClick={() => setActiveView('dashboard')}
              className={`rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                activeView === 'dashboard' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              15 โปรเจกต์
            </button>
            <button
              onClick={() => setActiveView('environments')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                activeView === 'environments' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5 text-cyan-400" />
              Multi-Env
            </button>
            <button
              onClick={() => setActiveView('uptime')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                activeView === 'uptime' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Uptime
            </button>
            <button
              onClick={() => setActiveView('logs')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                activeView === 'logs' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Logs
            </button>
            <button
              onClick={() => setActiveView('agents')}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium transition-all ${
                activeView === 'agents' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bot className="h-3.5 w-3.5 text-emerald-400" />
              10 AI Squads
            </button>
          </div>

          {/* Sound Toggle Button */}
          <button
            onClick={onToggleSound}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isSoundActive
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400'
                : 'border-slate-700 bg-slate-800 text-slate-500'
            }`}
            title={isSoundActive ? 'ปิดเสียงเอฟเฟกต์ (Mute Sound)' : 'เปิดเสียงเอฟเฟกต์ (Enable Audio Feedback)'}
          >
            {isSoundActive ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all active:scale-95"
            title={theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-cyan-400" />}
          </button>

          {/* Live Brand Theme Switcher */}
          <div className="relative flex items-center">
            <select
              value={activeBrandTheme}
              onChange={(e) => onSelectBrandTheme?.(e.target.value)}
              className="appearance-none rounded-xl border border-slate-700 bg-slate-800/90 py-2 pl-7 pr-7 text-xs font-bold text-slate-200 hover:border-slate-600 focus:outline-none transition-all cursor-pointer shadow-sm active:scale-95"
              title="สลับธีมแบรนด์สดบนแดชบอร์ด CEO (Live Brand Accent Previewer)"
            >
              {ALL_PROJECT_DESIGN_TOKENS.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-white font-medium">
                  {p.name.replace(/\s*\(.+?\)/, '')}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute left-2.5 h-2.5 w-2.5 rounded-full border border-white/20 shadow-sm"
              style={{
                backgroundColor:
                  ALL_PROJECT_DESIGN_TOKENS.find((p) => p.id === activeBrandTheme)?.palette.primary ||
                  '#06b6d4',
              }}
            />
            <Sparkles className="pointer-events-none absolute right-2 h-3 w-3 text-slate-400" />
          </div>

          {/* Design System Button */}
          <button
            onClick={onOpenDesignSystemModal}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-900/50 hover:text-white transition-all shadow-sm active:scale-95"
            title="ระบบดีไซน์และกำหนดพาเลทสี 17 โปรเจกต์ (Impeccable Design Tokens)"
          >
            <Palette className="h-3.5 w-3.5 text-emerald-400" />
            <span>Design (17)</span>
          </button>

          {/* Migration Doctor Button */}
          <button
            onClick={onOpenDoctorModal}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/50 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-900/60 hover:text-white transition-all shadow-sm active:scale-95"
            title="ตรวจสุขภาพเครื่องหลังย้ายเครื่อง & สถานะทั้ง 17 โฟลเดอร์ใน D:\Light"
          >
            <Stethoscope className="h-3.5 w-3.5 text-cyan-400" />
            <span>Doctor (17)</span>
          </button>

          {/* Vuln Scanner Button */}
          <button
            onClick={onOpenVulnModal}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="ตรวจเช็คช่องโหว่ความปลอดภัย Dependency Vulnerability Scanner"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden lg:inline">Vuln Scan</span>
          </button>

          {/* Auto Backup Button */}
          <button
            onClick={onOpenBackupModal}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="จัดการระบบ Auto-Backup & Snapshots"
          >
            <Database className="h-3.5 w-3.5 text-teal-400" />
            <span className="hidden lg:inline">Backup</span>
          </button>

          {/* Env Vault Modal Button */}
          <button
            onClick={onOpenEnvVaultModal}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="ตรวจสอบความปลอดภัย Environment Variable & Secrets"
          >
            <KeyRound className="h-3.5 w-3.5 text-cyan-400" />
            Env Vault
          </button>

          {/* Alert Bot Button */}
          <button
            onClick={onOpenNotificationModal}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="ตั้งค่าแจ้งเตือน Telegram / Webhook"
          >
            <Bell className="h-3.5 w-3.5 text-amber-400" />
          </button>

          {/* Hooks Manager Button */}
          <button
            onClick={onOpenHooksModal}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="จัดการและติดตั้ง Git Pre-Commit/Push Hooks"
          >
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
            Hooks
          </button>

          {/* Export CSV Button */}
          <button
            onClick={onExportCsv}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="ส่งออก CSV สำหรับ Excel / Google Sheets"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
            CSV
          </button>

          {/* Export JSON Button */}
          <button
            onClick={onExportJson}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="ส่งออก JSON Full Backup"
          >
            <FileDown className="h-3.5 w-3.5 text-cyan-400" />
            JSON
          </button>

          {/* Export MD Button */}
          <button
            onClick={onExportMarkdown}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="ดาวน์โหลดรายงานสรุป Markdown"
          >
            MD
          </button>

          {/* Print / PDF Button */}
          <button
            onClick={onExportPdf}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm active:scale-95"
            title="เปิดหน้าต่างพิมพ์รายงานหรือบันทึกเป็น PDF"
          >
            <Printer className="h-3.5 w-3.5 text-purple-400" />
            PDF
          </button>

          {/* Run Full QA Audit */}
          <button
            onClick={onRunAudit}
            disabled={isAuditing}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-900/30 hover:from-emerald-500 hover:to-teal-500 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
            {isAuditing ? 'ตรวจ...' : 'QA Audit'}
          </button>
        </div>
      </div>
    </header>
  );
}
