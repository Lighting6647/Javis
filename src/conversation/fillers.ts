/**
 * คำพูดตอบรับสั้นๆ ระหว่างรอ AI คิดคำตอบ (Voice Fillers ภาษาไทยแบบ Javis)
 */
const THAI_FILLERS = [
  "รับทราบครับ กำลังตรวจสอบให้สักครู่ครับ",
  "ขอเวลาประมวลผลสักครู่ครับคุณไลท์",
  "กำลังวิเคราะห์ข้อมูลให้ครับ",
  "รับทราบครับ กำลังค้นหาคำตอบให้ครับ"
] as const;

let lastIndex = -1;

export function pickThaiFiller(): string {
  const next = (lastIndex + 1) % THAI_FILLERS.length;
  lastIndex = next;
  return THAI_FILLERS[next] ?? THAI_FILLERS[0];
}
