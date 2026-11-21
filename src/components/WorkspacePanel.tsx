import {
  AppWindow,
  Calendar,
  Check,
  FolderOpen,
  Mail,
  Pencil,
  Pin,
  Play,
  Plus,
  RefreshCw,
  StickyNote,
  Sunrise,
  Trash2,
  Users,
  X
} from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { launchAllowedApp } from "../services/appLauncher";
import { contactsStore } from "../services/contactsStore";
import { customAppsStore } from "../services/customAppsStore";
import {
  createWorkspaceCalendarEvent,
  createWorkspaceNote,
  deleteWorkspaceNote,
  fetchMorningBriefing,
  updateWorkspaceNote,
  type MorningBriefingResponse,
  type WorkspaceNote
} from "../services/workspaceApi";

interface WorkspacePanelProps {
  onClose: () => void;
  onRunBriefing: () => void;
}

type WorkspaceTab = "emails" | "calendar" | "notes" | "contacts" | "apps";

const BUILTIN_QUICK_APPS = [
  { id: "chrome", name: "Chrome" },
  { id: "vscode", name: "VS Code" },
  { id: "notepad", name: "Notepad" },
  { id: "calculator", name: "Calculator" },
  { id: "terminal", name: "Terminal" },
  { id: "excel", name: "Excel" },
  { id: "line", name: "LINE" },
  { id: "gmail", name: "Gmail" },
  { id: "calendar", name: "Calendar" }
] as const;

function formatEventTime(raw: string): string {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: raw.includes("T") ? "short" : undefined,
    timeZone: "Asia/Bangkok"
  }).format(parsed);
}

