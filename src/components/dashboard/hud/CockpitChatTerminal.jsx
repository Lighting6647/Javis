import { useState, useRef, useEffect } from 'react';
import { Send, Mic } from 'lucide-react';
import { playClickSound } from '../../../utils/soundEffects';

export function CockpitChatTerminal({
  messages,
  userTitle,
  onDispatchCommand,
  onToggleMic,
  isListening,
  onTestThaiVoice,
}) {
  const [inputText, setInputText] = useState('');
  const chatScrollRef = useRef(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onDispatchCommand(inputText.trim());
    setInputText('');
  };

  return (
    <div className="rounded-2xl border-2 border-cyan-400/40 bg-[#020b1e]/90 p-3.5 shadow-[0_0_35px_rgba(6,182,212,0.3)] backdrop-blur-xl flex flex-col h-[320px]">
      {/* Terminal Title */}
      <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2 mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-bold tracking-wider text-cyan-300 font-mono">
            COCKPIT AI MANAGER // TERMINAL
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">MULTI-AGENT DIRECT</span>
      </div>

      {/* Message Stream */}
      <div
        ref={chatScrollRef}
        className="flex-1 space-y-2 overflow-y-auto pr-1 text-xs scrollbar-thin scrollbar-thumb-cyan-900"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl p-2.5 transition-all text-xs ${
              m.sender === userTitle.toUpperCase() || m.sender === 'SIR ไลท์'
                ? 'border border-cyan-500/60 bg-cyan-950/40 text-cyan-100 ml-4'
                : 'border border-slate-800/90 bg-slate-900/80 text-slate-200 mr-2'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-mono">
              <span className="font-bold text-cyan-400">
                [ {m.time} ] {m.sender}
              </span>
              {m.delegatedTo && (
                <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  {m.delegatedTo}
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap leading-relaxed text-[11px] font-sans">
              {m.text}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 text-[10px] scrollbar-none border-t border-cyan-500/20">
        <span className="text-slate-500 shrink-0 font-bold">สั่งการเร็ว:</span>
        {[
          '🔊 ฟังเสียงภาษาไทย',
          'วิเคราะห์เว็บแอพ',
          'สวัสดี จาร์วิส',
          'ตรวจระบบทั้งหมด',
          'ดูข้อมูลระบบ POS',
          'ออกใบเสนอราคา',
        ].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              if (chip === '🔊 ฟังเสียงภาษาไทย') {
                playClickSound();
                onTestThaiVoice();
              } else {
                onDispatchCommand(chip);
              }
            }}
            className={`shrink-0 rounded-lg px-2 py-0.5 transition-all font-sans cursor-pointer ${
              chip.startsWith('🔊')
                ? 'border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 font-bold shadow-sm'
                : 'border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50'
            }`}
          >
            {chip.startsWith('🔊') ? chip : `"${chip}"`}
          </button>
        ))}
      </div>

      {/* Command Input Field: [ INITIALIZE COMMAND ... ] */}
      <form onSubmit={handleSubmit} className="mt-1 flex items-center gap-2 pt-1">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="INITIALIZE COMMAND ..."
            className="w-full rounded-xl border border-cyan-400/50 bg-slate-900/90 px-3 py-2 text-xs text-cyan-200 placeholder-cyan-500/50 focus:border-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-300/50 font-mono tracking-wider shadow-inner"
          />
          {!inputText && (
            <span className="absolute right-3 top-2.5 h-3.5 w-1.5 bg-cyan-400 animate-pulse" />
          )}
        </div>
        <button
          type="button"
          onClick={onToggleMic}
          className={`rounded-xl border p-2 transition-all cursor-pointer ${
            isListening
              ? 'border-red-500 bg-red-600 text-white animate-pulse'
              : 'border-cyan-500/40 bg-slate-900 text-cyan-400 hover:bg-cyan-950/60'
          }`}
          title="เปิด/ปิดไมโครโฟน"
        >
          <Mic className="h-4 w-4" />
        </button>
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-30 cursor-pointer shadow-md"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
