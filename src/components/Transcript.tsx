import {
  CloudSun,
  Eye,
  EyeOff,
  ListChecks,
  Newspaper,
  NotebookPen,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConversationMessage } from "../conversation/types";
import type { MemoryItem } from "../memory/memoryStore";
import { HudClock } from "./hud/HudClock";
import { StudioCharts } from "./hud/StudioCharts";
import { MessageBubble } from "./MessageBubble";

type CommandCategory = "all" | "voice" | "web" | "meeting";

interface TranscriptProps {
  messages: ConversationMessage[];
  /** Javis ฟังตลอดเวลาอยู่: หน้าเริ่มต้นบอกผู้ใช้ว่าพูดได้เลย เพราะไม่มีปุ่มไมโครโฟนให้แตะ */
  listening: boolean;
  /** ที่นี่ใช้โหมดสรุปการประชุมได้: หน้าเริ่มต้นจึงมีทางเข้าโหมดนี้ให้เห็น */
  meetingAvailable: boolean;
  /** สถานะบริการ AI พร้อมใช้งาน */
  aiReady?: boolean;
  /** ค่าเวลาตอบสนองย้อนหลังในเซสชันนี้ (มิลลิวินาที) */
  latenciesMs?: number[];
  /** เวลาตอบสนองล่าสุด (มิลลิวินาที) */
  lastReplyMs?: number | null;
  /** รายการความจำที่บันทึกในอุปกรณ์ */
  memories?: MemoryItem[];
  /** ซ่อนค่าตัวเลขสถิติเพื่อความเป็นส่วนตัว */
  metricsHidden?: boolean;
  onToggleMetricsHidden?: () => void;
  onRecheckAi?: () => Promise<void>;
  /** ผู้ใช้เลือกคำถามตัวอย่าง */
  onSuggest: (text: string) => void;
  /** เปิดลิงก์ในเบราว์เซอร์ในตัว (เฉพาะแอปเดสก์ท็อป) */
  onOpenLink?: (url: string) => boolean;
  /** แสดงหน้าเว็บในกรอบของแอปอีกครั้ง (เฉพาะเว็บในเบราว์เซอร์) */
  onShowFramed?: (url: string, title: string) => boolean;
  /** ผู้ใช้แตะลิงก์หน้าเว็บของข้อความหนึ่งเอง */
  onLinkOpened: (messageId: string) => void;
  /** ผู้ใช้กดยกเลิกสิ่งที่ Javis เพิ่งจำไว้ */
  onUndoMemory: (messageId: string, memoryId: string) => void;
  /** ข้อความท้ายหน้าเริ่มต้นที่บอกว่าเสียงถูกประมวลผลที่ใด */
  privacyNote: string;
}

interface SuggestionItem {
  icon: typeof Newspaper;
  text: string;
  tag: string;
  hint: string;
  accent: "emerald" | "cyan" | "sky" | "amber";
  category: Exclude<CommandCategory, "all">;
}

const SUGGESTIONS: SuggestionItem[] = [
  {
    icon: Newspaper,
    text: "ข่าวเด่นวันนี้มีอะไรบ้าง",
    tag: "WEB SEARCH",
    hint: "ค้นข้อมูลและสรุปข่าวล่าสุดแบบเรียลไทม์",
    accent: "emerald",
    category: "voice"
  },
  {
    icon: CloudSun,
    text: "เปิดเว็บกรมอุตุนิยมวิทยาให้หน่อย",
    tag: "WEB CONTROL",
    hint: "เปิดเว็บไซต์และแสดงหน้าเว็บในกรอบอัจฉริยะ",
    accent: "cyan",
    category: "web"
  },
  {
    icon: ListChecks,
    text: "ช่วยวางแผนงานสัปดาห์นี้",
    tag: "AI PLANNER",
    hint: "จัดลำดับงานสำคัญและช่วยจำบริบทต่อเนื่อง",
    accent: "sky",
    category: "voice"
  }
];

/** คำสั่งนี้แอปทำเองทันทีโดยไม่ถาม AI (src/meeting/commands.ts) จึงแสดงเฉพาะที่ที่ใช้โหมดสรุปการประชุมได้ */
const MEETING_SUGGESTION: SuggestionItem = {
  icon: NotebookPen,
  text: "เริ่มโหมดสรุปการประชุม",
  tag: "MEETING REC",
  hint: "ฟังเงียบ ๆ จดบันทึกคำพูด และสรุปเมื่อจบการประชุม",
  accent: "amber",
  category: "meeting"
};

