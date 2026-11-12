import type { ChatEvent, FillProposal, MemoryEntry, PageField, WebSource } from "./chatProtocol.js";
import { readUpstreamErrorCodes } from "./upstreamError.js";

export const OPEN_PAGE_TOOL = "open_web_page";
export const FILL_FORM_TOOL = "fill_form_fields";
export const REMEMBER_TOOL = "remember";
export const FORGET_TOOL = "forget_memory";
/** เครื่องมือที่ AI ใช้ขอให้เซิร์ฟเวอร์ค้นเว็บ เมื่อการค้นทำเป็นขั้นแยกจากคำขอปกติ */
export const SEARCH_WEB_TOOL = "search_web";
export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_SOURCES = 6;
export const MAX_FILL_VALUE_LENGTH = 500;
export const MAX_MEMORY_LENGTH = 200;
export const MAX_MEMORIES_PER_REPLY = 3;
/** แถบคำค้นที่เกี่ยวข้องของ Google ต่อหนึ่งคำตอบ: จำนวนสูงสุด และขนาดสูงสุดของแต่ละแถบ */
export const MAX_SUGGESTION_BLOCKS = 3;
export const MAX_SUGGESTION_LENGTH = 20_000;

const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 120;
/** ตัวเลขยาวติดกันตั้งแต่ 13 หลัก คือรูปแบบของเลขบัตรและเลขประจำตัว */
const LONG_NUMBER = /\d{13,}/;
const SECRET_WORDS = /รหัสผ่าน|passw|pwd|\botp\b|cvv|cvc|\bpin\b|เลขบัตร|หมายเลขบัตร/i;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** รับเฉพาะลิงก์ http/https ที่ไม่ฝังชื่อผู้ใช้หรือรหัสผ่าน คืน null ถ้าไม่ปลอดภัย */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH || !URL.canParse(value)) return null;

  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.href;
}

/** ชื่อพารามิเตอร์คำค้นของหน้าค้นหาที่ใช้กันทั่วไป (Google, Bing, DuckDuckGo และ YouTube) */
const SEARCH_QUERY_PARAMS = ["q", "query", "search_query"];
/** ประโยคที่ใช้ถามเมื่อ AI สั่งเปิดหน้าค้นหาโดยไม่มีคำค้น */
const ASK_SEARCH_TOPIC_TEXT = "ต้องการให้ค้นหาเรื่องอะไรดีครับ";

/**
 * ลิงก์เป็นหน้าค้นหาที่ไม่มีคำค้น เช่น https://www.google.com/search?q=
 * เกิดเมื่อผู้ใช้สั่งค้นหาโดยยังไม่ได้บอกเรื่อง (เสียงพูดที่ถูกตัดกลางประโยคมักเหลือแค่ "ค้นหา")
 * @param url ลิงก์ที่ผ่าน safeHttpUrl แล้ว
 */
function isEmptySearchUrl(url: string): boolean {
  const params = new URL(url).searchParams;
  const queries = SEARCH_QUERY_PARAMS.filter((name) => params.has(name)).map((name) => params.get(name) ?? "");
  return queries.length > 0 && queries.every((query) => !query.trim());
}

function cleanTitle(value: unknown, url: string): string {
  const title = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (title || new URL(url).hostname).slice(0, MAX_TITLE_LENGTH);
}

/** ทำข้อความที่ได้จาก AI ให้เป็นบรรทัดเดียว ไม่มีอักขระควบคุม และไม่ยาวเกินกำหนด */
function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** ทำข้อความความจำให้เป็นบรรทัดเดียว ไม่มีอักขระควบคุม และไม่ยาวเกินกำหนด */
export function cleanMemoryText(value: unknown): string {
  return cleanLine(value, MAX_MEMORY_LENGTH);
}

