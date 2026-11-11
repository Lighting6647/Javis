import { Play, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { voiceSettingsStore } from "../services/voiceSettingsStore";
import {
  DEFAULT_VOICE_SETTINGS,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  type SpeechSynthesizer,
  type VoiceOption,
  type VoiceSettings
} from "../speech/types";

const SAMPLE_SENTENCE = "สวัสดีครับ ผมคือ Javis ผู้ช่วยของคุณ วันนี้ให้ช่วยเรื่องอะไรดีครับ";
const AUTOMATIC_VOICE = "";

interface VoiceSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  synthesizer: SpeechSynthesizer;
  settings: VoiceSettings;
}

function describeRate(rate: number): string {
  if (rate === DEFAULT_VOICE_SETTINGS.rate) return "ปกติ";
  return `${rate < DEFAULT_VOICE_SETTINGS.rate ? "ช้าลง" : "เร็วขึ้น"} ${rate.toFixed(1)} เท่า`;
}

/** เนื้อหาในหน้าต่าง สร้างใหม่ทุกครั้งที่เปิด จึงโหลดรายการเสียงล่าสุดของอุปกรณ์เสมอ */
function VoiceSettingsForm({ synthesizer, settings }: Pick<VoiceSettingsDialogProps, "synthesizer" | "settings">) {
  /** null = กำลังโหลดรายการเสียง */
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const rateId = useId();

  useEffect(() => {
    let stale = false;
    synthesizer
      .listVoices()
      .then((list) => {
        if (!stale) setVoices(list);
      })
      .catch(() => {
        if (!stale) setVoices([]);
      });

    return () => {
      stale = true;
      // ปิดหน้าต่างแล้วเสียงตัวอย่างต้องหยุดด้วย
      synthesizer.cancel();
    };
  }, [synthesizer]);

  const preview = () => {
    synthesizer.cancel();
    void synthesizer.speak(SAMPLE_SENTENCE);
  };

  if (voices === null) {
    return (
      <div className="settings-loading" role="status" aria-label="กำลังโหลดรายการเสียง">
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <div className="notice-banner info" role="status">
        อุปกรณ์นี้ยังไม่มีเสียงพูดภาษาไทย ติดตั้งเสียงภาษาไทยในการตั้งค่าของอุปกรณ์ แล้วเปิดหน้านี้อีกครั้ง
        ระหว่างนี้คำตอบจะแสดงเป็นข้อความ
      </div>
    );
  }

  // เสียงที่เคยเลือกอาจถูกถอนออกจากเครื่องไปแล้ว ให้แสดงเป็นอัตโนมัติ
  const selectedVoice = voices.some((voice) => voice.id === settings.voiceId)
    ? (settings.voiceId ?? AUTOMATIC_VOICE)
    : AUTOMATIC_VOICE;

  return (
    <>
      <fieldset>
        <legend>เสียงพูด</legend>
        <label className="voice-option">
          <input
            type="radio"
            name="voice"
            checked={selectedVoice === AUTOMATIC_VOICE}
            onChange={() => voiceSettingsStore.update({ voiceId: null })}
          />
          <span>อัตโนมัติ <small>เลือกเสียงที่ดีที่สุดให้</small></span>
        </label>
        {voices.map((voice) => (
          <label className="voice-option" key={voice.id}>
            <input
              type="radio"
              name="voice"
              checked={selectedVoice === voice.id}
              onChange={() => voiceSettingsStore.update({ voiceId: voice.id })}
            />
            <span>{voice.name}</span>
          </label>
        ))}
      </fieldset>

      <div className="rate-control">
        <label htmlFor={rateId}>
          ความเร็วในการพูด <output htmlFor={rateId}>{describeRate(settings.rate)}</output>
        </label>
        <input
          id={rateId}
          type="range"
          min={MIN_SPEECH_RATE}
          max={MAX_SPEECH_RATE}
          step={0.1}
          value={settings.rate}
          aria-valuetext={describeRate(settings.rate)}
          onChange={(event) => voiceSettingsStore.update({ rate: Number(event.target.value) })}
        />
        <div className="rate-scale" aria-hidden><span>ช้า</span><span>เร็ว</span></div>
      </div>

      <div className="settings-actions">
        <button type="button" className="ghost-button" onClick={preview}>
          <Play size={17} aria-hidden /> ทดลองฟัง
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => voiceSettingsStore.update(DEFAULT_VOICE_SETTINGS)}
        >
          <RotateCcw size={16} aria-hidden /> ค่าเริ่มต้น
        </button>
      </div>
    </>
  );
}

export function VoiceSettingsDialog({ open, onClose, synthesizer, settings }: VoiceSettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // แตะพื้นหลังนอกกล่องเพื่อปิด
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="settings-body">
        <header>
          <h2 id={titleId}>ตั้งค่าเสียง</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="ปิดหน้าตั้งค่าเสียง">
            <X size={18} aria-hidden />
          </button>
        </header>

        {open && <VoiceSettingsForm synthesizer={synthesizer} settings={settings} />}

        <button type="button" className="start-button settings-done" onClick={onClose}>
          เสร็จสิ้น
        </button>
      </div>
    </dialog>
  );
}
