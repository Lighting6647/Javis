import type { HandPointerState } from "../../services/handControl";

interface HandPointerProps {
  pointer: HandPointerState;
}

/**
 * ตัวชี้โฮโลแกรมบนหน้าจอเมื่อเปิดโหมดควบคุมด้วยท่ามือผ่านกล้อง
 */
export function HandPointer({ pointer }: HandPointerProps) {
  if (!pointer.active) return null;

  return (
    <div
      className={`hand-pointer${pointer.pinching ? " pinching" : ""}${pointer.openPalm ? " open" : ""}`}
      style={{ transform: `translate3d(${Math.round(pointer.x)}px, ${Math.round(pointer.y)}px, 0)` }}
      aria-hidden
    >
      <span className="hand-pointer-ring" />
      <span className="hand-pointer-dot" />
    </div>
  );
}
