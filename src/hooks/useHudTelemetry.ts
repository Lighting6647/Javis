import { useSyncExternalStore } from "react";
import { memoryStore } from "../memory/memoryStore";
import { aiStatusStore } from "../services/aiStatusStore";
import { describeAiState, describeCacheUse, describeCloudVoiceState, describeSearchMonth, formatLatency, type ReadoutTone } from "../services/hudTelemetry";
import type { SearchUsageView } from "../services/searchUsage";
import type { CloudVoiceStatus } from "../speech/cloudVoice";

/** ค่าหนึ่งช่องบนแผงตัวเลขของจอ HUD */
export interface Readout {
  /** รหัสย่อแบบป้ายเครื่องมือวัด เช่น NET */
  code: string;
  label: string;
  value: string;
  tone?: ReadoutTone;
  /** ช่องสำคัญ: แสดงบนจอแคบด้วย ช่องอื่นแสดงเฉพาะเมื่อมีที่พอ */
  primary?: boolean;
}

interface TelemetryInput {
  /** ที่ที่แอปกำลังทำงาน เช่น เว็บ แอปเดสก์ท็อป */
  platformLabel: string;
  /** จำนวนข้อความในบทสนทนานี้ */
  messageCount: number;
  /** เวลารอคำตอบครั้งล่าสุด (มิลลิวินาที) */
  lastReplyMs: number | null;
  /** สถานะเสียงพูดของ Gemini */
  cloudVoiceStatus?: CloudVoiceStatus | null;
  /** ชื่อเสียง Gemini ที่ผู้ใช้เลือก (null = ค่าเริ่มต้น) */
  cloudVoiceName?: string | null;
  /** ยอดใช้การค้นเว็บ แสดงเฉพาะเมื่อเซิร์ฟเวอร์ค้นด้วย Tavily ซึ่งนับยอดและจำผลค้นได้ */
  searchUsage?: SearchUsageView | null;
}

function subscribeToNetwork(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

const isOnline = (): boolean => navigator.onLine;

/**
 * ค่าที่แสดงบนแผงตัวเลขของจอ HUD ทุกช่องอ่านจากสถานะจริงของแอปและอุปกรณ์
 * ไม่มีตัวเลขตกแต่งที่แต่งขึ้น
 */
export function useHudTelemetry({
  platformLabel,
  messageCount,
  lastReplyMs,
  cloudVoiceStatus = null,
  cloudVoiceName = null,
  searchUsage = null
}: TelemetryInput): Readout[] {
  const online = useSyncExternalStore(subscribeToNetwork, isOnline);
  const memories = useSyncExternalStore(memoryStore.subscribe, memoryStore.get);
  const aiStatus = useSyncExternalStore(aiStatusStore.subscribe, aiStatusStore.get);
  const ai = describeAiState(aiStatus?.chat ?? null);
  const voice = describeCloudVoiceState(cloudVoiceStatus, cloudVoiceName);

  // สถานะของจังหวะสนทนาแสดงเป็นหัวข้อใหญ่ของแผงอยู่แล้ว จึงไม่ซ้ำในช่องตัวเลข
  return [
    { code: "AI", label: "บริการ AI", value: ai.text, tone: ai.tone, primary: true },
    { code: "NET", label: "เครือข่าย", value: online ? "ออนไลน์" : "ออฟไลน์", tone: online ? "ok" : "bad", primary: true },
    { code: "LAT", label: "รอคำตอบ", value: formatLatency(lastReplyMs), primary: true },
    { code: "MEM", label: "ความจำ", value: `${memories.length} เรื่อง` },
    { code: "LOG", label: "ข้อความ", value: `${messageCount} รายการ` },
    cloudVoiceStatus
      ? { code: "TTS", label: "เสียงพูด", value: voice.text, tone: voice.tone }
      : { code: "ENV", label: "ทำงานบน", value: platformLabel },
    ...searchReadouts(searchUsage)
  ];
}

/**
 * ช่องการค้นเว็บ: ยอดของเดือนนี้เทียบโควตา และการใช้ผลค้นที่จำไว้
 * แสดงเฉพาะเมื่อค้นด้วย Tavily เพราะผู้ให้บริการ AI รายอื่นนับยอดในบัญชีของตัวเอง
 */
function searchReadouts(usage: SearchUsageView | null): Readout[] {
  if (usage?.service !== "tavily") return [];
  const month = describeSearchMonth(usage.month);
  return [
    { code: "WEB", label: "ค้นเว็บเดือนนี้", value: month.text, ...(month.tone ? { tone: month.tone } : {}) },
    { code: "HIT", label: "ใช้ผลค้นที่จำไว้", value: describeCacheUse(usage.cache).text }
  ];
}
