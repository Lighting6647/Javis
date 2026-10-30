import { useState } from 'react';
import { X, Key, CheckCircle, AlertTriangle, Cpu, Activity, RefreshCw } from 'lucide-react';
import { playClickSound, playSuccessSound, playAlertSound } from '../../../utils/soundEffects';

export function GeminiSettingsModal({ isOpen, onClose, currentKey = '', onSaveKey }) {
  const [apiKey, setApiKey] = useState(currentKey || '');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gemini-flash-lite-latest');
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'success' | 'error'
  const [latency, setLatency] = useState(null);
  const [testOutput, setTestOutput] = useState('');

  if (!isOpen) return null;

  const handleTestPing = async () => {
    playClickSound();
    setTestStatus('testing');
    setTestOutput('');
    const start = performance.now();
    try {
      const res = await fetch('/api/gemini/analyze?prompt=ping', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      const end = performance.now();
      const ms = Math.round(end - start);
      setLatency(ms);

      if (data.success) {
        setTestStatus('success');
        setTestOutput(data.reply || 'Google Gemini online');
        playSuccessSound();
      } else {
        setTestStatus('error');
        setTestOutput(data.error || 'Connection failed');
        playAlertSound();
      }
    } catch (err) {
      setTestStatus('error');
      setTestOutput(err.message);
      playAlertSound();
    }
  };

  const handleSave = async () => {
    playClickSound();
    try {
      await fetch('/api/projects/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_gemini_key', apiKey }),
      });
      if (onSaveKey) onSaveKey(apiKey);
      playSuccessSound();
      onClose();
    } catch {
      if (onSaveKey) onSaveKey(apiKey);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl rounded-2xl border-2 border-cyan-400/90 bg-[#020b22]/95 p-6 shadow-[0_0_60px_rgba(0,240,255,0.4)] backdrop-blur-2xl text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/30 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-cyan-400 animate-pulse" />
            <div>
              <h2 className="text-sm font-black text-white tracking-widest uppercase">
                J.A.R.V.I.S. // GOOGLE GEMINI CORE SETTINGS
              </h2>
              <span className="text-[10px] text-cyan-400/80 font-mono">PHASE 1: SECURITY & COGNITIVE ENGINE</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-cyan-950/50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Badge */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-cyan-500/30 mb-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            <span className="text-emerald-400 font-bold">GEMINI API STATUS: ACTIVE</span>
          </div>
          <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/40">
            {model}
          </span>
        </div>

        {/* API Key Input */}
        <div className="space-y-2 mb-4">
          <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-cyan-400" />
              Google Gemini API Key
            </span>
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-[10px] text-cyan-400 hover:text-cyan-200 underline"
            >
              {showKey ? 'ซ่อนคีย์' : 'แสดงคีย์'}
            </button>
          </label>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="วาง Google Gemini API Key ที่นี่ (AIzaSy... / AQ...)"
            className="w-full rounded-xl border border-cyan-500/40 bg-black/60 px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
          <p className="text-[10px] text-slate-400">
            บันทึกเก็บไว้ในระบบอย่างปลอดภัยในไฟล์ <code className="text-cyan-300">.env</code> ประจำเครื่อง ไม่มีการส่งออกภายนอก
          </p>
        </div>

        {/* Model Selection */}
        <div className="space-y-1.5 mb-4">
          <label className="text-xs font-bold text-slate-300">เลือก Neural Model</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'gemini-flash-lite-latest', name: 'Flash-Lite', desc: 'เร็วที่สุด ตอบสนองทันที' },
              { id: 'gemini-3.8-flash-lite', name: '3.8 Flash-Lite', desc: 'รุ่นทดสอบ AI 3.8' },
              { id: 'gemini-3.5-flash', name: '3.5 Flash', desc: 'วิเคราะห์โค้ดลึกซึ้ง' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  model === m.id
                    ? 'border-cyan-400 bg-cyan-950/70 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold">{m.name}</div>
                <div className="text-[9px] text-slate-400">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Test Ping Output */}
        {testStatus && (
          <div
            className={`p-3 rounded-xl border text-xs mb-4 ${
              testStatus === 'testing'
                ? 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300'
                : testStatus === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
                : 'border-red-500/40 bg-red-950/40 text-red-200'
            }`}
          >
            <div className="flex items-center justify-between font-bold mb-1">
              <span className="flex items-center gap-1.5">
                {testStatus === 'testing' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {testStatus === 'success' && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                {testStatus === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                {testStatus === 'testing' ? 'กำลังทดสอบเชื่อมต่อ Google Gemini...' : testStatus === 'success' ? 'เชื่อมต่อสำเร็จ (100% ONLINE)' : 'เกิดข้อผิดพลาดในการเชื่อมต่อ'}
              </span>
              {latency !== null && <span className="font-mono text-[10px]">{latency} ms</span>}
            </div>
            {testOutput && <p className="text-[11px] font-mono leading-relaxed opacity-90">{testOutput}</p>}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-cyan-500/20">
          <button
            type="button"
            onClick={handleTestPing}
            disabled={testStatus === 'testing'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-500/50 bg-cyan-950/60 text-cyan-300 text-xs font-bold hover:bg-cyan-900/60 cursor-pointer disabled:opacity-50"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>TEST PING</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-slate-800 text-slate-400 text-xs hover:text-white hover:bg-slate-800/60"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 shadow-md cursor-pointer"
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