export function WorkspacePanel({ onClose, onRunBriefing }: WorkspacePanelProps) {
  const [tab, setTab] = useState<WorkspaceTab>("emails");
  const [data, setData] = useState<MorningBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // ฟอร์มเพิ่ม/แก้ไข/กรองโน้ต
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteTagsInput, setNoteTagsInput] = useState("");
  const [selectedNoteTag, setSelectedNoteTag] = useState<string>("ทั้งหมด");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [syncTask, setSyncTask] = useState(true);
  const [savingNote, setSavingNote] = useState(false);

  // สมุดรายชื่อ (Voice Contacts)
  const contacts = useSyncExternalStore(contactsStore.subscribe, contactsStore.get);
  const [contactName, setContactName] = useState("");
  const [contactAliases, setContactAliases] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // ฟอร์มเพิ่มนัดหมายปฏิทิน
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);

  // ฟอร์มเพิ่ม Custom Desktop App Path
  const customApps = useSyncExternalStore(customAppsStore.subscribe, customAppsStore.get);
  const [customAppName, setCustomAppName] = useState("");
  const [customAppPath, setCustomAppPath] = useState("");

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetchMorningBriefing();
      setData(response);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดข้อมูล Workspace Hub ไม่สำเร็จค่ะ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchMorningBriefing()
      .then((response) => {
        if (active) {
          setData(response);
          setError(null);
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "โหลดข้อมูล Workspace Hub ไม่สำเร็จค่ะ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const parseTagsInput = (raw: string): string[] =>
    raw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

  const handleAddNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!noteContent.trim() || savingNote) return;
    setSavingNote(true);
    setFeedback(null);
    try {
      const tags = parseTagsInput(noteTagsInput);
      const res = await createWorkspaceNote({
        ...(noteTitle.trim() ? { title: noteTitle.trim() } : {}),
        content: noteContent.trim(),
        ...(tags.length > 0 ? { tags } : {}),
        syncGoogleTasks: syncTask
      });
      setNoteTitle("");
      setNoteContent("");
      setNoteTagsInput("");
      setFeedback({
        tone: "ok",
        text: res.googleTaskSynced
          ? `บันทึกโน้ต "${res.note.title}" และซิงก์เข้า Google Tasks เรียบร้อยแล้วค่ะ`
          : `บันทึกโน้ต "${res.note.title}" เรียบร้อยแล้วค่ะ`
      });
      await loadWorkspace();
    } catch (cause) {
      setFeedback({ tone: "error", text: cause instanceof Error ? cause.message : "บันทึกโน้ตไม่สำเร็จค่ะ" });
    } finally {
      setSavingNote(false);
    }
  };

  const handleTogglePinNote = async (note: WorkspaceNote) => {
    try {
      const nextPinned = !note.pinned;
      await updateWorkspaceNote(note.id, { pinned: nextPinned });
      setFeedback({ tone: "ok", text: nextPinned ? `ปักหมุดโน้ต "${note.title}" แล้วค่ะ` : `เลิกปักหมุดโน้ต "${note.title}" แล้วค่ะ` });
      await loadWorkspace();
    } catch (cause) {
      setFeedback({ tone: "error", text: cause instanceof Error ? cause.message : "อัปเดตสถานะปักหมุดไม่สำเร็จค่ะ" });
    }
  };

  const startEditNote = (note: WorkspaceNote) => {
    setEditingNoteId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditTagsInput(note.tags.join(", "));
  };

  const handleSaveEditNote = async (event: React.FormEvent, noteId: string) => {
    event.preventDefault();
    if (!editContent.trim()) return;
    try {
      await updateWorkspaceNote(noteId, {
        title: editTitle.trim(),
        content: editContent.trim(),
        tags: parseTagsInput(editTagsInput)
      });
      setEditingNoteId(null);
      setFeedback({ tone: "ok", text: "บันทึกการแก้ไขโน้ตเรียบร้อยแล้วค่ะ" });
      await loadWorkspace();
    } catch (cause) {
      setFeedback({ tone: "error", text: cause instanceof Error ? cause.message : "แก้ไขโน้ตไม่สำเร็จค่ะ" });
    }
  };

  const handleAddContact = (event: React.FormEvent) => {
    event.preventDefault();
    const res = contactsStore.add({
      name: contactName,
      aliases: contactAliases,
      phone: contactPhone,
      email: contactEmail
    });
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error });
      return;
    }
    setContactName("");
    setContactAliases("");
    setContactPhone("");
    setContactEmail("");
    setFeedback({ tone: "ok", text: `เพิ่ม "${res.contact.name}" เข้าสมุดรายชื่อเสียงแล้วค่ะ` });
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteWorkspaceNote(id);
      setFeedback({ tone: "ok", text: "ลบโน้ตเรียบร้อยแล้วค่ะ" });
      await loadWorkspace();
    } catch (cause) {
      setFeedback({ tone: "error", text: cause instanceof Error ? cause.message : "ลบโน้ตไม่สำเร็จค่ะ" });
    }
  };

  const handleAddEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventTitle.trim() || !eventStart || savingEvent) return;
    setSavingEvent(true);
    setFeedback(null);
    try {
      const startIso = `${eventStart}:00+07:00`;
      const res = await createWorkspaceCalendarEvent({
        title: eventTitle.trim(),
        startIso
      });
      setEventTitle("");
      setEventStart("");
      setFeedback({ tone: "ok", text: `บันทึกนัดหมาย "${res.event.title}" ลง Google Calendar เรียบร้อยแล้วค่ะ` });
      await loadWorkspace();
    } catch (cause) {
      setFeedback({ tone: "error", text: cause instanceof Error ? cause.message : "บันทึกนัดหมายไม่สำเร็จค่ะ" });
    } finally {
      setSavingEvent(false);
    }
  };

  const handleAddCustomApp = (event: React.FormEvent) => {
    event.preventDefault();
    const res = customAppsStore.add({ name: customAppName, path: customAppPath });
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error });
      return;
    }
    setCustomAppName("");
    setCustomAppPath("");
    setFeedback({ tone: "ok", text: `เพิ่มโปรแกรม "${res.app.name}" เข้า Allowlist เรียบร้อยแล้วค่ะ` });
  };

  const handleLaunchApp = async (appId: string, appName: string) => {
    const res = await launchAllowedApp(appId, appName);
    setFeedback({ tone: res.ok ? "ok" : "error", text: res.message });
  };

  const desktopPicker =
    typeof window !== "undefined"
      ? (window as unknown as {
          javisDesktop?: {
            pickAppFile?: () => Promise<{ canceled: boolean; path?: string; name?: string }>;
          };
        }).javisDesktop?.pickAppFile
      : undefined;

  const handleBrowseAppFile = async () => {
    if (!desktopPicker) {
      setFeedback({
        tone: "error",
        text: "ปุ่มเลือกไฟล์จากเครื่องใช้งานได้บนแอปลูน่าบนคอมพิวเตอร์ (Electron) ค่ะ"
      });
      return;
    }
    try {
      const picked = await desktopPicker();
      if (picked.canceled || !picked.path) return;
      setCustomAppPath(picked.path);
      if (!customAppName.trim() && picked.name) {
        setCustomAppName(picked.name);
      }
      setFeedback({ tone: "ok", text: `เลือกไฟล์ ${picked.name ?? picked.path} แล้ว กด "เพิ่มเข้า Allowlist" ได้เลยค่ะ` });
    } catch {
      setFeedback({ tone: "error", text: "เปิดหน้าต่างเลือกไฟล์ไม่สำเร็จค่ะ" });
    }
  };

  const accountEmail = data?.google.accountEmail ?? "Lighting6647@gmail.com";
  const googleConnected = data?.google.configured ?? false;

  return (
    <section className="projects-hub" aria-label="Workspace Hub — เมล ปฏิทิน โน้ต และโปรแกรมในเครื่อง">
      <div className="projects-head">
        <div>
          <h2>Workspace Hub</h2>
          <p>
            บัญชี {accountEmail} ·{" "}
            {googleConnected ? "เชื่อมต่อ Gmail / Calendar / Tasks แล้ว" : "รอเชื่อมต่อ Google OAuth (ใช้งาน DelLuna Notes & App Launcher ได้ทันที)"}
          </p>
        </div>
        <div className="projects-head-actions">
          <button
            type="button"
            className="studio-pill-btn"
            onClick={onRunBriefing}
            title="สรุปเมล ปฏิทิน และโน้ตเช้านี้เป็นเสียงพูดทันที"
          >
            <Sunrise size={14} aria-hidden />
            <span>สรุปเช้านี้</span>
          </button>
          <button
            type="button"
            className="studio-pill-btn"
            onClick={() => {
              setLoading(true);
              void loadWorkspace();
            }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : undefined} aria-hidden />
            <span>รีเฟรช</span>
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="กลับไปหน้าสนทนา">
            <X size={17} aria-hidden />
          </button>
        </div>
      </div>

      <div className="projects-toolbar">
        <div className="studio-tabs" role="tablist" aria-label="หมวดหมู่ Workspace Hub">
          <button type="button" className="studio-tab" aria-pressed={tab === "emails"} onClick={() => setTab("emails")}>
            <Mail size={14} aria-hidden /> เมล ({data?.emails.length ?? 0})
          </button>
          <button type="button" className="studio-tab" aria-pressed={tab === "calendar"} onClick={() => setTab("calendar")}>
            <Calendar size={14} aria-hidden /> ปฏิทิน ({data?.events.length ?? 0})
          </button>
          <button type="button" className="studio-tab" aria-pressed={tab === "notes"} onClick={() => setTab("notes")}>
            <StickyNote size={14} aria-hidden /> โน้ต ({data?.notes.length ?? 0})
          </button>
          <button type="button" className="studio-tab" aria-pressed={tab === "contacts"} onClick={() => setTab("contacts")}>
            <Users size={14} aria-hidden /> รายชื่อ ({contacts.length})
          </button>
          <button type="button" className="studio-tab" aria-pressed={tab === "apps"} onClick={() => setTab("apps")}>
            <AppWindow size={14} aria-hidden /> โปรแกรม ({BUILTIN_QUICK_APPS.length + customApps.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="toast error" role="alert">
          {error}
        </div>
      )}

      {feedback && (
        <div className={`project-result-banner ${feedback.tone}`} role="status">
          <div className="project-result-top">
            <span>{feedback.text}</span>
            <button type="button" className="icon-button" onClick={() => setFeedback(null)} aria-label="ปิดข้อความแจ้งเตือน">
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {tab === "emails" && (
        <div className="projects-grid">
          {!googleConnected ? (
            <div className="project-card">
              <h3>ยังไม่ได้เชื่อมต่อ Gmail ({accountEmail})</h3>
              <p>
                ตั้งค่า <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> และรัน{" "}
                <code>npx.cmd tsx scripts/google-auth-setup.ts</code> เพื่อรับ <code>GOOGLE_REFRESH_TOKEN</code>
              </p>
            </div>
          ) : data && data.emails.length > 0 ? (
            data.emails.map((email) => (
              <article key={email.id} className="project-card">
                <div className="project-card-head">
                  <h3>{email.subject}</h3>
                  {email.important && <span className="project-badge">สำคัญ</span>}
                </div>
                <p>{email.from}</p>
                <p>{email.snippet}</p>
              </article>
            ))
          ) : (
            <div className="project-card">
              <p>ตอนนี้ยังไม่มีอีเมลสำคัญหรือยังไม่อ่านใหม่ค่ะ</p>
            </div>
          )}
        </div>
      )}

      {tab === "calendar" && (
        <div className="projects-grid">
          <form className="project-card" onSubmit={handleAddEvent}>
            <h3>เพิ่มนัดหมายใหม่ ({accountEmail})</h3>
            <label className="projects-search">
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="ชื่อนัดหมาย เช่น ประชุมทีม AI"
                required
              />
            </label>
            <label className="projects-search">
              <input
                type="datetime-local"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
                aria-label="วันเวลาเริ่มต้น"
                required
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={savingEvent || !googleConnected}>
              <Plus size={15} aria-hidden /> {savingEvent ? "กำลังบันทึก…" : "บันทึกลง Google Calendar"}
            </button>
          </form>

          {data && data.events.length > 0 ? (
            data.events.map((ev) => (
              <article key={ev.id} className="project-card">
                <h3>{ev.title}</h3>
                <p>{formatEventTime(ev.start)}</p>
                {ev.location && <p>สถานที่: {ev.location}</p>}
              </article>
            ))
          ) : (
            <div className="project-card">
              <p>{googleConnected ? "ช่วงวันนี้และพรุ่งนี้ยังไม่มีนัดหมายในปฏิทินค่ะ" : "เชื่อมต่อ Google OAuth เพื่อดูตารางนัดหมายค่ะ"}</p>
            </div>
          )}
        </div>
      )}

      {tab === "notes" && (() => {
        const allNotes = data?.notes ?? [];
        const availableTags = ["ทั้งหมด", ...new Set(allNotes.flatMap((n) => n.tags))];
        const filteredNotes =
          selectedNoteTag === "ทั้งหมด" ? allNotes : allNotes.filter((n) => n.tags.includes(selectedNoteTag));

        return (
          <>
            {availableTags.length > 1 && (
              <div className="projects-toolbar" style={{ marginBottom: "10px" }}>
                <div className="studio-tabs" role="tablist" aria-label="กรองโน้ตตามแท็ก">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="studio-tab"
                      aria-pressed={selectedNoteTag === tag}
                      onClick={() => setSelectedNoteTag(tag)}
                    >
                      {tag === "ทั้งหมด" ? "ทั้งหมด" : `#${tag}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="projects-grid">
              <form className="project-card" onSubmit={handleAddNote}>
                <h3>จด DelLuna Note ใหม่</h3>
                <label className="projects-search">
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="หัวข้อโน้ต (ไม่บังคับ)"
                  />
                </label>
                <label className="projects-search">
                  <input
                    type="text"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="เนื้อหาที่ต้องการจดบันทึก…"
                    required
                  />
                </label>
                <label className="projects-search">
                  <input
                    type="text"
                    value={noteTagsInput}
                    onChange={(e) => setNoteTagsInput(e.target.value)}
                    placeholder="แท็ก คั่นด้วยจุลภาค เช่น work, urgent"
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem" }}>
                  <input type="checkbox" checked={syncTask} onChange={(e) => setSyncTask(e.target.checked)} />
                  <span>ซิงก์เข้า Google Tasks ({accountEmail}) เมื่อเชื่อมต่อ</span>
                </label>
                <button type="submit" className="btn btn-primary" disabled={savingNote}>
                  <Plus size={15} aria-hidden /> {savingNote ? "กำลังบันทึก…" : "บันทึกโน้ต"}
                </button>
              </form>

              {filteredNotes.length > 0 ? (
                filteredNotes.map((note) =>
                  editingNoteId === note.id ? (
                    <form key={note.id} className="project-card" onSubmit={(e) => void handleSaveEditNote(e, note.id)}>
                      <h3>แก้ไขโน้ต</h3>
                      <label className="projects-search">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="หัวข้อ"
                        />
                      </label>
                      <label className="projects-search">
                        <input
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          placeholder="เนื้อหา"
                          required
                        />
                      </label>
                      <label className="projects-search">
                        <input
                          type="text"
                          value={editTagsInput}
                          onChange={(e) => setEditTagsInput(e.target.value)}
                          placeholder="แท็ก คั่นด้วยจุลภาค"
                        />
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button type="submit" className="btn btn-primary">
                          <Check size={14} aria-hidden /> บันทึก
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setEditingNoteId(null)}>
                          <X size={14} aria-hidden /> ยกเลิก
                        </button>
                      </div>
                    </form>
                  ) : (
                    <article key={note.id} className="project-card">
                      <div className="project-card-head">
                        <h3>
                          {note.pinned ? "📌 " : ""}
                          {note.title}
                        </h3>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => void handleTogglePinNote(note)}
                            aria-label={note.pinned ? `เลิกปักหมุด ${note.title}` : `ปักหมุด ${note.title}`}
                            title={note.pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                          >
                            <Pin size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => startEditNote(note)}
                            aria-label={`แก้ไขโน้ต ${note.title}`}
                            title="แก้ไข"
                          >
                            <Pencil size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => void handleDeleteNote(note.id)}
                            aria-label={`ลบโน้ต ${note.title}`}
                            title="ลบ"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>
                      </div>
                      <p>{note.content}</p>
                      {note.tags.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {note.tags.map((tag) => (
                            <span key={tag} className="project-badge">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  )
                )
              ) : (
                <div className="project-card">
                  <p>ยังไม่มีโน้ตในหมวดนี้ ลองจดโน้ตใหม่ด้านบนหรือสั่งด้วยเสียงได้เลยค่ะ</p>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {tab === "contacts" && (
        <div className="projects-grid">
          <form className="project-card" onSubmit={handleAddContact}>
            <h3>เพิ่มรายชื่อติดต่อสำหรับสั่งเสียง</h3>
            <label className="projects-search">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="ชื่อเต็ม เช่น คุณแม่, ทีมพัฒนา"
                required
              />
            </label>
            <label className="projects-search">
              <input
                type="text"
                value={contactAliases}
                onChange={(e) => setContactAliases(e.target.value)}
                placeholder="ชื่อเรียกเล่น (คั่นด้วย ,) เช่น แม่, ทีม"
              />
            </label>
            <label className="projects-search">
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="เบอร์โทร เช่น 0812345678"
              />
            </label>
            <label className="projects-search">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="อีเมล เช่น team@example.com"
              />
            </label>
            <button type="submit" className="btn btn-primary">
              <Plus size={15} aria-hidden /> เพิ่มรายชื่อ
            </button>
          </form>

          {contacts.length > 0 ? (
            contacts.map((contact) => (
              <article key={contact.id} className="project-card">
                <div className="project-card-head">
                  <h3>{contact.name}</h3>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => contactsStore.remove(contact.id)}
                    aria-label={`ลบรายชื่อ ${contact.name}`}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
                {contact.aliases.length > 0 && <p>ชื่อเรียก: {contact.aliases.join(", ")}</p>}
                {contact.phone && <p>โทร: {contact.phone}</p>}
                {contact.email && <p>อีเมล: {contact.email}</p>}
              </article>
            ))
          ) : (
            <div className="project-card">
              <p>ยังไม่มีรายชื่อติดต่อ เพิ่มด้านซ้ายแล้วลองพูดว่า &quot;โทรหาแม่&quot; หรือ &quot;ส่งเมลหาทีม&quot; ได้เลยค่ะ</p>
            </div>
          )}
        </div>
      )}

      {tab === "apps" && (
        <div className="projects-grid">
          <form className="project-card" onSubmit={handleAddCustomApp}>
            <h3>เพิ่มโปรแกรมเฉพาะทาง (Custom Desktop Path)</h3>
            <label className="projects-search">
              <input
                type="text"
                value={customAppName}
                onChange={(e) => setCustomAppName(e.target.value)}
                placeholder="ชื่อโปรแกรม เช่น OBS Studio, MT5, สคริปต์เทรด"
                required
              />
            </label>
            <label className="projects-search">
              <input
                type="text"
                value={customAppPath}
                onChange={(e) => setCustomAppPath(e.target.value)}
                placeholder="พาธเต็ม เช่น C:\Program Files\obs-studio\bin\64bit\obs64.exe"
                required
              />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleBrowseAppFile()}
                title={desktopPicker ? "เลือกไฟล์ .exe / .lnk / .bat จากคอมพิวเตอร์" : "ใช้ได้บนแอปเดสก์ท็อป (Electron)"}
              >
                <FolderOpen size={15} aria-hidden /> เลือกไฟล์จากเครื่อง (Browse .exe)
              </button>
              <button type="submit" className="btn btn-primary">
                <Plus size={15} aria-hidden /> เพิ่มเข้า Allowlist
              </button>
            </div>
          </form>

          {customApps.map((app) => (
            <article key={app.id} className="project-card">
              <div className="project-card-head">
                <h3>{app.name}</h3>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => customAppsStore.remove(app.id)}
                  aria-label={`ลบ ${app.name}`}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
              <p style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{app.path}</p>
              <button type="button" className="btn btn-secondary" onClick={() => void handleLaunchApp(app.id, app.name)}>
                <Play size={14} aria-hidden /> เปิดโปรแกรม
              </button>
            </article>
          ))}

          <article className="project-card">
            <h3>โปรแกรมมาตรฐานที่อนุญาต</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {BUILTIN_QUICK_APPS.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="studio-pill-btn"
                  onClick={() => void handleLaunchApp(app.id, app.name)}
                >
                  <Play size={12} aria-hidden /> {app.name}
                </button>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