/** ข้อมูลที่ Javis ไม่เก็บเป็นความจำ: รหัสผ่าน รหัสยืนยัน เลขบัตร และเลขประจำตัว */
export function isSensitiveMemory(text: string): boolean {
  return SECRET_WORDS.test(text) || LONG_NUMBER.test(text.replace(/[\s-]/g, ""));
}

/** การเรียกเครื่องมือความจำหนึ่งครั้ง พร้อมผลที่ต้องแจ้งกลับให้ AI */
export interface MemoryToolCall {
  callId: string;
  name: string;
  arguments: string;
  output: string;
}

export interface ResponseReducer {
  /** รับเหตุการณ์หนึ่งรายการจากต้นทาง คืนเหตุการณ์ที่ต้องส่งให้หน้าเว็บทันที */
  push(event: unknown): ChatEvent[];
  /**
   * เซิร์ฟเวอร์เสนอหน้าแหล่งข้อมูลของคำตอบที่ได้จากการค้นเว็บ ให้ผู้ใช้เปิดดู
   * ต่างจากหน้าที่ AI สั่งเปิด: หน้านี้เซิร์ฟเวอร์เลือกจากผลค้นเอง เนื้อหาเว็บจึงชักนำไปหน้าอื่นไม่ได้ และเปิดให้เองได้แม้รอบนั้นอ่านเว็บมา
   * ไม่มีผลถ้า AI สั่งเปิดหน้าเว็บตามคำสั่งของผู้ใช้ไว้แล้ว หรือเคยเสนอไปแล้ว
   * @param auto เปิดให้เองเมื่อผู้ใช้สั่งให้หา (เฉพาะลิงก์ https) ไม่เช่นนั้นแนบเป็นลิงก์ให้แตะ
   */
  suggestPage(candidate: { url: string; title: string }, auto: boolean): void;
  /** เรียกเมื่อสตรีมจบ คืนเหตุการณ์ปิดท้าย (ลิงก์ที่สั่งเปิด รายการกรอกฟอร์ม ความจำ และแหล่งที่มา) */
  finish(): ChatEvent[];
  /** ต้นทางแจ้งว่าการตอบล้มเหลว */
  readonly failed: boolean;
  /** รหัสข้อผิดพลาดที่ต้นทางแจ้งมาพร้อมความล้มเหลว ว่างถ้าไม่ได้แจ้ง */
  readonly failureCodes: string[];
  /** ต้นทางแจ้งว่าตอบจบแล้ว */
  readonly done: boolean;
  /** การเรียกเครื่องมือความจำในคำตอบนี้ */
  readonly memoryCalls: MemoryToolCall[];
  /**
   * AI เรียกเครื่องมือความจำแล้วหยุดโดยยังไม่ได้ตอบผู้ใช้
   * ต้องแจ้งผลกลับไปให้ AI ตอบต่อ ไม่เช่นนั้นคำถามของผู้ใช้จะไม่ได้คำตอบ
   */
  readonly needsFollowUp: boolean;
  /** ประโยคสำรองเมื่อขอให้ AI ตอบต่อไม่สำเร็จ */
  readonly memoryFallbackText: string;
  /**
   * AI ขอให้ค้นเว็บผ่านเครื่องมือของ Javis: ค่าคือคำค้นที่ AI เสนอ (ว่างถ้าอ่านคำค้นไม่ได้)
   * null คือไม่ได้ขอค้น เซิร์ฟเวอร์เป็นผู้ค้นและตอบต่อในขั้นถัดไป
   */
  readonly searchRequest: string | null;
}

export interface ResponseReducerOptions {
  /** ช่องกรอกข้อมูลของหน้าเว็บที่ผู้ใช้เปิดอยู่ */
  pageFields?: PageField[];
  /** ความจำที่ผู้ใช้มีอยู่แล้ว ใช้กันการจำซ้ำและตรวจรหัสตอนสั่งลืม */
  memories?: MemoryEntry[];
}