export function Transcript({
  messages,
  listening,
  meetingAvailable,
  aiReady = true,
  latenciesMs = [],
  lastReplyMs = null,
  memories = [],
  metricsHidden = false,
  onToggleMetricsHidden,
  onRecheckAi,
  onSuggest,
  onOpenLink,
  onShowFramed,
  onLinkOpened,
  onUndoMemory,
  privacyNote
}: TranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<CommandCategory>("all");
  const [refreshing, setRefreshing] = useState(false);
  const allSuggestions = meetingAvailable ? [...SUGGESTIONS, MEETING_SUGGESTION] : SUGGESTIONS;
  const visibleSuggestions =
    category === "all" ? allSuggestions : allSuggestions.filter((item) => item.category === category);

  // เลื่อนตามข้อความล่าสุดเสมอ รวมถึงตอนคำตอบกำลังทยอยเข้ามา
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleRefresh = async () => {
    if (!onRecheckAi || refreshing) return;
    setRefreshing(true);
    try {
      await onRecheckAi();
    } finally {
      setRefreshing(false);
    }
  };

  if (messages.length === 0) {
    return (
      <section className="welcome">
        {/* ลูกแก้วของธีมเรียบ ธีมโฮโลแกรมมีแกนกลางอยู่บนแผงสถานะแล้ว จึงซ่อนอันนี้ */}
        <div className="core large" aria-hidden>
          <span className="core-heart" />
        </div>

        <div className="studio-hero">
          <div className="studio-hero-copy">
            <span className="welcome-kicker">{listening ? "กำลังฟัง พูดได้เลย" : "พร้อมรับคำสั่ง"}</span>
            <h1>
              Inside the <span className="hero-accent">Javis.</span>
            </h1>
            <p>ผู้ช่วย AI ภาษาไทยสั่งงานด้วยเสียง ค้นข้อมูลล่าสุดจากเว็บ และเปิดหน้าเว็บให้ตามสั่ง</p>
          </div>

          <div className="studio-timestamp-card" aria-hidden>
            <span className="timestamp-label">
              <i className={aiReady ? "live" : "wait"} />
              แสดงข้อมูลล่าสุด
            </span>
            <HudClock />
          </div>
        </div>

        <div className="studio-controls" role="toolbar" aria-label="ตัวกรองคำสั่งและเครื่องมือ">
          <div className="studio-tabs" role="group" aria-label="หมวดคำสั่ง">
            <button
              type="button"
              className="studio-tab"
              aria-pressed={category === "all"}
              onClick={() => setCategory("all")}
            >
              <Sparkles size={13} aria-hidden />
              ทั้งหมด
              <span className="tab-badge">ALL</span>
            </button>
            <button
              type="button"
              className="studio-tab"
              aria-pressed={category === "voice"}
              onClick={() => setCategory("voice")}
            >
              สนทนา &amp; ค้นเว็บ
              <span className="tab-badge">AI</span>
            </button>
            <button
              type="button"
              className="studio-tab"
              aria-pressed={category === "web"}
              onClick={() => setCategory("web")}
            >
              ควบคุมหน้าเว็บ
              <span className="tab-badge">WEB</span>
            </button>
            {meetingAvailable && (
              <button
                type="button"
                className="studio-tab"
                aria-pressed={category === "meeting"}
                onClick={() => setCategory("meeting")}
              >
                สรุปประชุม
                <span className="tab-badge">REC</span>
              </button>
            )}
          </div>

          <div className="studio-actions">
            {onToggleMetricsHidden && (
              <button
                type="button"
                className="studio-pill-btn"
                aria-pressed={metricsHidden}
                onClick={onToggleMetricsHidden}
              >
                {metricsHidden ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
                <span>{metricsHidden ? "แสดงสถิติ" : "ซ่อนสถิติ"}</span>
              </button>
            )}
            {onRecheckAi && (
              <button
                type="button"
                className={`studio-pill-btn${refreshing ? " spinning" : ""}`}
                onClick={() => void handleRefresh()}
                disabled={refreshing}
              >
                <RefreshCw size={14} aria-hidden />
                <span>อัปเดต</span>
              </button>
            )}
          </div>
        </div>

        <ul className="suggestions" aria-label="คำถามตัวอย่าง">
          {visibleSuggestions.map(({ icon: Icon, text, tag, hint, accent }) => (
            <li key={text}>
              <button type="button" data-accent={accent} onClick={() => onSuggest(text)}>
                <span className="suggestion-head">
                  <span className="suggestion-tag">{tag}</span>
                  <Icon size={16} aria-hidden />
                </span>
                <strong className="suggestion-title">{text}</strong>
                <span className="suggestion-hint">{hint}</span>
              </button>
            </li>
          ))}
        </ul>

        <StudioCharts
          latenciesMs={latenciesMs}
          lastReplyMs={lastReplyMs}
          memories={memories}
          messages={messages}
          aiReady={aiReady}
          listening={listening}
          meetingAvailable={meetingAvailable}
          metricsHidden={metricsHidden}
        />

        <small>{privacyNote}</small>
      </section>
    );
  }

  return (
    <section className="thread" role="log" aria-live="polite" aria-label="บทสนทนา">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onOpenLink={onOpenLink}
          onShowFramed={onShowFramed}
          onLinkOpened={onLinkOpened}
          onUndoMemory={onUndoMemory}
        />
      ))}
      <div ref={endRef} />
    </section>
  );
}
