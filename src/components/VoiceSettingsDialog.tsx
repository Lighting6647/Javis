import { AudioLines, Check, Download, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useCloudVoiceStatus } from "../hooks/useCloudVoiceStatus";
import { customVoicesStore } from "../services/customVoicesStore";
import { micLevelStore } from "../services/micLevelStore";
import { type Theme, themeStore } from "../services/themeStore";
import { voiceSettingsStore } from "../services/voiceSettingsStore";
import type { CloudVoiceStatus } from "../speech/cloudVoice";
import { GEMINI_TTS_VOICES, getVoicePersona, isGeminiTtsVoice, VOICE_PERSONAS, type VoicePersonaOption } from "../speech/cloudVoices";
import { micLevelsAvailable } from "../speech/sessionMeter";
import {
  DEFAULT_VOICE_SETTINGS,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  type SpeechSynthesizer,
  type VoiceOption,
  type VoiceSettings
} from "../speech/types";
import { MemorySection } from "./MemorySection";

const AUTOMATIC_VOICE = "";

interface InstallPrompt {
  canInstall: boolean;
  installed: boolean;
  install: () => Promise<void>;
}

interface VoiceSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenRecorder?: () => void;
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

const CLOUD_STATUS_BADGE: Record<CloudVoiceStatus["mode"], { label: string; tone: "ok" | "wait" | "muted" }> = {
  active: { label: "พร้อมใช้", tone: "ok" },
  paused: { label: "พักชั่วคราว", tone: "wait" },
  off: { label: "ปิดอยู่", tone: "muted" },
  unavailable: { label: "ไม่รองรับ", tone: "muted" }
};

function describeCloudStatus(status: CloudVoiceStatus): string {
  if (status.mode === "active") return "กำลังใช้เสียงพูดของ Gemini (คมชัดเป็นธรรมชาติ)";
  if (status.mode === "off") return "ปิดเสียง Gemini อยู่ — ใช้เสียงในอุปกรณ์แทน";
  if (status.mode === "unavailable") return "เซิร์ฟเวอร์นี้ไม่ได้เปิดเสียง Gemini — ใช้เสียงในอุปกรณ์แทน";
  if (status.reason === "quota") return "โควตาเสียง Gemini หมดชั่วคราว — สลับไปใช้เสียงในอุปกรณ์อัตโนมัติ";
  if (status.reason === "rejected") return "โมเดลเสียง Gemini ไม่พร้อมใช้ — สลับไปใช้เสียงในอุปกรณ์อัตโนมัติ";
  return "บริการเสียง Gemini พักชั่วคราว — สลับไปใช้เสียงในอุปกรณ์อัตโนมัติ";
}