/**
 * แปลงเหตุการณ์สตรีมของ OpenAI Responses API เป็นเหตุการณ์ที่หน้าเว็บเข้าใจ
 * อ่านแหล่งที่มาจากหลายจุดของสตรีมเผื่อรูปแบบเหตุการณ์ย่อยเปลี่ยน และไม่เชื่อข้อมูลใดจาก AI ที่ไม่ผ่านการตรวจ
 */
export function createResponseReducer(options: ResponseReducerOptions = {}): ResponseReducer {
  let text = "";
  let searched = false;
  let searchAnnounced = false;
  let failed = false;
  const failureCodes = new Set<string>();
  let done = false;
  let page: { url: string; title: string } | null = null;
  /** หน้าแหล่งข้อมูลที่เซิร์ฟเวอร์เสนอหลังค้นเว็บ ใช้เมื่อ AI ไม่ได้สั่งเปิดหน้าใดเอง */
  let suggested: { url: string; title: string; auto: boolean } | null = null;
  /** AI สั่งเปิดหน้าค้นหาที่ไม่มีคำค้น: ไม่เปิด และถามผู้ใช้ว่าจะค้นเรื่องอะไรแทน */
  let searchTopicMissing = false;
  let fill: FillProposal[] | null = null;
  const sources = new Map<string, WebSource>();
  const suggestionBlocks: string[] = [];
  let searchRequest: string | null = null;
  /** ช่องที่หน้าเว็บของผู้ใช้มีจริง AI เสนอกรอกได้เฉพาะช่องในรายการนี้ */
  const fieldsById = new Map((options.pageFields ?? []).map((field) => [field.id, field]));

  const knownMemories = options.memories ?? [];
  const knownMemoryTexts = new Set(knownMemories.map((memory) => memory.text.toLowerCase()));
  const knownMemoryIds = new Set(knownMemories.map((memory) => memory.id));
  const memoryAdds: string[] = [];
  const memoryRemoves: string[] = [];
  const memoryCalls: MemoryToolCall[] = [];
  const seenCallIds = new Set<string>();

  const readFill = (rawArguments: unknown): FillProposal[] => {
    const proposals = new Map<string, FillProposal>();
    try {
      const args: unknown = JSON.parse(typeof rawArguments === "string" ? rawArguments : "");
      const entries = isObject(args) && Array.isArray(args.fields) ? args.fields : [];
      for (const entry of entries) {
        if (!isObject(entry) || typeof entry.field_id !== "string" || typeof entry.value !== "string") continue;
        const field = fieldsById.get(entry.field_id);
        const value = entry.value.trim();
        if (!field || !value || value.length > MAX_FILL_VALUE_LENGTH || proposals.has(field.id)) continue;
        proposals.set(field.id, { id: field.id, label: field.label, value });
      }
    } catch {
      // อาร์กิวเมนต์ไม่ใช่ JSON: ไม่เสนอกรอกอะไร
    }
    return [...proposals.values()];
  };

  const parseArguments = (raw: unknown): Json => {
    try {
      const args: unknown = JSON.parse(typeof raw === "string" ? raw : "");
      return isObject(args) ? args : {};
    } catch {
      return {};
    }
  };

  /** ตัดสินว่าจะจำเรื่องนี้ไหม คืนข้อความผลลัพธ์สำหรับแจ้ง AI */
  const remember = (args: Json): string => {
    const memory = cleanMemoryText(args.text);
    // เนื้อหาเว็บอาจแฝงคำสั่งให้จำสิ่งที่ผู้ใช้ไม่ได้บอก จึงไม่จำอะไรหลังจากเริ่มอ่านเว็บ
    if (searched) return "ไม่ได้บันทึก เพราะคำตอบรอบนี้อ่านข้อมูลจากเว็บ ให้ผู้ใช้สั่งจำใหม่อีกครั้ง";
    if (!memory) return "ไม่ได้บันทึก เพราะข้อความว่าง";
    if (isSensitiveMemory(memory)) return "ไม่ได้บันทึก เพราะเป็นข้อมูลอ่อนไหวที่ไม่เก็บเป็นความจำ";

    const key = memory.toLowerCase();
    if (knownMemoryTexts.has(key) || memoryAdds.some((added) => added.toLowerCase() === key)) return "มีความจำนี้อยู่แล้ว";
    if (memoryAdds.length >= MAX_MEMORIES_PER_REPLY) return "ไม่ได้บันทึก เพราะเกินจำนวนที่จำได้ต่อหนึ่งคำตอบ";

    memoryAdds.push(memory);
    return "บันทึกแล้ว";
  };

  const forget = (args: Json): string => {
    const id = typeof args.memory_id === "string" ? args.memory_id : "";
    if (!knownMemoryIds.has(id)) return "ไม่พบความจำนี้";
    if (!memoryRemoves.includes(id)) memoryRemoves.push(id);
    return "ลบแล้ว";
  };

  const readMemoryCall = (item: Json) => {
    const callId = typeof item.call_id === "string" ? item.call_id : "";
    // รายการเดียวกันอาจมาซ้ำในเหตุการณ์จบ ต้องไม่นับสองครั้ง
    if (!callId || seenCallIds.has(callId)) return;
    seenCallIds.add(callId);

    const args = parseArguments(item.arguments);
    memoryCalls.push({
      callId,
      name: String(item.name),
      arguments: typeof item.arguments === "string" ? item.arguments : "{}",
      output: item.name === REMEMBER_TOOL ? remember(args) : forget(args)
    });
  };

  const addSource = (annotation: unknown) => {
    if (!isObject(annotation) || annotation.type !== "url_citation") return;
    const url = safeHttpUrl(annotation.url);
    if (!url || sources.has(url) || sources.size >= MAX_SOURCES) return;
    sources.set(url, { url, title: cleanTitle(annotation.title, url) });
  };

  /** แถบคำค้นที่เกี่ยวข้องของ Google ส่งต่อให้หน้าเว็บตามที่ได้รับ โดยจำกัดจำนวนและขนาด */
  const addSuggestions = (html: unknown) => {
    const block = typeof html === "string" ? html.trim() : "";
    if (!block || block.length > MAX_SUGGESTION_LENGTH) return;
    if (suggestionBlocks.length >= MAX_SUGGESTION_BLOCKS || suggestionBlocks.includes(block)) return;
    suggestionBlocks.push(block);
  };

  const readItem = (item: unknown) => {
    if (!isObject(item)) return;

    if (item.type === "web_search_call") {
      searched = true;
    } else if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (isObject(part) && Array.isArray(part.annotations)) part.annotations.forEach(addSource);
      }
    } else if (item.type === "function_call" && item.name === OPEN_PAGE_TOOL && !page) {
      const args = parseArguments(item.arguments);
      const url = safeHttpUrl(args.url);
      if (url && isEmptySearchUrl(url)) searchTopicMissing = true;
      else if (url) page = { url, title: cleanTitle(args.title, url) };
    } else if (item.type === "function_call" && item.name === FILL_FORM_TOOL && !fill) {
      const proposals = readFill(item.arguments);
      if (proposals.length > 0) fill = proposals;
    } else if (item.type === "function_call" && (item.name === REMEMBER_TOOL || item.name === FORGET_TOOL)) {
      readMemoryCall(item);
    } else if (item.type === "function_call" && item.name === SEARCH_WEB_TOOL && !searchRequest) {
      // การขอค้นยังไม่ใช่การอ่านเว็บ จึงไม่กระทบการจำหรือการเปิดหน้าเว็บในคำขอเดียวกัน ใช้คำค้นแรกที่อ่านได้
      searchRequest = cleanLine(parseArguments(item.arguments).query, MAX_SEARCH_QUERY_LENGTH);
    }
  };

  return {
    push(event) {
      if (!isObject(event) || typeof event.type !== "string") return [];
      const { type } = event;

      if (type === "response.output_text.delta") {
        if (typeof event.delta !== "string" || !event.delta) return [];
        text += event.delta;
        return [{ type: "delta", text: event.delta }];
      }

      const startsSearch =
        type.startsWith("response.web_search_call.") ||
        (type === "response.output_item.added" && isObject(event.item) && event.item.type === "web_search_call");
      if (startsSearch) {
        searched = true;
        if (searchAnnounced) return [];
        searchAnnounced = true;
        return [{ type: "status", status: "searching" }];
      }

      if (type === "response.output_text.annotation.added") addSource(event.annotation);
      else if (type === "response.search_suggestions") addSuggestions(event.html);
      else if (type === "response.output_item.done") readItem(event.item);
      else if (type === "response.failed" || type === "error") {
        failed = true;
        readUpstreamErrorCodes(event).forEach((code) => failureCodes.add(code));
      }
      else if (type === "response.incomplete") done = true;
      else if (type === "response.completed") {
        done = true;
        if (isObject(event.response) && Array.isArray(event.response.output)) {
          event.response.output.forEach(readItem);
        }
      }
      return [];
    },

    suggestPage(candidate, auto) {
      if (suggested) return;
      const url = safeHttpUrl(candidate.url);
      if (!url) return;
      suggested = { url, title: cleanTitle(candidate.title, url), auto: auto && url.startsWith("https://") };
    },

    finish() {
      const events: ChatEvent[] = [];

      if (page) {
        // AI สั่งเปิดหน้าเว็บโดยไม่พูดอะไร: เติมประโยคให้ผู้ใช้ได้ยินว่าเกิดอะไรขึ้น
        if (!text.trim()) events.push({ type: "delta", text: `ได้เลยครับ นี่คือหน้า ${page.title} ครับ` });
        // ถ้ารอบนี้อ่านเนื้อหาจากเว็บมาก่อน ลิงก์อาจถูกเนื้อหานั้นชักนำ จึงให้ผู้ใช้กดเปิดเอง
        events.push({ type: "open", url: page.url, title: page.title, auto: !searched });
      } else if (suggested) {
        events.push({ type: "open", url: suggested.url, title: suggested.title, auto: suggested.auto });
      } else if (searchTopicMissing && !text.trim()) {
        // ไม่มีอะไรให้เปิดและ AI ไม่ได้พูดอะไร: ถามเรื่องที่จะค้น แทนการส่งคำตอบว่าง
        events.push({ type: "delta", text: ASK_SEARCH_TOPIC_TEXT });
      }
      if (fill) {
        if (!text.trim() && !page) {
          events.push({ type: "delta", text: "เตรียมข้อมูลไว้ให้แล้วครับ ตรวจรายการแล้วกดยืนยันเพื่อกรอกได้เลย" });
        }
        events.push({ type: "fill", fields: fill });
      }
      if (memoryAdds.length > 0 || memoryRemoves.length > 0) {
        events.push({ type: "memory", added: [...memoryAdds], removed: [...memoryRemoves] });
      }
      if (sources.size > 0) events.push({ type: "sources", sources: [...sources.values()] });
      if (suggestionBlocks.length > 0) events.push({ type: "suggestions", html: [...suggestionBlocks] });

      return events;
    },

    get failed() {
      return failed;
    },
    get failureCodes() {
      return [...failureCodes];
    },
    get done() {
      return done;
    },
    get memoryCalls() {
      return memoryCalls;
    },
    get needsFollowUp() {
      return memoryCalls.length > 0 && !text.trim() && !page && !fill;
    },
    get memoryFallbackText() {
      if (memoryAdds.length > 0) return "จำไว้แล้วครับ";
      if (memoryRemoves.length > 0) return "ลืมเรื่องนั้นให้แล้วครับ";
      return "เรื่องนี้ผมไม่ได้บันทึกไว้ครับ";
    },
    get searchRequest() {
      return searchRequest;
    }
  };
}
