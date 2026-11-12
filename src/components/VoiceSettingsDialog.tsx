import { Check, Download, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { micLevelsAvailable } from "../hooks/useMicBars";
import { micLevelStore } from "../services/micLevelStore";
import { type Theme, themeStore } from "../services/themeStore";
import { MemorySection } from "./MemorySection";
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

interface InstallPrompt {
  canInstall: boolean;
  installed: boolean;
  install: () => Promise<void>;
}

interface VoiceSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  synthesizer: SpeechSynthesizer;
  settings: VoiceSettings;
  installPrompt: InstallPrompt;
  /** กำลังรันในแอปเดสก์ท็อป */
  desktop: boolean;
}

function describeRate(rate: number): string {
  if (rate === DEFAULT_VOICE_SETTINGS.rate) return "ปกติ";
  return `${rate < DEFAULT_VOICE_SETTINGS.rate ? "ช้าลง" : "เร็วขึ้น"} ${rate.toFixed(1)} เท่า`;
}

/** ส่วนตั้งค่าเสียง สร้างใหม่ทุกครั้งที่เปิด จึงโหลดรายการเสียงล่าสุดของอุปกรณ์เสมอ */
function VoiceSection({ synthesizer, settings }: Pick<VoiceSettingsDialogProps, "synthesizer" | "settings">) {
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
      <p className="callout" role="status">
        อุปกรณ์นี้ยังไม่มีเสียงพูดภาษาไทย ติดตั้งเสียงภาษาไทยในการตั้งค่าของอุปกรณ์ แล้วเปิดหน้านี้อีกครั้ง
        ระหว่างนี้คำตอบจะแสดงเป็นข้อความ
      </p>
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
        <button type="button" className="btn btn-secondary" onClick={preview}>
          <Play size={16} aria-hidden /> ทดลองฟัง
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => voiceSettingsStore.update(DEFAULT_VOICE_SETTINGS)}
        >
          <RotateCcw size={15} aria-hidden /> ค่าเริ่มต้น
        </button>
      </div>
    </>
  );
}

const THEME_OPTIONS: Array<{ value: Theme; name: string; hint: string }> = [
  { value: "holo", name: "โฮโลแกรม", hint: "จอ HUD เรืองแสง พื้นมืด" },
  { value: "plain", name: "เรียบ", hint: "สว่างหรือมืดตามอุปกรณ์" }
];

function ThemeSection() {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get);
  const micLevels = useSyncExternalStore(micLevelStore.subscribe, micLevelStore.get);
  const [canShowMicLevels] = useState(micLevelsAvailable);

  return (
    <fieldset>
      <legend>รูปแบบหน้าจอ</legend>
      <div className="option-grid">
        {THEME_OPTIONS.map((option) => (
          <label className="voice-option" key={option.value}>
            <input
              type="radio"
              name="theme"
              checked={theme === option.value}
              onChange={() => themeStore.set(option.value)}
            />
            <span>{option.name} <small>{option.hint}</small></span>
          </label>
        ))}
      </div>
      {/* มีเฉพาะที่ที่วัดได้ (เบราว์เซอร์บนคอมพิวเตอร์) และเฉพาะธีมที่มีวงคลื่นเสียง */}
      {canShowMicLevels && theme === "holo" && (
        <label className="voice-option">
          <input type="checkbox" checked={micLevels} onChange={(event) => micLevelStore.set(event.target.checked)} />
          <span>
            วงคลื่นเสียงขยับตามเสียงไมโครโฟนจริง
            <small>วัดในอุปกรณ์นี้ระหว่างฟังเท่านั้น ไม่อัดและไม่ส่งเสียงไปที่ใด ปิดได้ถ้าการฟังมีปัญหา</small>
          </span>
        </label>
      )}
    </fieldset>
  );
}

function InstallSection({ installPrompt }: { installPrompt: InstallPrompt }) {
  const { canInstall, installed, install } = installPrompt;

  return (
    <div className="settings-section">
      <h3>แอปหน้าต่างของตัวเอง</h3>
      {installed ? (
        <p className="settings-note"><Check size={15} aria-hidden /> ติดตั้งเป็นแอปบนอุปกรณ์นี้แล้ว</p>
      ) : canInstall ? (
        <>
          <p className="settings-note">ติดตั้ง Javis เป็นแอปแยกหน้าต่าง เปิดได้จากหน้าจอหลักโดยไม่ต้องเข้าเบราว์เซอร์</p>
          <button type="button" className="btn btn-secondary" onClick={() => void install()}>
            <Download size={16} aria-hidden /> ติดตั้งแอป Javis
          </button>
        </>
      ) : (
        <p className="settings-note">
          ติดตั้งได้จากเมนูของเบราว์เซอร์: Chrome หรือ Edge เลือก "ติดตั้งแอป" ส่วน Safari บน iPhone เลือก
          "แชร์" แล้ว "เพิ่มไปยังหน้าจอโฮม"
        </p>
      )}
    </div>
  );
}

export function VoiceSettingsDialog({
  open,
  onClose,
  synthesizer,
  settings,
  installPrompt,
  desktop
}: VoiceSettingsDialogProps) {
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
      // ปิดผ่านสถานะของแอปทางเดียว ไม่ฟังเหตุการณ์ close ของเบราว์เซอร์ ซึ่งอาจมาถึงช้า
      // แล้วไปปิดหน้าต่างที่ผู้ใช้เพิ่งเปิดใหม่ กด Esc จึงรับที่เหตุการณ์ cancel แทน
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // แตะพื้นหลังนอกกล่องเพื่อปิด
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="settings-body">
        <header>
          <h2 id={titleId}>ตั้งค่า</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="ปิดหน้าตั้งค่า">
            <X size={18} aria-hidden />
          </button>
        </header>

        <ThemeSection />
        {open && <VoiceSection synthesizer={synthesizer} settings={settings} />}
        <MemorySection />
        {/* แอปเดสก์ท็อปเป็นหน้าต่างของตัวเองอยู่แล้ว ไม่ต้องชวนติดตั้ง */}
        {!desktop && <InstallSection installPrompt={installPrompt} />}

        <button type="button" className="btn btn-primary settings-done" onClick={onClose}>
          เสร็จสิ้น
        </button>
      </div>
    </dialog>
  );
}
