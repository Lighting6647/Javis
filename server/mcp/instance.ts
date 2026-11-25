import { McpHub } from "./hub.js";
import { PcToolkit } from "./toolkit.js";

let toolkit: PcToolkit | null = null;

/** ชุดเครื่องมือของเซิร์ฟเวอร์นี้ สร้างเมื่อใช้ครั้งแรก */
export function getPcToolkit(): PcToolkit {
  toolkit ??= new PcToolkit({ mcp: new McpHub() });
  return toolkit;
}
