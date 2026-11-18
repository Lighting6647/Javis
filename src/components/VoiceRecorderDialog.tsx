import { Activity, Check, Download, Mic, Play, RotateCcw, Sparkles, Square, Trash2, Upload, UserPlus, Volume2, X } from "lucide-react";
import { type ChangeEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { type CalibrationReading, startSpeakerCalibration } from "../meeting/liveSpeakerMonitor";
import { MAX_MATCH_THRESHOLD, MIN_MATCH_THRESHOLD, speakerProfileStore } from "../meeting/speakerProfile";
import { downloadTextFile } from "../services/download";
import {
  createReplicatedVoice,
  type CustomVoiceRecord,
  deleteCustomVoice,
  fetchCustomVoices
} from "../services/customVoicesApi";
import { customVoicesStore } from "../services/customVoicesStore";
import { voiceSettingsStore } from "../services/voiceSettingsStore";
import type { SpeechSynthesizer } from "../speech/types";
import {
  type ActiveVoiceRecording,
  readUploadedAudioClip,
  type RecordedClip,
  startVoiceRecording,
  TARGET_WAV_SAMPLE_RATE
} from "../speech/voiceRecorder";

const DEFAULT_CONSENT_PHRASE =
  "ฉันเป็นเจ้าของเสียงนี้ และฉันยินยอมให้ Google ใช้เสียงนี้เพื่อสร้างแบบจำลองเสียงสังเคราะห์";

interface VoiceRecorderDialogProps {
  open: boolean;
  onClose: () => void;
  synthesizer: SpeechSynthesizer;
  activeCloudVoice: string | null;
}

type ClipSlot = "source" | "consent" | "speaker";

function formatClipBadge(clip: RecordedClip): string {
  const trimmed =
    clip.originalDurationSeconds !== undefined && clip.originalDurationSeconds - clip.durationSeconds > 0.2;
  return trimmed
    ? `${clip.durationSeconds} วิ (ตัดความเงียบจาก ${clip.originalDurationSeconds} วิ)`
    : `${clip.durationSeconds} วิ · พร้อมใช้`;
}

export function VoiceRecorderDialog({ open, onClose, synthesizer, activeCloudVoice }: VoiceRecorderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const nameId = useId();
  const speakerNameId = useId();

  const customVoices = useSyncExternalStore(customVoicesStore.subscribe, customVoicesStore.get);
  const speakerState = useSyncExternalStore(speakerProfileStore.subscribe, speakerProfileStore.getState);
  const [consentPhrase, setConsentPhrase] = useState(DEFAULT_CONSENT_PHRASE);
  const [displayName, setDisplayName] = useState("เสียงของคุณไลท์");
  const [speakerName, setSpeakerName] = useState("ไลท์");
  const [sourceClip, setSourceClip] = useState<RecordedClip | null>(null);
  const [consentClip, setConsentClip] = useState<RecordedClip | null>(null);
  const [recordingSlot, setRecordingSlot] = useState<ClipSlot | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationReading | null>(null);

  const recorderRef = useRef<ActiveVoiceRecording | null>(null);
  const calibrationStopRef = useRef<(() => void) | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const sourceUploadRef = useRef<HTMLInputElement>(null);
  const consentUploadRef = useRef<HTMLInputElement>(null);
  const speakerUploadRef = useRef<HTMLInputElement>(null);
  const profileImportRef = useRef<HTMLInputElement>(null);

  const stopCalibration = () => {
    calibrationStopRef.current?.();
    calibrationStopRef.current = null;
    setCalibrating(false);
    setCalibration(null);
  };

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.removeAttribute("src");
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const closeRecorder = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    stopCalibration();
    stopPreviewAudio();
    setRecordingSlot(null);
    setLevel(0);
    onClose();
  };

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setLoadingList(true);
        return fetchCustomVoices();
      })
      .then((res) => {
        if (cancelled) return;
        if (res.consentPhrase) setConsentPhrase(res.consentPhrase);
        customVoicesStore.replaceAll(res.voices);
      })
      .catch(() => {
        // คงรายการที่แคชไว้ในเครื่องถ้าเครือข่ายขัดข้อง
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });

    return () => {
      cancelled = true;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      calibrationStopRef.current?.();
      calibrationStopRef.current = null;
      stopPreviewAudio();
    };
  }, [open]);

  const storeClip = (slot: ClipSlot, clip: RecordedClip) => {
    if (slot === "source") {
      setSourceClip(clip);
      if (clip.samples24k) {
        speakerProfileStore.saveFromPcm(speakerName.trim() || "ไลท์", clip.samples24k, TARGET_WAV_SAMPLE_RATE);
      }
    } else if (slot === "speaker") {
      if (clip.samples24k) {
        const saved = speakerProfileStore.saveFromPcm(speakerName.trim() || "ไลท์", clip.samples24k, TARGET_WAV_SAMPLE_RATE);
        if (saved) {
          setNotice(`บันทึกโปรไฟล์เสียง "${saved.label}" สำหรับแยกผู้พูดในโหมดประชุมเรียบร้อยครับ`);
        } else {
          setError("ไม่พบเนื้อเสียงพูดที่ชัดเจนพอ ลองพูดใกล้ไมค์ขึ้นอีกนิดครับ");
        }
      }
    } else {
      setConsentClip(clip);
    }
  };

  const handleFileUpload = async (slot: ClipSlot, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const clip = await readUploadedAudioClip(file, slot === "source" ? 25 : 15);
      storeClip(slot, clip);
      if (slot === "source") {
        setNotice("นำเข้าไฟล์เสียง ตัดความเงียบ และจดจำเอกลักษณ์เสียงสำหรับแยกผู้พูดแล้วครับ");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านไฟล์เสียงที่เลือกไม่สำเร็จ");
    }
  };

  const handleImportProfiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const text = await file.text();
      const summary = speakerProfileStore.importJson(text);
      setNotice(`นำเข้าโปรไฟล์เสียงแล้ว (เพิ่ม ${summary.added}, อัปเดต ${summary.updated} · รวม ${summary.total} คน)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำเข้าไฟล์โปรไฟล์ไม่สำเร็จ");
    }
  };

  const toggleCalibration = async () => {
    if (calibrating) {
      stopCalibration();
      return;
    }
    setError(null);
    setNotice(null);
    stopPreviewAudio();
    synthesizer.cancel();

    const stopFn = await startSpeakerCalibration(
      () => speakerProfileStore.getState(),
      (reading) => {
        setCalibration((prev) => {
          if (reading.scorePercent === 0 && prev && prev.scorePercent > 0) {
            return { ...prev, rms: reading.rms };
          }
          return reading;
        });
      },
      (msg) => {
        stopCalibration();
        setError(msg);
      }
    );
    if (stopFn) {
      calibrationStopRef.current = stopFn;
      setCalibrating(true);
    }
  };

  const startRecording = async (slot: ClipSlot) => {
    setError(null);
    setNotice(null);
    stopCalibration();
    stopPreviewAudio();
    synthesizer.cancel();

    const maxDurationSeconds = slot === "source" ? 25 : slot === "speaker" ? 10 : 15;
    setElapsed(0);
    setLevel(0);
    setRecordingSlot(slot);

    try {
      const handle = await startVoiceRecording({
        maxDurationSeconds,
        onElapsed: setElapsed,
        onLevel: setLevel,
        onAutoStop: (clip) => {
          recorderRef.current = null;
          setRecordingSlot(null);
          setLevel(0);
          storeClip(slot, clip);
        },
        onError: (msg) => {
          recorderRef.current = null;
          setRecordingSlot(null);
          setLevel(0);
          setError(msg);
        }
      });
      recorderRef.current = handle;
    } catch (err) {
      setRecordingSlot(null);
      setError(err instanceof Error ? err.message : "เริ่มอัดเสียงไม่สำเร็จ");
    }
  };

  const stopRecording = async (slot: ClipSlot) => {
    const active = recorderRef.current;
    recorderRef.current = null;
    setRecordingSlot(null);
    setLevel(0);
    if (!active) return;

    try {
      const clip = await active.stop();
      storeClip(slot, clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกเสียงไม่สำเร็จ");
    }
  };

  const playClip = (clip: RecordedClip) => {
    stopPreviewAudio();
    const url = URL.createObjectURL(clip.blob);
    const audio = new Audio(url);
    previewUrlRef.current = url;
    previewAudioRef.current = audio;
    audio.onended = stopPreviewAudio;
    audio.onerror = stopPreviewAudio;
    void audio.play().catch(() => {
      setError("เล่นเสียงตัวอย่างไม่สำเร็จ");
      stopPreviewAudio();
    });
  };

  const activateVoice = (voice: CustomVoiceRecord) => {
    const current = voiceSettingsStore.get();
    const next = { ...current, cloud: true, cloudVoice: voice.id };
    voiceSettingsStore.update({ cloud: true, cloudVoice: voice.id });
    synthesizer.applySettings(next);
    if ("retryCloud" in synthesizer && typeof synthesizer.retryCloud === "function") {
      synthesizer.retryCloud();
    }
    synthesizer.cancel();
    void synthesizer.speak(`สวัสดีค่ะ ตอนนี้กำลังพูดด้วย${voice.displayName}แล้วนะคะ`);
    setNotice(`ตั้งค่า "${voice.displayName}" เป็นเสียงพูดของนีน่าเรียบร้อยแล้ว`);
  };

  const handleSaveAndClone = async () => {
    if (!sourceClip || !consentClip || saving) return;
    if (sourceClip.durationSeconds < 8) {
      setError("คลิปเสียงตัวอย่างสั้นเกินไป กรุณาอัดใหม่อย่างน้อย 10 วินาทีเพื่อให้จำลองโทนเสียงได้แม่นยำครับ");
      return;
    }
    if (consentClip.durationSeconds < 3) {
      setError("คลิปเสียงยืนยันสิทธิ์สั้นเกินไป กรุณาอ่านประโยคยืนยันให้ครบชัดเจนครับ");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createReplicatedVoice({
        displayName: displayName.trim() || "เสียงของคุณไลท์",
        sourceAudioBase64: sourceClip.base64,
        consentAudioBase64: consentClip.base64
      });
      customVoicesStore.add(created);
      activateVoice(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกและสร้างโมเดลเสียงจำลองไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (voice: CustomVoiceRecord) => {
    if (deletingId) return;
    setDeletingId(voice.id);
    setError(null);
    try {
      await deleteCustomVoice(voice.id);
      customVoicesStore.remove(voice.id);
      if (activeCloudVoice === voice.id) {
        voiceSettingsStore.update({ cloudVoice: null, persona: "genz-girl" });
      }
      setNotice(`ลบเสียง "${voice.displayName}" เรียบร้อยแล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบเสียงไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  };

  const canSubmit = Boolean(sourceClip && consentClip && !saving && recordingSlot === null);

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog recorder-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        closeRecorder();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeRecorder();
      }}
    >
      <div className="settings-body recorder-body">
        <header>
          <h2 id={titleId}>บันทึกเสียงของไลท์ (จดจำเสียง)</h2>
          <button type="button" className="icon-button" onClick={closeRecorder} aria-label="ปิดเมนูบันทึกเสียง">
            <X size={18} aria-hidden />
          </button>
        </header>

        <p className="recorder-intro">
          อัดเสียงพูดธรรมชาติและคำยืนยัน 2 ขั้นตอนเพื่อให้ Gemini 3.8 จดจำเอกลักษณ์เสียงของคุณไลท์สำหรับอ่านคำตอบของ Javis
        </p>

        {error && (
          <div className="toast error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="toast info" role="status">
            {notice}
          </div>
        )}

        <div className="recorder-field">
          <label htmlFor={nameId}>ชื่อโปรไฟล์เสียง</label>
          <input
            id={nameId}
            type="text"
            maxLength={60}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="เช่น เสียงของคุณไลท์"
          />
        </div>

        <section className="recorder-step">
          <div className="recorder-step-head">
            <strong>1. อัดเสียงตัวอย่าง (10–25 วินาที)</strong>
            <span className="recorder-badge">
              {recordingSlot === "source"
                ? `${elapsed.toFixed(1)} / 25 วิ`
                : sourceClip
                  ? formatClipBadge(sourceClip)
                  : "ยังไม่ได้อัด"}
            </span>
          </div>
          <p className="recorder-script">
            ตัวอย่างบทพูด: &ldquo;สวัสดีนีน่า นี่คือเสียงของไลท์เองนะ วันนี้ฝากช่วยดูสรุปงาน โปรเจกต์ทั้งหมด แล้วก็ช่วยเตือนนัดสำคัญให้ด้วย พูดแบบเป็นธรรมชาติสบาย ๆ ได้เลย&rdquo;
          </p>
          {recordingSlot === "source" && (
            <div className="recorder-meter" aria-hidden>
              <div className="recorder-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          )}
          <div className="recorder-actions">
            {recordingSlot === "source" ? (
              <button type="button" className="btn btn-primary" onClick={() => void stopRecording("source")}>
                <Square size={14} fill="currentColor" aria-hidden /> หยุดอัดเสียงตัวอย่าง
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={recordingSlot !== null || saving}
                  onClick={() => void startRecording("source")}
                >
                  <Mic size={15} aria-hidden /> {sourceClip ? "อัดเสียงตัวอย่างใหม่" : "เริ่มอัดเสียงตัวอย่าง"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={recordingSlot !== null || saving}
                  onClick={() => sourceUploadRef.current?.click()}
                >
                  <Upload size={14} aria-hidden /> อัปโหลดไฟล์เสียง
                </button>
                <input
                  ref={sourceUploadRef}
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm"
                  hidden
                  onChange={(event) => void handleFileUpload("source", event)}
                />
              </>
            )}
            {sourceClip && recordingSlot !== "source" && (
              <button type="button" className="btn btn-secondary" onClick={() => playClip(sourceClip)}>
                <Play size={14} aria-hidden /> ฟังที่อัด
              </button>
            )}
          </div>
        </section>

        <section className="recorder-step">
          <div className="recorder-step-head">
            <strong>2. อัดเสียงยืนยันสิทธิ์ (ตามที่ Google กำหนด)</strong>
            <span className="recorder-badge">
              {recordingSlot === "consent"
                ? `${elapsed.toFixed(1)} / 15 วิ`
                : consentClip
                  ? formatClipBadge(consentClip)
                  : "ยังไม่ได้อัด"}
            </span>
          </div>
          <p className="recorder-script recorder-consent-phrase">
            กรุณาอ่านออกเสียงข้อความนี้ให้ชัดเจน: <strong>&ldquo;{consentPhrase}&rdquo;</strong>
          </p>
          {recordingSlot === "consent" && (
            <div className="recorder-meter" aria-hidden>
              <div className="recorder-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          )}
          <div className="recorder-actions">
            {recordingSlot === "consent" ? (
              <button type="button" className="btn btn-primary" onClick={() => void stopRecording("consent")}>
                <Square size={14} fill="currentColor" aria-hidden /> หยุดอัดคำยินยอม
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={recordingSlot !== null || saving}
                  onClick={() => void startRecording("consent")}
                >
                  <Mic size={15} aria-hidden /> {consentClip ? "อัดคำยินยอมใหม่" : "เริ่มอัดคำยินยอม"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={recordingSlot !== null || saving}
                  onClick={() => consentUploadRef.current?.click()}
                >
                  <Upload size={14} aria-hidden /> อัปโหลดไฟล์เสียง
                </button>
                <input
                  ref={consentUploadRef}
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm"
                  hidden
                  onChange={(event) => void handleFileUpload("consent", event)}
                />
              </>
            )}
            {consentClip && recordingSlot !== "consent" && (
              <button type="button" className="btn btn-secondary" onClick={() => playClip(consentClip)}>
                <Play size={14} aria-hidden /> ฟังคำยินยอม
              </button>
            )}
          </div>
        </section>

        <section className="recorder-step recorder-speaker-box" aria-label="โปรไฟล์แยกผู้พูดในโหมดประชุม">
          <div className="recorder-step-head">
            <strong>แยกผู้พูดหลายคนในโหมดประชุม (ทำงานบนเครื่อง)</strong>
            {speakerState.profiles.length > 0 && (
              <button type="button" className="studio-pill-btn" onClick={() => speakerProfileStore.clear()}>
                ล้างทั้งหมด
              </button>
            )}
          </div>

          <div className="recorder-speaker-enroll">
            <input
              id={speakerNameId}
              type="text"
              maxLength={32}
              value={speakerName}
              onChange={(event) => setSpeakerName(event.target.value)}
              placeholder="ชื่อผู้พูด เช่น ไลท์, คุณเอ"
              aria-label="ชื่อผู้พูดสำหรับจำแนกเสียง"
            />
            {recordingSlot === "speaker" ? (
              <button type="button" className="btn btn-primary" onClick={() => void stopRecording("speaker")}>
                <Square size={14} fill="currentColor" aria-hidden /> หยุด ({elapsed.toFixed(1)} / 10 วิ)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={recordingSlot !== null || saving}
                  onClick={() => void startRecording("speaker")}
                >
                  <UserPlus size={14} aria-hidden /> อัดจำเสียงผู้พูด
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={recordingSlot !== null || saving}
                  onClick={() => speakerUploadRef.current?.click()}
                >
                  <Upload size={14} aria-hidden /> อัปโหลดเสียงผู้พูด
                </button>
                <input
                  ref={speakerUploadRef}
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm"
                  hidden
                  onChange={(event) => void handleFileUpload("speaker", event)}
                />
                {sourceClip?.samples24k && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={recordingSlot !== null || saving}
                    onClick={() => {
                      const saved = speakerProfileStore.saveFromPcm(
                        speakerName.trim() || "ไลท์",
                        sourceClip.samples24k!,
                        TARGET_WAV_SAMPLE_RATE
                      );
                      if (saved) setNotice(`เพิ่มโปรไฟล์เสียง "${saved.label}" จากคลิปข้อ 1 แล้วครับ`);
                    }}
                  >
                    ใช้คลิปข้อ 1
                  </button>
                )}
              </>
            )}
          </div>

          {recordingSlot === "speaker" && (
            <div className="recorder-meter" aria-hidden>
              <div className="recorder-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          )}

          {speakerState.profiles.length > 0 ? (
            <div className="recorder-speaker-chips" role="list" aria-label="ผู้พูดที่บันทึกไว้">
              {speakerState.profiles.map((profile) => (
                <span key={profile.id} className="recorder-chip" role="listitem">
                  <span>{profile.label}</span>
                  <button
                    type="button"
                    aria-label={`ลบโปรไฟล์เสียง ${profile.label}`}
                    onClick={() => speakerProfileStore.remove(profile.id)}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="recorder-script">ยังไม่มีโปรไฟล์เสียงบนเครื่อง — อัดเสียงข้อ 1 หรือเพิ่มชื่อทีมงานด้านบนเพื่อแยกชื่อผู้พูดในบันทึกประชุม</p>
          )}

          <label className="recorder-threshold">
            <span>
              ความเข้มงวดในการจับคู่เสียง:{" "}
              <strong>
                {Math.round(speakerState.threshold * 100)}% (
                {speakerState.threshold >= 0.9 ? "เข้มงวด" : speakerState.threshold <= 0.8 ? "ผ่อนปรน" : "สมดุล · แนะนำ"})
              </strong>
            </span>
            <input
              type="range"
              min={MIN_MATCH_THRESHOLD}
              max={MAX_MATCH_THRESHOLD}
              step={0.01}
              value={speakerState.threshold}
              onChange={(event) => speakerProfileStore.setThreshold(Number(event.target.value))}
            />
          </label>

          <div className="recorder-speaker-tools">
            <button
              type="button"
              className={`btn ${calibrating ? "btn-primary" : "btn-secondary"}`}
              disabled={recordingSlot !== null || saving || speakerState.profiles.length === 0}
              onClick={() => void toggleCalibration()}
            >
              <Activity size={14} aria-hidden /> {calibrating ? "หยุดทดสอบเสียงสด" : "ทดสอบเทียบเสียงสด"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={speakerState.profiles.length === 0 || recordingSlot !== null}
              onClick={() => downloadTextFile("javis-speaker-profiles.json", speakerProfileStore.exportJson())}
            >
              <Download size={14} aria-hidden /> สำรอง (.json)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={recordingSlot !== null || saving}
              onClick={() => profileImportRef.current?.click()}
            >
              <Upload size={14} aria-hidden /> นำเข้า (.json)
            </button>
            <input
              ref={profileImportRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => void handleImportProfiles(event)}
            />
          </div>

          {calibrating && (
            <div className="recorder-calibration" role="status" aria-live="polite">
              <div className="recorder-meter" aria-hidden>
                <div
                  className="recorder-meter-fill"
                  style={{ width: `${Math.min(100, Math.round((calibration?.rms ?? 0) * 900))}%` }}
                />
              </div>
              {calibration && calibration.scorePercent > 0 ? (
                <p className="recorder-calibration-readout">
                  <strong
                    className={
                      calibration.matchedLabel && calibration.matchedLabel !== "คู่สนทนา" ? "match-ok" : "match-peer"
                    }
                  >
                    {calibration.matchedLabel === "คู่สนทนา"
                      ? `ยังไม่ถึงเกณฑ์ (${calibration.bestProfileLabel ?? "ไม่ทราบ"} ${calibration.scorePercent}%) → นับเป็น คู่สนทนา`
                      : `ตรงกับ "${calibration.matchedLabel}" (${calibration.scorePercent}%)`}
                  </strong>{" "}
                  <span>· เกณฑ์ปัจจุบัน {calibration.thresholdPercent}%</span>
                </p>
              ) : (
                <p className="recorder-calibration-readout">ลองพูดใส่ไมโครโฟน 2–3 วินาที เพื่อดูคะแนนความเหมือนแบบเรียลไทม์...</p>
              )}
            </div>
          )}
        </section>

        <div className="settings-actions">
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => void handleSaveAndClone()}>
            <Sparkles size={15} aria-hidden /> {saving ? "กำลังจดจำและสร้างเสียง..." : "บันทึกและจดจำเสียงของไลท์"}
          </button>
          {(sourceClip || consentClip) && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving || recordingSlot !== null}
              onClick={() => {
                setSourceClip(null);
                setConsentClip(null);
                setError(null);
                setNotice(null);
              }}
            >
              <RotateCcw size={14} aria-hidden /> ล้างคลิป
            </button>
          )}
        </div>

        <section className="recorder-saved">
          <h3>เสียงที่จดจำไว้ในระบบ {loadingList ? "(กำลังซิงก์…)" : ""}</h3>
          {customVoices.length === 0 ? (
            <p className="settings-note">ยังไม่มีเสียงที่บันทึกไว้ในโปรเจกต์ Gemini นี้ อัด 2 ขั้นตอนด้านบนเพื่อสร้างได้เลยครับ</p>
          ) : (
            <ul className="recorder-voice-list">
              {customVoices.map((voice) => {
                const isSelected = activeCloudVoice === voice.id;
                return (
                  <li key={voice.id} className={`recorder-voice-item${isSelected ? " active" : ""}`}>
                    <div>
                      <strong>{voice.displayName}</strong>
                      <small>{voice.id}</small>
                    </div>
                    <div className="recorder-voice-item-actions">
                      <button type="button" className="studio-pill-btn" onClick={() => activateVoice(voice)}>
                        {isSelected ? <><Check size={12} aria-hidden /> ใช้อยู่</> : <><Volume2 size={12} aria-hidden /> ใช้เสียงนี้</>}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={deletingId === voice.id}
                        aria-label={`ลบเสียง ${voice.displayName}`}
                        onClick={() => void handleDelete(voice)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </dialog>
  );
}
