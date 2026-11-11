/**
 * โค้ดที่ถูกส่งไปรันในหน้าเว็บภายนอก (เบราว์เซอร์ในตัวของแอปเดสก์ท็อป)
 * แต่ละฟังก์ชันต้องอยู่ได้ด้วยตัวเอง ห้ามอ้างถึงตัวแปรหรือ import ใดนอกตัวฟังก์ชัน
 * เพราะจะถูกแปลงเป็นข้อความด้วย toString() แล้วไปรันในอีกโลกหนึ่ง
 */

interface RawField {
  id: string;
  label: string;
  type: string;
  options?: string[];
}

interface RawContext {
  url: string;
  title: string;
  fields: RawField[];
}

interface RawFillResult {
  filled: number;
  missing: string[];
  failure?: "page-changed";
}

/** อ่านช่องกรอกข้อมูลที่มองเห็นและกรอกได้ พร้อมติดรหัสไว้กับแต่ละช่องเพื่อใช้ตอนกรอก */
function extractFormFields(): RawContext {
  const MAX_FIELDS = 40;
  const SKIPPED_TYPES = ["password", "hidden", "file", "submit", "button", "reset", "image"];
  // ช่องที่ Javis ไม่แตะเด็ดขาด: รหัสผ่าน บัตรชำระเงิน และรหัสยืนยันแบบใช้ครั้งเดียว
  const SENSITIVE_HINT =
    /passw|pwd|otp|one.?time|cvv|cvc|card.?num|credit|debit|security.?code|\bpin\b|รหัสผ่าน|บัตรเครดิต|บัตรเดบิต|เลขบัตร|หมายเลขบัตร|รหัสยืนยัน/i;
  const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

  document.querySelectorAll("[data-javis-field]").forEach((element) => element.removeAttribute("data-javis-field"));

  const fields: RawField[] = [];
  const elements = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")
  );

  for (const element of elements) {
    if (fields.length >= MAX_FIELDS) break;

    const tag = element.tagName;
    const type =
      tag === "SELECT" ? "select" : tag === "TEXTAREA" ? "textarea" : (element.getAttribute("type") || "text").toLowerCase();
    if (SKIPPED_TYPES.includes(type)) continue;
    if (element.disabled || ("readOnly" in element && element.readOnly)) continue;

    const box = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (box.width === 0 || box.height === 0 || style.visibility === "hidden" || style.display === "none") continue;

    const labelledBy = element.getAttribute("aria-labelledby");
    const label =
      clean(element.getAttribute("aria-label")) ||
      clean(element.labels?.[0]?.textContent) ||
      clean(labelledBy ? document.getElementById(labelledBy)?.textContent : "") ||
      clean(element.getAttribute("placeholder")) ||
      clean(element.getAttribute("name")) ||
      clean(element.id);
    if (!label) continue;

    const autocomplete = (element.getAttribute("autocomplete") || "").toLowerCase();
    const hint = `${label} ${element.getAttribute("name") || ""} ${element.id} ${autocomplete}`;
    if (autocomplete.startsWith("cc-") || autocomplete === "one-time-code" || SENSITIVE_HINT.test(hint)) continue;

    const id = `f${fields.length + 1}`;
    element.setAttribute("data-javis-field", id);

    const field: RawField = { id, label: label.slice(0, 80), type };
    if (element instanceof HTMLSelectElement) {
      field.options = Array.from(element.options)
        .slice(0, 30)
        .map((option) => clean(option.text).slice(0, 60))
        .filter(Boolean);
    }
    fields.push(field);
  }

  return { url: location.href, title: clean(document.title).slice(0, 120), fields };
}

/** กรอกค่าลงช่องที่ติดรหัสไว้ ไม่คลิกปุ่มและไม่ส่งฟอร์ม */
function fillFormFields(expectedUrl: string, values: Array<{ id: string; value: string }>): RawFillResult {
  // ผู้ใช้ยืนยันรายการสำหรับหน้าเดิม ถ้าหน้าเปลี่ยนไปแล้วต้องไม่กรอกลงหน้าใหม่
  if (location.href !== expectedUrl) {
    return { filled: 0, missing: values.map((entry) => entry.id), failure: "page-changed" };
  }

  const setValue = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
    // ตั้งค่าผ่านตัวตั้งค่าดั้งเดิม เพื่อให้เว็บที่สร้างด้วย React หรือเฟรมเวิร์กอื่นรับรู้การเปลี่ยนแปลง
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  let filled = 0;
  const missing: string[] = [];

  for (const { id, value } of values) {
    const element = /^f\d{1,3}$/.test(id) ? document.querySelector(`[data-javis-field="${id}"]`) : null;

    if (element instanceof HTMLSelectElement && !element.disabled) {
      const wanted = value.trim().toLowerCase();
      const option = Array.from(element.options).find(
        (candidate) => candidate.text.trim().toLowerCase() === wanted || candidate.value.toLowerCase() === wanted
      );
      if (!option) {
        missing.push(id);
        continue;
      }
      setValue(element, option.value);
      filled += 1;
    } else if (element instanceof HTMLTextAreaElement && !element.disabled && !element.readOnly) {
      setValue(element, value);
      filled += 1;
    } else if (element instanceof HTMLInputElement && !element.disabled && !element.readOnly) {
      const type = element.type.toLowerCase();
      if (type === "password" || type === "file" || type === "hidden") {
        missing.push(id);
      } else if (type === "checkbox" || type === "radio") {
        const wantChecked = /^(true|yes|1|on|ใช่|เลือก)$/i.test(value.trim());
        // ตัวเลือกแบบวงกลมยกเลิกด้วยการคลิกซ้ำไม่ได้ จึงรับเฉพาะคำสั่งให้เลือก
        if (type === "radio" && !wantChecked) {
          missing.push(id);
          continue;
        }
        if (element.checked !== wantChecked) element.click();
        filled += 1;
      } else {
        setValue(element, value);
        filled += 1;
      }
    } else {
      missing.push(id);
    }
  }

  return { filled, missing };
}

export const EXTRACT_FIELDS_SCRIPT = `(${extractFormFields.toString()})()`;

export function buildFillScript(expectedUrl: string, values: Array<{ id: string; value: string }>): string {
  return `(${fillFormFields.toString()})(${JSON.stringify(expectedUrl)}, ${JSON.stringify(values)})`;
}
