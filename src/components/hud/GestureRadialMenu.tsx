import type { CSSProperties } from "react";
import { MENU_RADIUS, type RadialMenuState } from "../../services/gestureCommands";

export interface RadialMenuItem {
  id: string;
  label: string;
  hint: string;
}

interface GestureRadialMenuProps {
  menu: RadialMenuState;
  items: readonly RadialMenuItem[];
}

/**
 * เมนูวงกลมรอบมือ: ช่องแรกอยู่ด้านบน แล้ววนตามเข็มนาฬิกา (ตรงกับ radialIndex)
 * เลื่อนมือไปทางช่องที่ต้องการแล้วกำมือเพื่อเลือก เลื่อนมือออกไปไกลหรือเอามือลงเพื่อปิด
 */
export function GestureRadialMenu({ menu, items }: GestureRadialMenuProps) {
  const highlighted = menu.highlighted === null ? null : items[menu.highlighted];
  return (
    <div
      className="gesture-menu"
      style={{ left: menu.center.x, top: menu.center.y, "--menu-radius": `${MENU_RADIUS}px` } as CSSProperties}
      role="menu"
      aria-label="เมนูท่ามือ"
    >
      <span className="gesture-menu-ring" aria-hidden />
      <span className="gesture-menu-core" aria-live="polite">
        {highlighted ? highlighted.label : "เลื่อนมือเพื่อเลือก"}
        <small>{highlighted ? "กำมือเพื่อเลือก" : "เอามือลงเพื่อปิด"}</small>
      </span>
      {items.map((item, i) => {
        const angle = (i / items.length) * Math.PI * 2;
        const active = menu.highlighted === i;
        return (
          <span
            key={item.id}
            role="menuitem"
            aria-current={active || undefined}
            className={`gesture-menu-item${active ? " active" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${Math.sin(angle) * MENU_RADIUS}px, ${-Math.cos(angle) * MENU_RADIUS}px)` }}
            title={item.hint}
          >
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

/** ป้ายบอกว่ากล้องเปิดอยู่ แสดงตลอดเวลาที่กล้องทำงาน */
export function CameraOnBadge() {
  return (
    <div className="camera-on-badge" role="status" title="กล้องเปิดอยู่ · ประมวลผลในเครื่อง">
      <span className="camera-on-dot" aria-hidden />
      <span className="camera-on-text">กล้องเปิดอยู่ · ประมวลผลในเครื่อง</span>
    </div>
  );
}