/** ส่วนตั้งค่าเสียง สร้างใหม่ทุกครั้งที่เปิด จึงโหลดรายการเสียงล่าสุดของอุปกรณ์เสมอ */
function VoiceSection({
  synthesizer,
  settings,
  onOpenRecorder
}: Pick<VoiceSettingsDialogProps, "synthesizer" | "settings" | "onOpenRecorder">) {
  /** null = กำลังโหลดรายการเสียง */
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const customVoices = useSyncExternalStore(customVoicesStore.subscribe, customVoicesStore.get);
  const cloudStatus = useCloudVoiceStatus(synthesizer);
  const rateId = useId();
  const cloudVoiceId = useId();

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

  const activePersona = getVoicePersona(settings.persona);

  const preview = (sampleText = activePersona.sampleText) => {
    synthesizer.cancel();
    if ("retryCloud" in synthesizer && typeof synthesizer.retryCloud === "function") {
      synthesizer.retryCloud();
    }
    void synthesizer.speak(sampleText);
  };

  const selectAndPreviewPersona = (persona: VoicePersonaOption) => {
    const next: VoiceSettings = {
      ...settings,
      persona: persona.id,
      cloudVoice: persona.recommendedCloudVoice
    };
    voiceSettingsStore.update({ persona: persona.id, cloudVoice: persona.recommendedCloudVoice });
    synthesizer.applySettings(next);
    preview(persona.sampleText);
  };

  if (voices === null) {
    return (
      <div className="settings-loading" role="status" aria-label="กำลังโหลดรายการเสียง">
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
      </div>
    );
  }

  const cloudActive = cloudStatus?.mode === "active";
  const canSpeak = voices.length > 0 || cloudActive;
  const selectedCloudVoice =
    settings.cloudVoice && isGeminiTtsVoice(settings.cloudVoice) ? settings.cloudVoice : AUTOMATIC_VOICE;
  const selectedCloudMeta = GEMINI_TTS_VOICES.find((voice) => voice.id === (selectedCloudVoice || "Leda"));
  const badge = cloudStatus ? CLOUD_STATUS_BADGE[cloudStatus.mode] : null;

  // เสียงที่เคยเลือกอาจถูกถอนออกจากเครื่องไปแล้ว ให้แสดงเป็นอัตโนมัติ
  const selectedVoice = voices.some((voice) => voice.id === settings.voiceId)
    ? (settings.voiceId ?? AUTOMATIC_VOICE)
    : AUTOMATIC_VOICE;

  return (
    <>
      <fieldset className="persona-box">
        <legend>ลีลาการพูด / บุคลิกเสียง (Voice Persona)</legend>
        <div className="persona-list">
          {VOICE_PERSONAS.map((persona) => (
            <div key={persona.id} className="persona-row">
              <label className="voice-option">
                <input
                  type="radio"
                  name="voice-persona"
                  checked={settings.persona === persona.id}
                  onChange={() => {
                    const next: VoiceSettings = {
                      ...settings,
                      persona: persona.id,
                      cloudVoice: persona.recommendedCloudVoice
                    };
                    voiceSettingsStore.update({ persona: persona.id, cloudVoice: persona.recommendedCloudVoice });
                    synthesizer.applySettings(next);
                  }}
                />
                <span>
                  {persona.label}
                  <small>{persona.hint}</small>
                </span>
              </label>
              <button
                type="button"
                className="studio-pill-btn persona-play-btn"
                onClick={() => selectAndPreviewPersona(persona)}
                aria-label={`ทดลองฟังเสียง ${persona.label}`}
              >
                <Play size={12} aria-hidden /> ฟัง
              </button>
            </div>
          ))}
        </div>
      </fieldset>

      {cloudStatus && (
        <fieldset className="cloud-voice-box">
          <legend>
            <Sparkles size={13} aria-hidden /> เสียงพูดของ Gemini (Cloud TTS)
            {badge && <span className={`cloud-voice-badge ${badge.tone}`}>{badge.label}</span>}
          </legend>

          <label className="voice-option">
            <input
              type="checkbox"
              checked={settings.cloud}
              onChange={(event) => voiceSettingsStore.update({ cloud: event.target.checked })}
            />
            <span>
              ใช้เสียงพูดของ Gemini
              <small>{describeCloudStatus(cloudStatus)}</small>
            </span>
          </label>

          {settings.cloud && cloudStatus.mode !== "unavailable" && (
            <div className="cloud-voice-picker">
              <label htmlFor={cloudVoiceId}>โทนเสียง Gemini</label>
              <select
                id={cloudVoiceId}
                value={selectedCloudVoice}
                onChange={(event) => voiceSettingsStore.update({ cloudVoice: event.target.value || null })}
              >
                <option value={AUTOMATIC_VOICE}>ค่าเริ่มต้นของเซิร์ฟเวอร์ (Leda · สาวน้อย Gen Z สดใส)</option>
                {customVoices.length > 0 && (
                  <optgroup label="เสียงที่บันทึกไว้เอง (จดจำเสียง)">
                    {customVoices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.displayName} (เสียงของฉัน)
                      </option>
                    ))}
                  </optgroup>
                )}
                {GEMINI_TTS_VOICES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
              </select>
              {selectedCloudMeta?.hint && <small className="cloud-voice-hint">{selectedCloudMeta.hint}</small>}
              {onOpenRecorder && (
                <button type="button" className="btn btn-secondary" onClick={onOpenRecorder}>
                  <AudioLines size={15} aria-hidden /> บันทึกเสียงของไลท์ (จดจำเสียง)
                </button>
              )}
              {cloudStatus.mode === "paused" && (
                <button type="button" className="btn btn-secondary" onClick={() => preview()}>
                  ลองเชื่อมต่อเสียง Gemini อีกครั้ง
                </button>
              )}
            </div>
          )}
        </fieldset>
      )}

      {voices.length === 0 ? (
        <p className="callout" role="status">
          {cloudActive
            ? "อุปกรณ์นี้ไม่มีเสียงพูดภาษาไทยในเครื่อง ตอนนี้ใช้เสียงพูดของ Gemini อยู่ (เมื่อออฟไลน์คำตอบจะแสดงเป็นข้อความ)"
            : "อุปกรณ์นี้ยังไม่มีเสียงพูดภาษาไทย ติดตั้งเสียงภาษาไทยในการตั้งค่าของอุปกรณ์ แล้วเปิดหน้านี้อีกครั้ง ระหว่างนี้คำตอบจะแสดงเป็นข้อความ"}
        </p>
      ) : (
        <fieldset>
          <legend>{cloudStatus ? "เสียงสำรองในอุปกรณ์" : "เสียงพูด"}</legend>
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
      )}

      {canSpeak && (
        <>
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
            <button type="button" className="btn btn-secondary" onClick={() => preview()}>
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
      )}
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
  onOpenRecorder,
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
        {open && <VoiceSection synthesizer={synthesizer} settings={settings} onOpenRecorder={onOpenRecorder} />}
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
