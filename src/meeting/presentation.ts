import type { Phase } from "../conversation/types";
import type { MeetingStatus } from "./meetingRecorder";

type ActiveStatus = Exclude<MeetingStatus, "idle">;

/** ป้ายสถานะบนแถบบนและแผงสถานะระหว่างการประชุม */
export const MEETING_STATUS_LABEL: Record<ActiveStatus, string> = {
  recording: "กำลังจดการประชุม",
  paused: "พักการจด",
  summarizing: "กำลังสรุปการประชุม"
};

/** จังหวะที่ใช้ขับสีและการเคลื่อนไหวของแกนกลางระหว่างการประชุม: จดเหมือนฟัง สรุปเหมือนคิด พักเหมือนว่าง */
export const MEETING_PHASE: Record<ActiveStatus, Phase> = {
  recording: "listening",
  paused: "idle",
  summarizing: "thinking"
};
