/**
 * คำพูดตอบรับสั้นๆ ระหว่างรอ AI คิดคำตอบ (Voice Fillers ภาษาไทยแบบ Javis)
 */
export const THAI_FILLERS = [
  "ได้เลยค่า รอแป๊บนึงนะคะ",
  "โอเคค่ะคุณไลท์ ขอเช็กให้แป๊บนึงน้า",
  "รับทราบค่ะ กำลังหาคำตอบให้เลยค่ะ",
  "แป๊บนึงนะคะ ลูน่ากำลังคิดให้อยู่ค่ะ"
] as const;

/** พูดเมื่อ AI กำลังค้นเว็บ (ใช้เวลานานกว่าปกติ) ให้รู้ว่ายังทำงานอยู่ */
export const SEARCH_FILLER = "ขอค้นข้อมูลจากเว็บแป๊บนึงนะคะ";

let lastIndex = -1;

export function pickThaiFiller(): string {
  const next = (lastIndex + 1) % THAI_FILLERS.length;
  lastIndex = next;
  return THAI_FILLERS[next] ?? THAI_FILLERS[0];
}
