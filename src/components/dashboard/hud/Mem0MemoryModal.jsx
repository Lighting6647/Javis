import { useState, useEffect } from 'react';
import { X, Brain, Trash2, Plus, Sparkles, RefreshCw } from 'lucide-react';
import { getStoredMemories, addMemory, deleteMemory, resetMemories } from '../../../services/mem0Service';
import { playClickSound, playSuccessSound, playAlertSound } from '../../../utils/soundEffects';

export function Mem0MemoryModal({ isOpen, onClose }) {
  const [memories, setMemories] = useState([]);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newCategory, setNewCategory] = useState('preference');

  useEffect(() => {
    if (isOpen) {
      setMemories(getStoredMemories());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    playSuccessSound();
    const created = addMemory(newMemoryText, newCategory);
    if (created) {
      setMemories(getStoredMemories());
      setNewMemoryText('');
    }
  };

  const handleDelete = (id) => {
    playAlertSound();
    const updated = deleteMemory(id);
    setMemories(updated);
  };

  const handleReset = () => {
    playClickSound();
    const reset = resetMemories();
    setMemories(reset);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-2xl">
      <div className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl border border-cyan-500/40 bg-slate-950/95 shadow-[0_0_50px_rgba(6,182,212,0.2)] flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-slate-900 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/40 text-cyan-400">
              <Brain className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-wide text-white">
                  MEM0 // LONG-TERM ECOSYSTEM MEMORY
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  PERSISTENT CONTEXT
                </span>
              </div>
              <p className="text-xs text-slate-400">
                ระบบจัดเก็บประวัติ ความชอบ และบริบทส่วนตัวของ sir ไลท์ สำหรับใช้ในการสนทนาต่อเนื่องข้ามวัน
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

        {/* Content Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          
          {/* Add New Memory Input */}
          <form onSubmit={handleAdd} className="p-3 rounded-xl border border-cyan-500/30 bg-slate-900/60 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-cyan-300">
              <span className="flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> เพิ่มความจำใหม่ให้ J.A.R.V.I.S. จดจำ
              </span>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="bg-black/60 border border-slate-700 text-slate-300 rounded px-2 py-0.5 text-[10px] font-mono"
              >
                <option value="preference">Preference (ความชอบ)</option>
                <option value="projects">Projects (งาน/โปรเจกต์)</option>
                <option value="personality">Personality (บุคลิก)</option>
                <option value="identity">Identity (ตัวตน/บทบาท)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMemoryText}
                onChange={(e) => setNewMemoryText(e.target.value)}
                placeholder="เช่น 'sir ไลท์ กำลังเร่งปิดดีลระบบคลินิก IT ภายในเดือนนี้' หรือ 'ชอบกาแฟดำตอนเช้า'..."
                className="flex-1 bg-black/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newMemoryText.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs disabled:opacity-40 transition-colors cursor-pointer"
              >
                บันทึก
              </button>
            </div>
          </form>

          {/* Memories List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
              <span>ความจำที่จัดเก็บในระบบ ({memories.length} รายการ)</span>
              <button
                type="button"
                onClick={handleReset}
                className="text-[10px] text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1 cursor-pointer"
                title="รีเซ็ตความจำกลับเป็นค่าตั้งต้น"
              >
                <RefreshCw className="w-3 h-3" /> คืนค่าเริ่มต้น
              </button>
            </div>

            {memories.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-cyan-500/40 transition-all flex items-start justify-between gap-3 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-cyan-950 border border-cyan-500/30 text-cyan-300">
                      {m.category || 'general'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(m.created_at).toLocaleDateString('th-TH')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">{m.memory}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(m.id)}
                  className="opacity-40 group-hover:opacity-100 p-1 rounded hover:bg-red-950 hover:text-red-400 text-slate-500 transition-all cursor-pointer"
                  title="ลบความจำนี้"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            Active Memory Injection: Online
          </span>
          <span className="text-cyan-400 font-bold">MEM0 AI ENGINE v3.1</span>
        </div>
      </div>
    </div>
  );
}
