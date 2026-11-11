import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState, useSyncExternalStore } from "react";
import { MAX_MEMORIES, MAX_MEMORY_LENGTH, memoryStore } from "../memory/memoryStore";

/** หน้าดู เพิ่ม และลบสิ่งที่ Javis จำเกี่ยวกับผู้ใช้ ทุกอย่างเก็บในอุปกรณ์นี้ */
export function MemorySection() {
  const memories = useSyncExternalStore(memoryStore.subscribe, memoryStore.get);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const inputId = useId();

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;

    if (memoryStore.add(draft)) {
      setDraft("");
      setHint("");
    } else {
      setHint("Javis จำเรื่องนี้ไว้อยู่แล้ว");
    }
  };

  const handleClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    memoryStore.clear();
    setConfirmingClear(false);
  };

  return (
    <div className="settings-section">
      <h3>ความจำของ Javis</h3>
      <p className="settings-note">
        สิ่งที่ Javis จำเกี่ยวกับคุณ เก็บในอุปกรณ์นี้เท่านั้น และส่งไปให้ AI พร้อมคำถามเพื่อปรับคำตอบให้เข้ากับคุณ
        พูดว่า "จำไว้ว่า…" หรือ "ลืมเรื่อง…" ระหว่างคุยก็ได้
      </p>

      {memories.length === 0 ? (
        <p className="callout">ยังไม่มีสิ่งที่จำไว้ ลองบอก Javis ว่าอยากให้เรียกคุณว่าอะไร หรือชอบคำตอบแบบไหน</p>
      ) : (
        <ul className="memory-list" aria-label="สิ่งที่ Javis จำไว้">
          {memories.map((memory) => (
            <li key={memory.id}>
              <span>{memory.text}</span>
              <button
                type="button"
                className="icon-button"
                onClick={() => memoryStore.remove(memory.id)}
                aria-label={`ลืมเรื่อง: ${memory.text}`}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="memory-add" onSubmit={handleAdd}>
        <label htmlFor={inputId} className="visually-hidden">เพิ่มสิ่งที่อยากให้ Javis จำ</label>
        <input
          id={inputId}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setHint("");
          }}
          placeholder="เพิ่มเอง เช่น เรียกฉันว่าคุณไลท์"
          maxLength={MAX_MEMORY_LENGTH}
          disabled={memories.length >= MAX_MEMORIES}
        />
        <button type="submit" className="btn btn-secondary" disabled={!draft.trim()}>
          <Plus size={16} aria-hidden /> เพิ่ม
        </button>
      </form>
      {hint && <p className="settings-note" role="status">{hint}</p>}
      {memories.length >= MAX_MEMORIES && (
        <p className="settings-note" role="status">จำได้สูงสุด {MAX_MEMORIES} เรื่อง ลบเรื่องเก่าก่อนเพิ่มเรื่องใหม่</p>
      )}

      {memories.length > 0 && (
        <button type="button" className="btn btn-quiet" onClick={handleClear} onBlur={() => setConfirmingClear(false)}>
          {confirmingClear ? `ยืนยันลบทั้ง ${memories.length} เรื่อง` : "ลบความจำทั้งหมด"}
        </button>
      )}
    </div>
  );
}
