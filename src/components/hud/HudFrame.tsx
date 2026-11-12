/** กรอบเล็งสี่มุมของจอ HUD เป็นภาพประกอบล้วน ๆ ไม่รับการแตะ แสดงเฉพาะในธีมโฮโลแกรม */
export function HudFrame() {
  return (
    <div className="hud-frame" aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
