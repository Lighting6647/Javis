/**
 * แสดงแถบคำค้นที่เกี่ยวข้องของ Google (Search Suggestions) ซึ่งมาเป็น HTML กับ CSS สำเร็จรูป
 * เงื่อนไขการใช้ของ Google กำหนดให้แสดงคู่กับคำตอบจากการค้นด้วย Google ตามหน้าตาที่ Google ให้มา
 *
 * HTML นี้มาจากนอกแอป จึงไม่ถูกใส่ลงหน้าเว็บตรง ๆ: สร้างองค์ประกอบใหม่เฉพาะชนิดและคุณสมบัติที่อนุญาต
 * แล้ววางไว้ใน shadow root ของตัวเอง สไตล์ของ Google จึงไม่ปนกับของแอป และของแอปไม่ไปเปลี่ยนหน้าตาของ Google
 */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** องค์ประกอบที่สร้างต่อให้ได้ */
const ALLOWED_HTML_TAGS = new Set(["a", "b", "div", "em", "i", "p", "span", "strong"]);
const ALLOWED_SVG_TAGS = new Set([
  "circle",
  "clipPath",
  "defs",
  "ellipse",
  "g",
  "line",
  "linearGradient",
  "mask",
  "path",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
  "svg",
  "title"
]);
/** องค์ประกอบที่ทิ้งทั้งก้อนรวมสิ่งที่อยู่ข้างใน ส่วนองค์ประกอบอื่นที่ไม่รู้จักจะเก็บเฉพาะเนื้อหาข้างใน */
const DROPPED_TAGS = new Set(["base", "embed", "form", "iframe", "input", "link", "meta", "object", "script", "style", "template"]);

/** คุณสมบัติที่คัดลอกต่อได้ ไม่มีคุณสมบัติที่รันสคริปต์หรือโหลดของจากภายนอกได้ (เช่น style, on*, src) */
const ALLOWED_ATTRIBUTES = new Set([
  "aria-hidden",
  "aria-label",
  "class",
  "clip-path",
  "clip-rule",
  "cx",
  "cy",
  "d",
  "dir",
  "fill",
  "fill-opacity",
  "fill-rule",
  "gradientTransform",
  "gradientUnits",
  "height",
  "id",
  "lang",
  "offset",
  "opacity",
  "points",
  "r",
  "role",
  "rx",
  "ry",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-width",
  "transform",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2"
]);

/** ลิงก์ของแถบคำค้นต้องเป็น http หรือ https เท่านั้น */
function safeLink(value: string | null): string | null {
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
}

/** สร้างสำเนาที่ปลอดภัยขององค์ประกอบหนึ่งตัว คืนรายการว่างถ้าต้องทิ้ง */
function copyNode(node: Node, target: Document, insideSvg: boolean): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [target.createTextNode(node.textContent ?? "")];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const source = node as Element;
  const tag = source.localName;
  if (DROPPED_TAGS.has(tag.toLowerCase())) return [];

  const svg = insideSvg || tag === "svg";
  const allowed = svg ? ALLOWED_SVG_TAGS.has(tag) : ALLOWED_HTML_TAGS.has(tag);
  const children = [...source.childNodes].flatMap((child) => copyNode(child, target, svg));
  // องค์ประกอบที่ไม่รู้จัก: เก็บเนื้อหาข้างในไว้ ข้อความและลิงก์จึงไม่หาย
  if (!allowed) return children;

  const copy = svg ? target.createElementNS(SVG_NAMESPACE, tag) : target.createElement(tag);
  for (const { name, value } of [...source.attributes]) {
    if (ALLOWED_ATTRIBUTES.has(name)) copy.setAttribute(name, value);
  }

  if (!svg && tag === "a") {
    const href = safeLink(source.getAttribute("href"));
    // ลิงก์ที่ไม่ปลอดภัยเหลือเป็นข้อความธรรมดา
    if (!href) return children;
    copy.setAttribute("href", href);
    // เปิดหน้าปลายทางของ Google โดยตรงในแท็บใหม่ ไม่มีหน้าอื่นคั่นกลาง
    copy.setAttribute("target", "_blank");
    copy.setAttribute("rel", "noopener noreferrer");
  }

  copy.append(...children);
  return [copy];
}

/** ใส่สไตล์ของ Google ให้ shadow root โดยไม่ต้องผ่อนนโยบายความปลอดภัยของหน้าเว็บ (CSP) */
function applyStyles(root: ShadowRoot, css: string): void {
  // ไม่โหลดสไตล์จากที่อื่นต่อ
  const local = css.replace(/@import[^;]*;/gi, "");
  if (!local.trim()) return;

  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(local);
    root.adoptedStyleSheets = [sheet];
  } catch {
    // เบราว์เซอร์รุ่นเก่าที่สร้างสไตล์ชีตแบบนี้ไม่ได้: ลิงก์ยังแสดงและกดได้ เพียงแต่ไม่มีหน้าตาของ Google
  }
}

/** แสดงแถบคำค้นหนึ่งแถบลงใน shadow root ที่ให้มา แทนที่ของเดิมทั้งหมด */
export function renderSearchSuggestions(root: ShadowRoot, html: string): void {
  // แยกวิเคราะห์ใน <template>: เนื้อหาข้างในไม่ทำงาน สคริปต์ไม่รัน รูปไม่ถูกโหลด และ <style> ไม่ถูกนำไปใช้
  // (ถ้าใช้ DOMParser เบราว์เซอร์จะพยายามใช้ <style> ในเอกสารที่สร้างขึ้น แล้วถูกนโยบายความปลอดภัยของหน้าเว็บบล็อก
  // ทำให้มีข้อผิดพลาดใน console ทุกครั้งที่แสดงแถบคำค้น)
  const template = root.ownerDocument.createElement("template");
  template.innerHTML = html;
  const parsed = template.content;
  const css = [...parsed.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");

  root.adoptedStyleSheets = [];
  applyStyles(root, css);
  root.replaceChildren(...[...parsed.childNodes].flatMap((node) => copyNode(node, root.ownerDocument, false)));
}
