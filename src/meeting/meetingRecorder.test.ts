import { describe, expect, it } from "vitest";
import { SPEECH_ERROR_TEXT } from "../conversation/messages";
import { ChatError } from "../conversation/types";
import { type DictationHandlers, SpeechError, type SpeechRecognizer } from "../speech/types";
import type { MeetingDraft, MeetingDraftPort } from "./meetingDraft";
import { MAX_TRANSCRIPT_LENGTH, MEETING_TEXT, MeetingRecorder, type MeetingResult, type SummaryRequest } from "./meetingRecorder";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** รอให้งานอะซิงก์ที่ค้างอยู่เดินจนสุด */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** ระบบฟังจำลองแบบฟังต่อเนื่อง: การทดสอบส่งคำพูดเข้าไปเอง และสั่งให้การฟังรอบนั้นจบหรือล้มเหลวได้ */
class FakeDictation implements SpeechRecognizer {
  prepareError: SpeechError | null = null;
  cancelCalls = 0;
  readonly sessions: Array<{ handlers: DictationHandlers; done: Deferred<void> }> = [];

  async prepare(): Promise<void> {
    if (this.prepareError) throw this.prepareError;
  }

  isOnDevice(): boolean {
    return false;
  }

  listen(): Promise<string> {
    return Promise.reject(new Error("โหมดประชุมต้องใช้การฟังต่อเนื่องเมื่อระบบฟังมีให้"));
  }

  dictate(handlers: DictationHandlers): Promise<void> {
    const done = deferred<void>();
    this.sessions.push({ handlers, done });
    return done.promise;
  }

  stop(): void {
    this.sessions.at(-1)?.done.resolve();
  }

  cancel(): void {
    this.cancelCalls += 1;
    this.sessions.at(-1)?.done.reject(new SpeechError("aborted"));
  }

  get current() {
    const session = this.sessions.at(-1);
    if (!session) throw new Error("ยังไม่ได้เริ่มฟัง");
    return session;
  }
}

/** ระบบฟังรุ่นที่ฟังได้ทีละช่วงคำพูดเท่านั้น */
class FakeUtterances implements SpeechRecognizer {
  readonly listens: Array<{ onPartial: (text: string) => void; result: Deferred<string> }> = [];

  async prepare(): Promise<void> {
    // พร้อมเสมอ
  }

  isOnDevice(): boolean {
    return false;
  }

  listen(onPartial: (text: string) => void): Promise<string> {
    const result = deferred<string>();
    this.listens.push({ onPartial, result });
    return result.promise;
  }

  stop(): void {
    // ไม่ใช้ในชุดนี้
  }

  cancel(): void {
    this.listens.at(-1)?.result.reject(new SpeechError("aborted"));
  }
}

class FakeDraft implements MeetingDraftPort {
  saved: MeetingDraft | null = null;
  clears = 0;

  load(): MeetingDraft | null {
    return this.saved;
  }

  save(draft: MeetingDraft): void {
    this.saved = structuredClone(draft);
  }

  clear(): void {
    this.clears += 1;
    this.saved = null;
  }
}

function setup(options: { recognizer?: SpeechRecognizer } = {}) {
  const dictation = new FakeDictation();
  const draft = new FakeDraft();
  /** นาฬิกาจำลองของเครื่อง (มิลลิวินาที) */
  const clock = { time: 1_000_000 };
  const waits: Array<{ ms: number; done: Deferred<void> }> = [];
  const summaries: Array<{ request: SummaryRequest; result: Deferred<string> }> = [];
  const results: MeetingResult[] = [];

  const recorder = new MeetingRecorder({
    recognizer: options.recognizer ?? dictation,
    draft,
    now: () => clock.time,
    wait: (ms) => {
      const done = deferred<void>();
      waits.push({ ms, done });
      return done.promise;
    },
    summarize: (request) => {
      const result = deferred<string>();
      summaries.push({ request, result });
      return result.promise;
    },
    onSummary: (result) => results.push(result)
  });

  /** ผู้ร่วมประชุมพูดจบหนึ่งช่วง หลังเวลาผ่านไปตามที่กำหนด */
  const say = (text: string, afterMs = 5_000) => {
    clock.time += afterMs;
    dictation.current.handlers.onFinal(text);
  };

  return { recorder, dictation, draft, clock, waits, summaries, results, say };
}

async function startRecording(options: { recognizer?: SpeechRecognizer } = {}) {
  const context = setup(options);
  await context.recorder.start();
  await settle();
  return context;
}

