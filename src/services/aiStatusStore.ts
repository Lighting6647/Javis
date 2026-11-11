import { fetchWithTimeout } from "./http";

/** สถานะของบริการ AI หนึ่งอย่าง ตามที่เซิร์ฟเวอร์รายงานใน /api/status */
export type AiServiceState = "unchecked" | "ok" | "quota" | "auth" | "model" | "unreachable";

export interface AiStatus {
  /** การคิดคำตอบ */
  chat: AiServiceState;
  /** การแปลงเสียงเป็นข้อความบนเซิร์ฟเวอร์ (ใช้เฉพาะแอปเดสก์ท็อป) */
  transcribe: AiServiceState;
}

/** สาเหตุที่ลองใหม่แล้วไม่หาย ต้องให้ผู้ดูแลระบบแก้ */
type BlockingReason = "quota" | "auth" | "model";

export interface AiProblem {
  /** chat: Javis ตอบไม่ได้เลย · voice: ตอบได้แต่ฟังเสียงพูดไม่ได้ */
  scope: "chat" | "voice";
  reason: BlockingReason;
  title: string;
  detail: string;
}

const STATES: readonly AiServiceState[] = ["unchecked", "ok", "quota", "auth", "model", "unreachable"];
const STATUS_TIMEOUT_MS = 8_000;
/** ระหว่างที่ยังมีปัญหา ถามเซิร์ฟเวอร์ซ้ำเป็นระยะ เพื่อให้แถบแจ้งเตือนหายเองเมื่อผู้ดูแลแก้แล้ว */
const POLL_WHILE_BROKEN_MS = 60_000;
/** กลับมาที่แอปหลังไม่ได้ถามนานเท่านี้ ให้ถามใหม่ */
const STALE_AFTER_MS = 30_000;
/** เปิดแอปแล้วเซิร์ฟเวอร์ยังไม่รู้ผล (เพิ่งเริ่ม): ถามซ้ำถี่ ๆ ช่วงแรก การตรวจบัญชีปกติจบภายในไม่กี่วินาที */
const SETTLE_RETRY_MS: readonly number[] = [2_000, 5_000, 15_000];

function isBlocking(state: AiServiceState): state is BlockingReason {
  return state === "quota" || state === "auth" || state === "model";
}

function readState(value: unknown): AiServiceState | null {
  return STATES.find((state) => state === value) ?? null;
}

/** อ่านคำตอบของ /api/status คืน null ถ้าไม่ใช่รูปแบบที่รู้จัก (เช่น เซิร์ฟเวอร์รุ่นเก่า) */
export function parseAiStatus(payload: unknown): AiStatus | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { ai } = payload as { ai?: unknown };
  if (typeof ai !== "object" || ai === null) return null;

  const chat = readState((ai as { chat?: unknown }).chat);
  const transcribe = readState((ai as { transcribe?: unknown }).transcribe);
  return chat && transcribe ? { chat, transcribe } : null;
}

export function hasAiProblem(status: AiStatus | null): boolean {
  return status !== null && (isBlocking(status.chat) || isBlocking(status.transcribe));
}

/**
 * ยังไม่รู้ว่า Javis ตอบได้ไหม เช่น เปิดแอปตอนเซิร์ฟเวอร์เพิ่งเริ่มและยังตรวจบัญชี AI ไม่เสร็จ
 * ต้องถามซ้ำ ไม่เช่นนั้นคำเตือนจะไม่ขึ้นจนกว่าผู้ใช้จะส่งข้อความแล้วล้มเหลว
 */
export function isAiStatusUnsettled(status: AiStatus | null): boolean {
  return status === null || status.chat === "unchecked" || status.chat === "unreachable";
}

const CHAT_DETAIL: Record<BlockingReason, string> = {
  quota: "เครดิตของบัญชี AI หมด กรุณาแจ้งผู้ดูแลระบบให้เติมเครดิต",
  auth: "กุญแจ API ของระบบใช้งานไม่ได้ กรุณาแจ้งผู้ดูแลระบบให้ตรวจการตั้งค่า",
  model: "โมเดล AI ที่ตั้งค่าไว้ไม่พร้อมใช้ กรุณาแจ้งผู้ดูแลระบบให้ตรวจการตั้งค่า"
};

