import type { Phase } from "../../conversation/types";

interface SphereNode {
  x: number;
  y: number;
  r: number;
  opacity: number;
  color: string;
}

const NODE_COLORS = ["#22d3ee", "#34d399", "#38bdf8", "#2dd4bf", "#fbbf24", "#67e8f9"] as const;

/**
 * สร้างพิกัดจุดทรงกลม 3 มิติแบบ Fibonacci lattice (ค่าคงที่ ไม่สุ่มระหว่าง render)
 * ฉายลงระนาบ 2 มิติพร้อมเรียงลำดับความลึก เพื่อให้ดูมีมิติและคมชัดทุกความละเอียดจอ
 */
function buildSphereNodes(count: number, radius: number, center: number): SphereNode[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const raw: Array<SphereNode & { z: number }> = [];

  // เอียงแกนเล็กน้อยให้เห็นวงโคจรด้านหน้าชัดขึ้น
  const tilt = 0.36;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  for (let i = 0; i < count; i += 1) {
    const y0 = 1 - (i / (count - 1)) * 2;
    const rAtY = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const theta = goldenAngle * i;
    const x0 = Math.cos(theta) * rAtY;
    const z0 = Math.sin(theta) * rAtY;

    const y = y0 * cosT - z0 * sinT;
    const z = y0 * sinT + z0 * cosT;

    const depth = (z + 1) / 2;
    raw.push({
      x: Number((center + x0 * radius).toFixed(2)),
      y: Number((center + y * radius).toFixed(2)),
      z,
      r: Number((1.15 + depth * 1.65).toFixed(2)),
      opacity: Number((0.24 + depth * 0.72).toFixed(2)),
      color: NODE_COLORS[i % NODE_COLORS.length]
    });
  }

  raw.sort((a, b) => a.z - b.z);
  return raw.map(({ x, y, r, opacity, color }) => ({ x, y, r, opacity, color }));
}

const SPHERE_NODES = buildSphereNodes(112, 86, 110);

interface NeuralSphereProps {
  phase: Phase;
  offline?: boolean;
  compact?: boolean;
}

/**
 * ทรงกลมโครงข่ายประสาทจำลองของ Javis Studio: แสดงจุดโหนดพลังงาน วงโคจร และเส้นเชื่อมสัญญาณ
 * ตอบสนองตามจังหวะสนทนา (ฟัง คิด ตอบ) และหยุดเคลื่อนไหวอัตโนมัติเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว
 */
export function NeuralSphere({ phase, offline = false, compact = false }: NeuralSphereProps) {
  return (
    <svg
      className={`neural-sphere${compact ? " compact" : ""}${offline ? " offline" : ""}`}
      data-phase={phase}
      viewBox="0 0 220 220"
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id="jv-sphere-glow" cx="50%" cy="46%" r="50%">
          <stop offset="0%" stopColor={offline ? "#f87171" : "#22d3ee"} stopOpacity="0.22" />
          <stop offset="55%" stopColor={offline ? "#f87171" : "#0ea5e9"} stopOpacity="0.08" />
          <stop offset="100%" stopColor="#020b14" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="110" cy="110" r="96" fill="url(#jv-sphere-glow)" />

      {/* วงโคจรเส้นบาง */}
      <g className="sphere-orbits">
        <ellipse cx="110" cy="110" rx="90" ry="30" transform="rotate(-16 110 110)" />
        <ellipse cx="110" cy="110" rx="88" ry="28" transform="rotate(24 110 110)" />
        <circle cx="110" cy="110" r="88" className="sphere-rim" />
      </g>

      {/* โครงข่ายจุด 3 มิติ */}
      <g className="sphere-nodes">
        {SPHERE_NODES.map((node, index) => (
          <circle
            key={index}
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill={offline && index % 3 === 0 ? "#f87171" : node.color}
            opacity={node.opacity}
          />
        ))}
      </g>
    </svg>
  );
}