describe("MeetingRecorder", () => {
  it("เริ่มจด: เข้าสู่การจดและเปิดระบบฟังแบบต่อเนื่อง", async () => {
    const { recorder, dictation } = await startRecording();

    expect(recorder.getState()).toMatchObject({ status: "recording", startedAt: 1_000_000, entries: [], partial: "", notice: null });
    expect(dictation.sessions).toHaveLength(1);
  });

  it("เริ่มจด: เข้าสู่การจดในจังหวะเดียวกับที่สั่ง หน้าจอจึงสลับโหมดได้โดยไม่มีช่วงที่ไม่ได้อยู่โหมดใดเลย", () => {
    const { recorder, dictation, draft } = setup();
    draft.saved = { startedAt: 1, entries: [{ at: 1, text: "ของเก่า" }] };

    void recorder.start();

    expect(recorder.getState()).toMatchObject({ status: "recording", startedAt: 1_000_000, entries: [] });
    // ยังไม่รู้ว่าระบบฟังใช้ได้ จึงยังไม่เปิดฟังและยังไม่ทิ้งบันทึกค้างของครั้งก่อน
    expect(dictation.sessions).toHaveLength(0);
    expect(draft.saved).not.toBeNull();
  });

  it("สั่งพักทันทีหลังสั่งเริ่ม ก่อนระบบฟังจะพร้อม: ไม่เปิดระบบฟังตามมาทีหลัง", async () => {
    const { recorder, dictation } = setup();

    void recorder.start();
    recorder.pause();
    await settle();

    expect(recorder.getState().status).toBe("paused");
    expect(dictation.sessions).toHaveLength(0);
  });

  it("จดคำพูดทีละช่วง พร้อมเวลาที่ผ่านไปตั้งแต่เริ่ม และแสดงคำที่กำลังได้ยิน", async () => {
    const { recorder, dictation, say } = await startRecording();

    dictation.current.handlers.onPartial("วันนี้คุย");
    expect(recorder.getState().partial).toBe("วันนี้คุย");

    say("วันนี้คุยเรื่องเปิดตัวสินค้าใหม่", 5_000);
    say("  สมชายรับไปทำใบเสนอราคา  ", 16_000);

    expect(recorder.getState().partial).toBe("");
    expect(recorder.getState().entries).toEqual([
      { at: 5_000, text: "วันนี้คุยเรื่องเปิดตัวสินค้าใหม่" },
      { at: 21_000, text: "สมชายรับไปทำใบเสนอราคา" }
    ]);
  });

  it("ไม่จดช่วงที่ว่างเปล่า", async () => {
    const { recorder, say } = await startRecording();

    say("   ");

    expect(recorder.getState().entries).toEqual([]);
  });

  it("ระบบฟังจบเองระหว่างประชุม: เปิดฟังใหม่ทันที สิ่งที่จดไว้ยังอยู่ และไม่ขึ้นข้อความเตือน", async () => {
    const { recorder, dictation, clock, waits, say } = await startRecording();

    say("ช่วงแรก");
    clock.time += 60_000;
    dictation.current.done.resolve();
    await settle();

    expect(dictation.sessions).toHaveLength(2);
    expect(waits).toHaveLength(0);
    say("ช่วงที่สอง");
    expect(recorder.getState()).toMatchObject({ status: "recording", notice: null });
    expect(recorder.getState().entries.map((entry) => entry.text)).toEqual(["ช่วงแรก", "ช่วงที่สอง"]);
  });

  it("ระบบฟังที่ฟังได้ทีละช่วงคำพูด: จดผลของแต่ละรอบแล้วฟังต่อ", async () => {
    const utterances = new FakeUtterances();
    const { recorder, clock } = await startRecording({ recognizer: utterances });

    utterances.listens[0]?.onPartial("ช่วง");
    expect(recorder.getState().partial).toBe("ช่วง");
    clock.time += 4_000;
    utterances.listens[0]?.result.resolve("ช่วงแรก");
    await settle();
    clock.time += 4_000;
    utterances.listens[1]?.result.resolve("");
    await settle();

    expect(utterances.listens).toHaveLength(3);
    expect(recorder.getState().entries).toEqual([{ at: 4_000, text: "ช่วงแรก" }]);
  });

  it("ระบบฟังสะดุดชั่วคราว: บอกว่ากำลังลองใหม่ รอ แล้วจดต่อ โดยสิ่งที่จดไว้ยังอยู่", async () => {
    const { recorder, dictation, waits, say } = await startRecording();

    say("ช่วงแรก");
    dictation.current.done.reject(new SpeechError("network"));
    await settle();

    expect(recorder.getState()).toMatchObject({ status: "recording", notice: { tone: "info", text: MEETING_TEXT.retrying } });
    expect(waits.map((wait) => wait.ms)).toEqual([1000]);

    waits[0]?.done.resolve();
    await settle();

    expect(dictation.sessions).toHaveLength(2);
    expect(recorder.getState()).toMatchObject({ status: "recording", notice: null });
    expect(recorder.getState().entries).toHaveLength(1);
  });

  it("ระบบฟังสะดุดติดกันจนเกินจำนวนครั้ง: พักการจดพร้อมบอกสาเหตุ สิ่งที่จดไว้ยังอยู่", async () => {
    const { recorder, dictation, waits, say } = await startRecording();

    say("ช่วงแรก");
    for (let round = 0; round < 12 && recorder.getState().status === "recording"; round += 1) {
      dictation.current.done.reject(new SpeechError("network"));
      await settle();
      waits.at(-1)?.done.resolve();
      await settle();
    }

    expect(recorder.getState()).toMatchObject({ status: "paused", notice: { tone: "error", text: SPEECH_ERROR_TEXT.network } });
    expect(recorder.getState().entries).toHaveLength(1);
  });

  it("ใช้ไมโครโฟนไม่ได้ระหว่างประชุม: พักการจดทันที ไม่ลองใหม่ และสิ่งที่จดไว้ยังอยู่", async () => {
    const { recorder, dictation, waits, say } = await startRecording();

    say("ช่วงแรก");
    dictation.current.done.reject(new SpeechError("permission-denied"));
    await settle();

    expect(recorder.getState()).toMatchObject({ status: "paused", notice: { tone: "error", text: SPEECH_ERROR_TEXT["permission-denied"] } });
    expect(waits).toHaveLength(0);
    expect(recorder.getState().entries).toHaveLength(1);
  });

  it("ระบบฟังเริ่มแล้วจบเองทันทีซ้ำ ๆ โดยไม่ได้ยินอะไร: เว้นจังหวะ แล้วพักการจดเมื่อเกินจำนวนครั้ง", async () => {
    const { recorder, dictation, waits } = await startRecording();

    for (let round = 0; round < 30 && recorder.getState().status === "recording"; round += 1) {
      dictation.current.done.resolve();
      await settle();
      waits.at(-1)?.done.resolve();
      await settle();
    }

    expect(waits.length).toBeGreaterThan(0);
    expect(waits.every((wait) => wait.ms === 1000)).toBe(true);
    expect(recorder.getState()).toMatchObject({ status: "paused", notice: { tone: "error", text: MEETING_TEXT.unstable } });
  });

  it("พักการจด: เก็บคำที่กำลังได้ยินไว้ด้วย ปิดระบบฟัง และกลับมาจดต่อได้", async () => {
    const { recorder, dictation, clock, say } = await startRecording();

    say("ช่วงแรก", 5_000);
    clock.time += 3_000;
    dictation.current.handlers.onPartial("พูดค้างอยู่");
    recorder.pause();
    await settle();

    expect(recorder.getState()).toMatchObject({ status: "paused", partial: "" });
    expect(recorder.getState().entries).toEqual([
      { at: 5_000, text: "ช่วงแรก" },
      { at: 8_000, text: "พูดค้างอยู่" }
    ]);
    expect(dictation.cancelCalls).toBeGreaterThan(0);
    const sessionsWhilePaused = dictation.sessions.length;

    recorder.resume();
    await settle();

    expect(recorder.getState().status).toBe("recording");
    expect(dictation.sessions).toHaveLength(sessionsWhilePaused + 1);
    say("ช่วงหลังพัก", 10_000);
    expect(recorder.getState().entries.at(-1)).toEqual({ at: 18_000, text: "ช่วงหลังพัก" });
  });

  it("พักเพราะเหตุจากภายนอก (เช่นการฟังย้ายไปแท็บอื่น): บอกเหตุผลให้ผู้ใช้รู้ว่าทำไมหยุดจด", async () => {
    const { recorder, say } = await startRecording();

    say("ช่วงแรก");
    recorder.pause("การฟังย้ายไปอีกแท็บหนึ่ง");

    expect(recorder.getState()).toMatchObject({ status: "paused", notice: { tone: "info", text: "การฟังย้ายไปอีกแท็บหนึ่ง" } });
    expect(recorder.getState().entries).toHaveLength(1);
  });

  it("คำพูดที่มาถึงหลังพักการจดแล้ว (จากการฟังรอบเก่า) ไม่ถูกจด", async () => {
    const { recorder, dictation, say } = await startRecording();

    say("ช่วงแรก");
    const stale = dictation.current.handlers;
    recorder.pause();
    stale.onFinal("มาช้า");
    stale.onPartial("มาช้า");

    expect(recorder.getState().entries.map((entry) => entry.text)).toEqual(["ช่วงแรก"]);
    expect(recorder.getState().partial).toBe("");
  });

  it("จบและสรุป: ส่งบันทึกทั้งหมดให้ AI ครั้งเดียว แสดงคำสรุปที่ทยอยมา แล้วส่งผลให้แอป", async () => {
    const { recorder, dictation, clock, summaries, results, draft, say } = await startRecording();

    say("วันนี้คุยเรื่องเปิดตัวสินค้าใหม่", 5_000);
    say("สมชายรับไปทำใบเสนอราคา", 16_000);
    dictation.current.handlers.onPartial("ปิดประชุม");
    clock.time += 12 * 60_000;
    const finishing = recorder.finish();
    await settle();

    const transcript = "[00:05] วันนี้คุยเรื่องเปิดตัวสินค้าใหม่\n[00:21] สมชายรับไปทำใบเสนอราคา\n[12:21] ปิดประชุม";
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.request).toMatchObject({ transcript, minutes: 12 });
    expect(recorder.getState()).toMatchObject({ status: "summarizing", summary: "", notice: null });

    summaries[0]?.request.onDelta("ภาพรวม: ");
    summaries[0]?.request.onDelta("คุยเรื่องเปิดตัวสินค้า");
    expect(recorder.getState().summary).toBe("ภาพรวม: คุยเรื่องเปิดตัวสินค้า");

    summaries[0]?.result.resolve("ภาพรวม: คุยเรื่องเปิดตัวสินค้า\n");
    await finishing;

    expect(results).toEqual([{ summary: "ภาพรวม: คุยเรื่องเปิดตัวสินค้า", transcript, minutes: 12, startedAt: 1_000_000 }]);
    expect(recorder.getState()).toMatchObject({ status: "idle", startedAt: null, entries: [], summary: "", notice: null });
    expect(draft.saved).toBeNull();
  });

  it("จบโดยยังไม่ได้ยินอะไรเลย: ไม่ขอสรุป และบอกผู้ใช้", async () => {
    const { recorder, summaries, results } = await startRecording();

    await recorder.finish();

    expect(summaries).toHaveLength(0);
    expect(results).toEqual([]);
    expect(recorder.getState()).toMatchObject({ status: "paused", notice: { tone: "info", text: MEETING_TEXT.nothingHeard } });
  });

  it("ขอสรุปไม่สำเร็จ: บอกสาเหตุ บันทึกยังอยู่ครบ และกดสรุปซ้ำได้", async () => {
    const { recorder, summaries, results, draft, say } = await startRecording();

    say("ช่วงแรก");
    const first = recorder.finish();
    await settle();
    summaries[0]?.result.reject(new ChatError("ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"));
    await first;

    expect(recorder.getState().status).toBe("paused");
    expect(recorder.getState().notice).toEqual({ tone: "error", text: `ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่ ${MEETING_TEXT.transcriptKept}` });
    expect(recorder.getState().entries).toHaveLength(1);
    expect(draft.saved?.entries).toHaveLength(1);
    expect(results).toEqual([]);

    const second = recorder.finish();
    await settle();
    summaries[1]?.result.resolve("สรุปได้แล้ว");
    await second;

    expect(results).toHaveLength(1);
    expect(recorder.getState().status).toBe("idle");
  });

  it("AI ตอบคำสรุปว่างเปล่า: ถือว่าสรุปไม่สำเร็จ บันทึกยังอยู่", async () => {
    const { recorder, summaries, results, say } = await startRecording();

    say("ช่วงแรก");
    const finishing = recorder.finish();
    await settle();
    summaries[0]?.result.resolve("   ");
    await finishing;

    expect(results).toEqual([]);
    expect(recorder.getState()).toMatchObject({ status: "paused", notice: { tone: "error" } });
    expect(recorder.getState().entries).toHaveLength(1);
  });

  it("กดพักระหว่างรอคำสรุป: ยกเลิกคำขอ และบันทึกยังอยู่", async () => {
    const { recorder, summaries, results, say } = await startRecording();

    say("ช่วงแรก");
    void recorder.finish();
    await settle();
    recorder.pause();
    summaries[0]?.result.resolve("มาช้าเกินไป");
    await settle();

    expect(summaries[0]?.request.signal.aborted).toBe(true);
    expect(results).toEqual([]);
    expect(recorder.getState()).toMatchObject({ status: "paused", summary: "" });
    expect(recorder.getState().entries).toHaveLength(1);
  });

  it("ยกเลิกการประชุม: ทิ้งทุกอย่างที่จดไว้ ปิดระบบฟัง และไม่รับคำพูดที่ตามมา", async () => {
    const { recorder, dictation, draft, say } = await startRecording();

    say("ช่วงแรก");
    const stale = dictation.current.handlers;
    recorder.cancel();
    stale.onFinal("มาช้า");
    await settle();

    expect(recorder.getState()).toMatchObject({ status: "idle", startedAt: null, entries: [], notice: null });
    expect(dictation.cancelCalls).toBeGreaterThan(0);
    expect(draft.saved).toBeNull();
    expect(draft.clears).toBeGreaterThan(0);
  });

  it("เริ่มจดไม่ได้เพราะไมโครโฟนใช้ไม่ได้: ไม่เข้าโหมด และบอกสาเหตุ", async () => {
    const context = setup();
    context.dictation.prepareError = new SpeechError("permission-denied");

    await context.recorder.start();

    expect(context.recorder.getState()).toMatchObject({ status: "idle", notice: { tone: "error", text: SPEECH_ERROR_TEXT["permission-denied"] } });
    expect(context.dictation.sessions).toHaveLength(0);
  });

  it("เริ่มจดไม่ได้แล้วผู้ใช้ไปทำอย่างอื่นต่อ: ข้อความแจ้งสาเหตุถูกเก็บออกได้", async () => {
    const context = setup();
    context.dictation.prepareError = new SpeechError("permission-denied");
    await context.recorder.start();

    context.recorder.dismissNotice();

    expect(context.recorder.getState().notice).toBeNull();
  });

  it("ระหว่างมีการประชุม: ข้อความแจ้งของการประชุมไม่ถูกเก็บออกจากภายนอก", async () => {
    const { recorder } = await startRecording();
    await recorder.finish();
    expect(recorder.getState().notice).not.toBeNull();

    recorder.dismissNotice();

    expect(recorder.getState().notice).toEqual({ tone: "info", text: MEETING_TEXT.nothingHeard });
  });

  it("กดเริ่มซ้ำระหว่างที่จดอยู่: ไม่เริ่มใหม่ และไม่ล้างสิ่งที่จดไว้", async () => {
    const { recorder, dictation, say } = await startRecording();

    say("ช่วงแรก");
    await recorder.start();

    expect(dictation.sessions).toHaveLength(1);
    expect(recorder.getState().entries).toHaveLength(1);
  });

  describe("บันทึกที่ค้างอยู่ในเครื่อง", () => {
    it("เก็บลงเครื่องทุกครั้งที่จดเพิ่ม เพื่อไม่ให้หายถ้าหน้าเว็บถูกปิดหรือโหลดใหม่กลางประชุม", async () => {
      const { draft, say } = await startRecording();

      say("ช่วงแรก", 5_000);
      say("ช่วงที่สอง", 5_000);

      expect(draft.saved).toEqual({
        startedAt: 1_000_000,
        entries: [
          { at: 5_000, text: "ช่วงแรก" },
          { at: 10_000, text: "ช่วงที่สอง" }
        ]
      });
    });

    it("เปิดแอปใหม่แล้วมีบันทึกค้าง: นำกลับมาในสภาพพักการจด พร้อมบอกผู้ใช้", () => {
      const { recorder, draft, dictation } = setup();
      draft.saved = { startedAt: 900_000, entries: [{ at: 5_000, text: "ช่วงแรก" }] };

      expect(recorder.restore()).toBe(true);

      expect(recorder.getState()).toMatchObject({
        status: "paused",
        startedAt: 900_000,
        entries: [{ at: 5_000, text: "ช่วงแรก" }],
        notice: { tone: "info", text: MEETING_TEXT.restored }
      });
      expect(dictation.sessions).toHaveLength(0);
    });

    it("ไม่มีบันทึกค้าง หรือกำลังจดอยู่แล้ว: ไม่นำอะไรกลับมา", async () => {
      expect(setup().recorder.restore()).toBe(false);

      const { recorder, draft, say } = await startRecording();
      say("ช่วงใหม่");
      draft.saved = { startedAt: 1, entries: [{ at: 1, text: "ของเก่า" }] };

      expect(recorder.restore()).toBe(false);
      expect(recorder.getState().entries.map((entry) => entry.text)).toEqual(["ช่วงใหม่"]);
    });

    it("สรุปบันทึกที่นำกลับมาในวันถัดไป: ความยาวการประชุมนับถึงคำพูดสุดท้าย ไม่ใช่ถึงตอนกดสรุป", async () => {
      const { recorder, draft, clock, summaries } = setup();
      draft.saved = {
        startedAt: clock.time - 10 * 60 * 60_000,
        entries: [
          { at: 5_000, text: "ช่วงแรก" },
          { at: 45 * 60_000, text: "ปิดประชุม" }
        ]
      };

      recorder.restore();
      void recorder.finish();
      await settle();

      expect(summaries[0]?.request.minutes).toBe(45);
    });

    it("เก็บเข้าเครื่องโดยไม่ทิ้ง (เช่นเซสชันหมดอายุกลางประชุม): หยุดฟัง ล้างหน้าจอ และนำกลับมาสรุปต่อได้", async () => {
      const { recorder, dictation, draft, say } = await startRecording();

      say("ช่วงแรก", 5_000);
      dictation.current.handlers.onPartial("พูดค้างอยู่");
      const stale = dictation.current.handlers;
      recorder.shelve();
      stale.onFinal("มาช้า");
      await settle();

      expect(recorder.getState()).toMatchObject({ status: "idle", startedAt: null, entries: [], partial: "", notice: null });
      expect(dictation.cancelCalls).toBeGreaterThan(0);
      expect(draft.saved?.entries.map((entry) => entry.text)).toEqual(["ช่วงแรก", "พูดค้างอยู่"]);

      expect(recorder.restore()).toBe(true);
      expect(recorder.getState().entries.map((entry) => entry.text)).toEqual(["ช่วงแรก", "พูดค้างอยู่"]);
    });

    it("เก็บเข้าเครื่องระหว่างรอคำสรุป: ยกเลิกคำขอ และไม่ส่งคำสรุปที่มาช้าให้แอป", async () => {
      const { recorder, draft, summaries, results, say } = await startRecording();

      say("ช่วงแรก");
      void recorder.finish();
      await settle();
      recorder.shelve();
      summaries[0]?.result.resolve("มาช้าเกินไป");
      await settle();

      expect(summaries[0]?.request.signal.aborted).toBe(true);
      expect(results).toEqual([]);
      expect(recorder.getState().status).toBe("idle");
      expect(draft.saved?.entries).toHaveLength(1);
    });

    it("เก็บเข้าเครื่องตอนไม่มีการประชุม: ไม่แตะบันทึกที่ค้างอยู่", () => {
      const { recorder, draft } = setup();
      draft.saved = { startedAt: 900_000, entries: [{ at: 5_000, text: "ของเดิม" }] };

      recorder.shelve();

      expect(draft.saved?.entries).toHaveLength(1);
      expect(draft.clears).toBe(0);
    });

    it("เริ่มการประชุมใหม่ล้างบันทึกค้างของครั้งก่อน", async () => {
      const context = setup();
      context.draft.saved = { startedAt: 1, entries: [{ at: 1, text: "ของเก่า" }] };

      await context.recorder.start();
      await settle();

      expect(context.recorder.getState().entries).toEqual([]);
      expect(context.draft.saved).toBeNull();
    });
  });

  it("บันทึกยาวถึงเพดาน: ตัดให้พอดี พักการจด และบอกให้กดสรุป", async () => {
    const { recorder, say } = await startRecording();

    say("ก".repeat(MAX_TRANSCRIPT_LENGTH - 100), 1_000);
    expect(recorder.getState().status).toBe("recording");
    say("ข".repeat(500), 1_000);
    await settle();

    expect(recorder.getState()).toMatchObject({ status: "paused", notice: { tone: "info", text: MEETING_TEXT.full } });
    const sent = recorder.getState().entries;
    expect(sent).toHaveLength(2);
    expect(`[00:01] ${sent[0]?.text}\n[00:02] ${sent[1]?.text}`.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_LENGTH);
    expect(sent[1]?.text.length).toBeGreaterThan(0);
  });
});
