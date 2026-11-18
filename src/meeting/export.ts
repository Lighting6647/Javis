/** บันทึกของการประชุมหนึ่งครั้ง สำหรับเขียนเป็นเอกสารให้ผู้ใช้เก็บ */
export interface MeetingDocument {
  /** คำสรุปจาก AI ถ้ายังไม่ได้สรุป เอกสารจะมีเฉพาะบันทึกคำพูด */
  summary?: string;
  /** คำพูดทั้งหมดที่จดได้ บรรทัดละช่วงคำพูด */
  transcript: string;
  /** ความยาวของการประชุมเป็นนาที */
  minutes: number;
  /** เวลาที่เริ่มประชุม (มิลลิวินาทีของนาฬิกาเครื่อง) */
  startedAt: number;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** ความยาวการประชุมเป็นคำอ่าน */
export function describeDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return "ไม่ถึง 1 นาที";

  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} นาที`;
  return rest === 0 ? `${hours} ชั่วโมง` : `${hours} ชั่วโมง ${rest} นาที`;
}

/** ข้อความของผู้ใช้ที่นำหน้าคำสรุปในบทสนทนา */
export function summaryRequestText(minutes: number): string {
  return `สรุปการประชุม (${describeDuration(minutes)})`;
}

/**
 * วันและเวลาเริ่มประชุมแบบไทย
 * @param timeZone เขตเวลาที่ใช้เขียน ค่าเริ่มต้นคือของเครื่อง แยกไว้เพื่อให้ทดสอบได้ผลเดียวกันทุกเครื่อง
 */
export function formatMeetingDate(startedAt: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeStyle: "short", timeZone }).format(new Date(startedAt));
}

/** ชื่อไฟล์ของเอกสาร จากวันและเวลาเริ่มประชุมตามเวลาของเครื่อง ใช้เฉพาะตัวอักษรที่ทุกระบบไฟล์รับได้ */
export function meetingFileName(startedAt: number): string {
  const date = new Date(startedAt);
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `javis-meeting-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.txt`;
}

/**
 * เอกสารข้อความธรรมดาของการประชุม: คำสรุป (ถ้ามี) ตามด้วยบันทึกคำพูดทั้งหมด
 * ขึ้นบรรทัดด้วย CRLF เพื่อให้โปรแกรมบน Windows ทุกรุ่นแสดงบรรทัดถูก
 */
export function buildMeetingDocument({ summary, transcript, minutes, startedAt }: MeetingDocument, timeZone?: string): string {
  const summarized = summary?.trim();
  const lines = [
    summarized ? "สรุปการประชุม" : "บันทึกการประชุม",
    `เริ่มประชุม: ${formatMeetingDate(startedAt, timeZone)} · ความยาว: ${describeDuration(minutes)}`,
    "จัดทำโดย Javis จากเสียงที่แปลงเป็นข้อความอัตโนมัติ อาจมีคำคลาดเคลื่อน ควรตรวจทานก่อนนำไปใช้",
    ""
  ];
  if (summarized) lines.push("คำสรุป", "------", summarized, "");
  lines.push("บันทึกคำพูด", "------", transcript.trim(), "");

  return lines.join("\n").replace(/\r?\n/g, "\r\n");
}

export interface ParsedTranscriptLine {
  clock: string;
  speaker: string;
  text: string;
}

export interface ActionItemByOwner {
  owner: string;
  task: string;
}

const UNASSIGNED_SPEAKER = "ไม่ระบุผู้พูด";
const UNASSIGNED_OWNER = "ไม่ระบุผู้รับผิดชอบ";

function dateStamp(startedAt: number): string {
  const date = new Date(startedAt);
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${day}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function meetingMarkdownFileName(startedAt: number): string {
  return `javis-meeting-${dateStamp(startedAt)}.md`;
}

export function meetingCsvFileName(startedAt: number): string {
  return `javis-meeting-${dateStamp(startedAt)}.csv`;
}

/**
 * แยกบรรทัดบันทึกคำพูด "[00:12] ชื่อผู้พูด: ข้อความ" ออกเป็นรายการที่มีเวลา ผู้พูด และข้อความ
 */
export function parseTranscriptLines(transcript: string): ParsedTranscriptLine[] {
  const rows: ParsedTranscriptLine[] = [];
  for (const rawLine of transcript.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const clockMatch = trimmed.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.+)$/);
    const clock = clockMatch ? clockMatch[1]! : "-";
    const rest = clockMatch ? clockMatch[2]!.trim() : trimmed;

    const speakerMatch = rest.match(/^([^\s:[\]()]{1,24}(?:\s[^\s:[\]()]{1,20}){0,2}):\s+(.+)$/);
    const candidateSpeaker = speakerMatch?.[1]?.trim();
    const validSpeaker =
      candidateSpeaker && !/^\d+$/.test(candidateSpeaker) && !/^https?$/i.test(candidateSpeaker)
        ? candidateSpeaker
        : null;

    if (validSpeaker && speakerMatch) {
      rows.push({ clock, speaker: validSpeaker, text: speakerMatch[2]!.trim() });
    } else {
      rows.push({ clock, speaker: UNASSIGNED_SPEAKER, text: rest });
    }
  }
  return rows;
}

/**
 * สกัดรายการงานที่ต้องทำ (- หรือ 1.) จากคำสรุป AI แล้วจับคู่กับผู้รับผิดชอบ
 */
export function extractActionItems(summary: string | undefined, knownSpeakers: readonly string[] = []): ActionItemByOwner[] {
  if (!summary?.trim()) return [];
  const items: ActionItemByOwner[] = [];
  const cleanSpeakers = knownSpeakers
    .filter((s) => s && s !== UNASSIGNED_SPEAKER)
    .sort((a, b) => b.length - a.length);

  for (const rawLine of summary.split(/\r?\n/)) {
    const bulletMatch = rawLine.match(/^\s*(?:[-*•]|\d+\.)\s+(.+)$/);
    if (!bulletMatch) continue;
    const body = bulletMatch[1]!.trim();
    if (!body) continue;

    // กรณีรูปแบบ "- ชื่อ: รายละเอียดงาน" หรือ "- [ชื่อ] รายละเอียดงาน"
    const bracketMatch = body.match(/^\[([^\]]{1,32})\]\s*[:\-–]?\s*(.+)$/);
    if (bracketMatch) {
      items.push({ owner: bracketMatch[1]!.trim(), task: bracketMatch[2]!.trim() });
      continue;
    }

    const colonMatch = body.match(/^([^\s:[\]()]{1,24}(?:\s[^\s:[\]()]{1,20}){0,2}):\s+(.+)$/);
    if (colonMatch && !/^https?$/i.test(colonMatch[1]!) && !/^\d+$/.test(colonMatch[1]!)) {
      items.push({ owner: colonMatch[1]!.trim(), task: colonMatch[2]!.trim() });
      continue;
    }

    // กรณี AI เขียนชื่อผู้พูดนำหน้าประโยค เช่น "- ไลท์ส่งรายงานพรุ่งนี้"
    const matchedSpeaker = cleanSpeakers.find((sp) => body.toLowerCase().startsWith(sp.toLowerCase()));
    if (matchedSpeaker) {
      items.push({ owner: matchedSpeaker, task: body });
      continue;
    }

    items.push({ owner: UNASSIGNED_OWNER, task: body });
  }
  return items;
}

function groupByKey<T>(items: readonly T[], getKey: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export interface SpeakerParticipationStat {
  speaker: string;
  turns: number;
  characters: number;
  sharePercent: number;
}

function aggregateSpeakerStats(items: ReadonlyArray<{ speaker: string; text: string }>): SpeakerParticipationStat[] {
  if (items.length === 0) return [];
  const totals = new Map<string, { turns: number; characters: number }>();
  let grandTotal = 0;

  for (const item of items) {
    const key = item.speaker.trim() || UNASSIGNED_SPEAKER;
    const len = Math.max(1, item.text.trim().length);
    grandTotal += len;
    const prev = totals.get(key);
    if (prev) {
      prev.turns += 1;
      prev.characters += len;
    } else {
      totals.set(key, { turns: 1, characters: len });
    }
  }

  return [...totals.entries()]
    .map(([speaker, data]) => ({
      speaker,
      turns: data.turns,
      characters: data.characters,
      sharePercent: Math.round((data.characters / Math.max(1, grandTotal)) * 100)
    }))
    .sort((a, b) => b.characters - a.characters || b.turns - a.turns);
}

/** คำนวณสถิติสัดส่วนการพูดของผู้ร่วมประชุมแต่ละคนจากบันทึกข้อความ */
export function computeSpeakerStats(transcript: string): SpeakerParticipationStat[] {
  return aggregateSpeakerStats(parseTranscriptLines(transcript));
}

/**
 * สร้างเอกสาร Markdown (.md) แยกงานตามผู้รับผิดชอบและแยกบันทึกคำพูดตามผู้พูด
 */
export function buildMeetingMarkdown({ summary, transcript, minutes, startedAt }: MeetingDocument, timeZone?: string): string {
  const summarized = summary?.trim();
  const parsedLines = parseTranscriptLines(transcript);
  const speakerGroups = groupByKey(parsedLines, (line) => line.speaker);
  const knownSpeakers = [...speakerGroups.keys()];
  const actionItems = extractActionItems(summarized, knownSpeakers);
  const speakerStats = aggregateSpeakerStats(parsedLines);

  const md: string[] = [
    `# ${summarized ? "สรุปการประชุม" : "บันทึกการประชุม"}`,
    "",
    `- **เริ่มประชุม:** ${formatMeetingDate(startedAt, timeZone)}`,
    `- **ความยาว:** ${describeDuration(minutes)}`,
    `- **หมายเหตุ:** จัดทำโดย Javis จากเสียงที่แปลงเป็นข้อความอัตโนมัติ อาจมีคำคลาดเคลื่อน ควรตรวจทานก่อนนำไปใช้`,
    ""
  ];

  if (speakerStats.length > 0 && speakerStats.some((s) => s.speaker !== UNASSIGNED_SPEAKER)) {
    md.push("## สถิติการมีส่วนร่วมของผู้พูด", "");
    for (const stat of speakerStats) {
      md.push(`- **${stat.speaker}:** ${stat.turns} ช่วงคำพูด (${stat.sharePercent}%)`);
    }
    md.push("");
  }

  if (summarized) {
    md.push("## คำสรุปจาก AI", "", summarized, "");
  }

  if (actionItems.length > 0) {
    md.push("## งานที่ต้องทำ (แยกตามผู้รับผิดชอบ)", "");
    for (const [owner, tasks] of groupByKey(actionItems, (item) => item.owner)) {
      md.push(`### ${owner}`, "");
      for (const item of tasks) md.push(`- [ ] ${item.task}`);
      md.push("");
    }
  }

  md.push("## บันทึกคำพูด (แยกตามผู้พูด)", "");
  if (parsedLines.length === 0) {
    md.push("_ไม่มีข้อความในบันทึกการประชุม_", "");
  } else {
    for (const [speaker, entries] of speakerGroups) {
      md.push(`### ${speaker} (${entries.length} ช่วงคำพูด)`, "");
      for (const entry of entries) {
        md.push(`- \`[${entry.clock}]\` ${entry.text}`);
      }
      md.push("");
    }
  }

  return md.join("\n");
}

function escapeCsvCell(value: string): string {
  const trimmed = value.trimStart();
  const safe = /^[=+\-@\t\r]/.test(trimmed) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * สร้างไฟล์ CSV แยกงานและบันทึกคำพูดตามผู้พูด/ผู้รับผิดชอบ (เปิดใน Excel ภาษาไทยถูกต้องเมื่อดาวน์โหลดผ่าน downloadTextFile)
 */
export function buildMeetingCsv({ summary, transcript }: MeetingDocument): string {
  const parsedLines = parseTranscriptLines(transcript);
  const knownSpeakers = [...new Set(parsedLines.map((l) => l.speaker))];
  const actionItems = extractActionItems(summary, knownSpeakers);

  const rows: string[][] = [["ประเภท", "ผู้พูด / ผู้รับผิดชอบ", "เวลา", "รายละเอียด"]];
  for (const item of actionItems) {
    rows.push(["งานที่ต้องทำ", item.owner, "", item.task]);
  }
  for (const line of parsedLines) {
    rows.push(["บันทึกคำพูด", line.speaker, line.clock, line.text]);
  }

  return rows.map((cols) => cols.map(escapeCsvCell).join(",")).join("\r\n");
}
