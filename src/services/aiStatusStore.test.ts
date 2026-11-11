import { afterEach, describe, expect, it, vi } from "vitest";
import { type AiStatus, createAiStatusStore, describeAiProblem, hasAiProblem, parseAiStatus } from "./aiStatusStore";

const OK: AiStatus = { chat: "ok", transcribe: "ok" };
const NO_CREDIT: AiStatus = { chat: "quota", transcribe: "quota" };

describe("parseAiStatus", () => {
  it("อ่านคำตอบของเซิร์ฟเวอร์ และไม่สนใจข้อมูลอื่นที่แนบมา", () => {
    const payload = { ai: { status: "degraded", chat: "quota", transcribe: "ok", checkedAt: "2026-11-11T10:00:00Z" } };
    expect(parseAiStatus(payload)).toEqual({ chat: "quota", transcribe: "ok" });
  });

  it.each([
    null,
    "ok",
    {},
    { ai: null },
    { ai: { chat: "ok" } },
    { ai: { chat: "broken", transcribe: "ok" } },
    { ai: { chat: "ok", transcribe: 1 } },
    { ok: true, service: "javis-voice-agent" }
  ])("คืน null เมื่อรูปแบบไม่ถูกต้องหรือเป็นเซิร์ฟเวอร์รุ่นเก่า (%j)", (payload) => {
    expect(parseAiStatus(payload)).toBeNull();
  });
});

describe("describeAiProblem", () => {
  it("ไม่แจ้งอะไรเมื่อใช้งานได้ ยังไม่รู้สถานะ หรือปัญหาเป็นแค่ชั่วคราว", () => {
    expect(describeAiProblem(null, true)).toBeNull();
    expect(describeAiProblem(OK, true)).toBeNull();
    expect(describeAiProblem({ chat: "unchecked", transcribe: "unchecked" }, true)).toBeNull();
    expect(describeAiProblem({ chat: "unreachable", transcribe: "unreachable" }, true)).toBeNull();
  });

  it("บอกสาเหตุและสิ่งที่ต้องทำเมื่อ Javis ตอบไม่ได้", () => {
    expect(describeAiProblem(NO_CREDIT, false)).toMatchObject({ scope: "chat", reason: "quota" });
    expect(describeAiProblem(NO_CREDIT, false)?.detail).toContain("เติมเครดิต");
    expect(describeAiProblem({ chat: "auth", transcribe: "auth" }, false)?.detail).toContain("กุญแจ API");
    expect(describeAiProblem({ chat: "model", transcribe: "ok" }, false)?.detail).toContain("โมเดล AI");
  });

  it("ปัญหาการแปลงเสียงแจ้งเฉพาะอุปกรณ์ที่ส่งเสียงไปแปลงบนเซิร์ฟเวอร์ และชวนให้พิมพ์แทน", () => {
    const status: AiStatus = { chat: "ok", transcribe: "model" };
    expect(describeAiProblem(status, false)).toBeNull();
    expect(describeAiProblem(status, true)).toMatchObject({ scope: "voice", reason: "model" });
    expect(describeAiProblem(status, true)?.detail).toContain("พิมพ์ข้อความ");
  });

  it("ถ้าตอบไม่ได้ด้วย ให้แจ้งเรื่องตอบไม่ได้ก่อนเรื่องเสียง", () => {
    expect(describeAiProblem({ chat: "quota", transcribe: "model" }, true)?.scope).toBe("chat");
  });
});

describe("hasAiProblem", () => {
  it("นับเฉพาะปัญหาที่ต้องให้ผู้ดูแลแก้", () => {
    expect(hasAiProblem(null)).toBe(false);
    expect(hasAiProblem(OK)).toBe(false);
    expect(hasAiProblem({ chat: "unreachable", transcribe: "unchecked" })).toBe(false);
    expect(hasAiProblem({ chat: "ok", transcribe: "model" })).toBe(true);
    expect(hasAiProblem(NO_CREDIT)).toBe(true);
  });
});

