interface WakeHintProps {
  /** คำที่กำลังได้ยินของช่วงคำพูดที่ยังไม่จบ */
  partial: string;
  /** คำพูดล่าสุดที่ได้ยินแต่ไม่ได้เรียกชื่อ */
  heard: string;
  /** รอมาหลายรอบแล้วไม่ได้ยินเสียงพูดเลย */
  quiet: boolean;
}

/**
 * บรรทัดเล็ก ๆ ใต้ "รอคำเรียก" ให้ผู้ใช้เห็นว่าระบบฟังได้ยินอะไร
 * ถ้าระบบฟังถอดชื่อผิด ผู้ใช้จะเห็นทันทีว่าได้ยินเป็นคำว่าอะไร แทนที่จะเงียบไปเฉย ๆ
 * คำที่ได้ยินแต่ไม่ได้เรียกชื่อจะจางหายเองใน 4 วินาที (ดู .wake-hint.heard ใน hud.css)
 */
export function WakeHint({ partial, heard, quiet }: WakeHintProps) {
  if (partial) {
    return (
      <p className="wake-hint live" role="status">
        กำลังได้ยิน: “{partial}”
      </p>
    );
  }
  if (heard) {
    // key ทำให้บรรทัดเริ่มจางใหม่ทุกครั้งที่ได้ยินประโยคใหม่
    return (
      <p className="wake-hint heard" role="status" key={heard}>
        ได้ยินว่า: “{heard}” (ยังไม่ได้เรียกชื่อ)
      </p>
    );
  }
  if (quiet) {
    return (
      <p className="wake-hint quiet" role="status">
        ยังไม่ได้ยินเสียงพูดเลยค่ะ ถ้าพูดแล้วไม่มีคำขึ้น ลองตรวจไมโครโฟนและสิทธิ์ไมโครโฟนของเบราว์เซอร์
      </p>
    );
  }
  return null;
}
