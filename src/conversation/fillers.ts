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

/**
 * คำตอบรับที่ใช้บนอุปกรณ์นี้ บนมือถือใช้ประโยคเดียว
 * เพราะทุกประโยคต้องขอเสียงจากเซิร์ฟเวอร์ล่วงหน้าทุกครั้งที่เปิดแอป ซึ่งแย่งโควตาเสียงของคำตอบจริง
 */
export function fillersFor(mobile: boolean): readonly string[] {
  return mobile ? THAI_FILLERS.slice(0, 1) : THAI_FILLERS;
}

let lastIndex = -1;

export function pickThaiFiller(fillers: readonly string[] = THAI_FILLERS): string {
  const next = (lastIndex + 1) % fillers.length;
  lastIndex = next;
  return fillers[next] ?? THAI_FILLERS[0];
}