describe("createAiStatusStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** เซิร์ฟเวอร์จำลอง: ตอบตามคิว ถ้าคิวหมดจะตอบค่าสุดท้ายซ้ำ */
  function fakeServer(...replies: Array<AiStatus | null | Error>) {
    let calls = 0;
    const load = () => {
      const reply = replies[Math.min(calls, replies.length - 1)];
      calls += 1;
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply ?? null);
    };
    return { load, calls: () => calls };
  }

  it("ยังไม่รู้สถานะจนกว่าจะถามเซิร์ฟเวอร์", async () => {
    const store = createAiStatusStore(fakeServer(NO_CREDIT).load);
    expect(store.get()).toBeNull();
    await store.refresh();
    expect(store.get()).toEqual(NO_CREDIT);
  });

  it("แจ้งผู้ติดตามเฉพาะเมื่อสถานะเปลี่ยนจริง", async () => {
    const store = createAiStatusStore(fakeServer(NO_CREDIT, NO_CREDIT, OK).load);
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    await store.refresh();
    const first = store.get();
    await store.refresh();
    expect(notified).toBe(1);
    // ค่าเดิมต้องเป็นอ็อบเจกต์เดิม ไม่เช่นนั้นหน้าจอจะวาดใหม่ไม่รู้จบ
    expect(store.get()).toBe(first);

    await store.refresh();
    expect(notified).toBe(2);
    expect(store.get()).toEqual(OK);

    unsubscribe();
  });

  it("ถามไม่สำเร็จ: คงสถานะล่าสุดที่รู้ไว้ ไม่ล้างคำเตือนทิ้ง", async () => {
    const store = createAiStatusStore(fakeServer(NO_CREDIT, new Error("offline"), null).load);
    await store.refresh();
    await store.refresh();
    expect(store.get()).toEqual(NO_CREDIT);
    await store.refresh();
    expect(store.get()).toEqual(NO_CREDIT);
  });

  it("คำขอที่ซ้อนกันรวมเป็นการถามครั้งเดียว", async () => {
    const server = fakeServer(OK);
    const store = createAiStatusStore(server.load);
    await Promise.all([store.refresh(), store.refresh(), store.refresh()]);
    expect(server.calls()).toBe(1);
  });

  it("คำขอจริงล้มเหลว: ถามสถานะใหม่ทันที", async () => {
    const server = fakeServer(OK, NO_CREDIT);
    const store = createAiStatusStore(server.load);
    await store.refresh();

    store.noteRequest(false);
    await store.refresh();
    expect(store.get()).toEqual(NO_CREDIT);
  });

  it("คำขอจริงสำเร็จระหว่างที่แจ้งปัญหาอยู่: ถามใหม่เพื่อเอาคำเตือนออก", async () => {
    const server = fakeServer(NO_CREDIT, OK);
    const store = createAiStatusStore(server.load);
    await store.refresh();

    store.noteRequest(true);
    await store.refresh();
    expect(store.get()).toEqual(OK);
  });

  it("คำขอจริงสำเร็จตอนปกติ: ไม่ถามเซิร์ฟเวอร์เพิ่ม", async () => {
    const server = fakeServer(OK);
    const store = createAiStatusStore(server.load);
    await store.refresh();

    store.noteRequest(true);
    await store.refresh();
    expect(server.calls()).toBe(2);
    store.noteRequest(true);
    expect(server.calls()).toBe(2);
  });

  it("ระหว่างที่มีปัญหา ถามซ้ำทุกนาทีจนหาย แล้วหยุดถาม", async () => {
    vi.useFakeTimers();
    const server = fakeServer(NO_CREDIT, NO_CREDIT, OK);
    const store = createAiStatusStore(server.load);

    const stop = store.watch();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get()).toEqual(NO_CREDIT);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.get()).toEqual(OK);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(server.calls()).toBe(3);

    stop();
  });

  it("เปิดแอปตอนเซิร์ฟเวอร์เพิ่งเริ่มและยังตรวจไม่เสร็จ: ถามซ้ำเร็ว ๆ จนรู้ผล", async () => {
    vi.useFakeTimers();
    const unchecked: AiStatus = { chat: "unchecked", transcribe: "unchecked" };
    const server = fakeServer(unchecked, unchecked, NO_CREDIT);
    const store = createAiStatusStore(server.load);

    const stop = store.watch();
    await vi.advanceTimersByTimeAsync(0);
    expect(describeAiProblem(store.get(), false)).toBeNull();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(server.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(store.get()).toEqual(NO_CREDIT);

    stop();
  });

  it("รู้ผลตั้งแต่ครั้งแรก: ไม่ถามซ้ำช่วงเริ่มต้น", async () => {
    vi.useFakeTimers();
    const server = fakeServer(OK);
    const store = createAiStatusStore(server.load);

    const stop = store.watch();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(server.calls()).toBe(1);

    stop();
  });

  it("ถามเซิร์ฟเวอร์ไม่ได้ตอนเปิดแอป: ลองซ้ำช่วงแรก แล้วเหลือนาทีละครั้ง", async () => {
    vi.useFakeTimers();
    const server = fakeServer(new Error("offline"));
    const store = createAiStatusStore(server.load);

    const stop = store.watch();
    await vi.advanceTimersByTimeAsync(22_000);
    expect(server.calls()).toBe(4);
    await vi.advanceTimersByTimeAsync(38_000);
    expect(server.calls()).toBe(5);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.calls()).toBe(6);

    stop();
  });

  it("หยุดติดตามระหว่างรอถามซ้ำ: ไม่ถามเซิร์ฟเวอร์อีก", async () => {
    vi.useFakeTimers();
    const server = fakeServer({ chat: "unchecked", transcribe: "unchecked" });
    const store = createAiStatusStore(server.load);

    const stop = store.watch();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(server.calls()).toBe(1);
  });

  it("หยุดติดตามแล้วไม่ถามเซิร์ฟเวอร์อีก", async () => {
    vi.useFakeTimers();
    const server = fakeServer(NO_CREDIT);
    const store = createAiStatusStore(server.load);

    const stop = store.watch();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(server.calls()).toBe(1);
  });
});