/**
 * แปลงสถานะเป็นข้อความสำหรับแถบแจ้งเตือน คืน null เมื่อไม่มีอะไรต้องบอกผู้ใช้
 * @param usesServerTranscription อุปกรณ์นี้ส่งเสียงไปแปลงบนเซิร์ฟเวอร์หรือไม่ (แอปเดสก์ท็อป)
 */
export function describeAiProblem(status: AiStatus | null, usesServerTranscription: boolean): AiProblem | null {
  if (!status) return null;

  if (isBlocking(status.chat)) {
    return {
      scope: "chat",
      reason: status.chat,
      title: "Javis ยังตอบไม่ได้ในตอนนี้",
      detail: CHAT_DETAIL[status.chat]
    };
  }

  // บนเว็บและมือถือ อุปกรณ์แปลงเสียงเอง ปัญหาการแปลงเสียงบนเซิร์ฟเวอร์จึงไม่กระทบผู้ใช้
  if (usesServerTranscription && isBlocking(status.transcribe)) {
    return {
      scope: "voice",
      reason: status.transcribe,
      title: "Javis ยังฟังเสียงพูดไม่ได้ในตอนนี้",
      detail: "พิมพ์ข้อความคุยกับ Javis แทนได้ และกรุณาแจ้งผู้ดูแลระบบให้ตรวจการตั้งค่าการแปลงเสียง"
    };
  }

  return null;
}

export type LoadAiStatus = () => Promise<AiStatus | null>;

/** เก็บสถานะบัญชี AI ล่าสุดที่เซิร์ฟเวอร์รายงาน ให้หน้าจอบอกผู้ใช้ได้ก่อนที่เขาจะพูดแล้วไม่ได้คำตอบ */
export function createAiStatusStore(load: LoadAiStatus, now: () => number = Date.now) {
  let status: AiStatus | null = null;
  let loadedAt = 0;
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: AiStatus) => {
    loadedAt = now();
    if (status && status.chat === next.chat && status.transcribe === next.transcribe) return;
    status = next;
    listeners.forEach((listener) => listener());
  };

  /** ถามสถานะจากเซิร์ฟเวอร์ ถ้าถามไม่สำเร็จจะคงสถานะล่าสุดที่รู้ไว้ และคำขอที่ซ้อนกันจะรวมเป็นครั้งเดียว */
  const refresh = (): Promise<void> => {
    pending ??= load()
      .then((next) => {
        if (next) set(next);
      })
      .catch(() => undefined)
      .finally(() => {
        pending = null;
      });
    return pending;
  };

  return {
    get: (): AiStatus | null => status,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,

    /**
     * รับรู้ผลของคำขอจริง: คำขอล้มเหลวอาจเป็นปัญหาใหม่ ส่วนคำขอสำเร็จระหว่างที่แจ้งปัญหาอยู่แปลว่าหายแล้ว
     * ทั้งสองกรณีถามสถานะใหม่ทันที ไม่ต้องรอรอบถัดไป
     */
    noteRequest: (succeeded: boolean): void => {
      if (!succeeded || hasAiProblem(status)) void refresh();
    },

    /** เริ่มติดตามสถานะ คืนฟังก์ชันสำหรับหยุด */
    watch: (): (() => void) => {
      let stopped = false;
      let settleTimer: ReturnType<typeof setTimeout> | undefined;

      /** ยังไม่รู้ผล: ถามซ้ำตามช่วงเวลาที่กำหนด แล้วหยุดทันทีที่รู้ผล */
      const settle = (attempt: number) => {
        const delay = SETTLE_RETRY_MS[attempt];
        if (stopped || delay === undefined || !isAiStatusUnsettled(status)) return;
        settleTimer = setTimeout(() => {
          void refresh().then(() => settle(attempt + 1));
        }, delay);
      };
      void refresh().then(() => settle(0));

      const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
      const poll = setInterval(() => {
        if (visible() && (hasAiProblem(status) || isAiStatusUnsettled(status))) void refresh();
      }, POLL_WHILE_BROKEN_MS);
      const onVisible = () => {
        if (visible() && now() - loadedAt > STALE_AFTER_MS) void refresh();
      };

      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
      return () => {
        stopped = true;
        clearTimeout(settleTimer);
        clearInterval(poll);
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      };
    }
  };
}

async function loadAiStatus(): Promise<AiStatus | null> {
  const response = await fetchWithTimeout("/api/status", { timeoutMs: STATUS_TIMEOUT_MS });
  if (!response.ok) return null;
  return parseAiStatus(await response.json());
}

export const aiStatusStore = createAiStatusStore(loadAiStatus);
