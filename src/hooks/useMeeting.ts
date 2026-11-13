import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { browserStore } from "../browser/browserStore";
import { appCommands } from "../conversation/appCommands";
import type { ConversationController } from "../conversation/controller";
import { isMeetingStartCommand } from "../meeting/commands";
import { summaryRequestText } from "../meeting/export";
import { createMeetingDraftStore } from "../meeting/meetingDraft";
import { meetingLock } from "../meeting/meetingLock";
import { MEETING_TEXT, MeetingRecorder, type MeetingState } from "../meeting/meetingRecorder";
import { streamChatReply } from "../services/chatApi";
import { listeningLock } from "../services/listeningLock";
import { sessionStore } from "../services/sessionStore";
import { createDictationRecognizer, handsFreeAvailable } from "../speech";
import { getSessionMeter, sessionMeterWanted } from "../speech/sessionMeter";

/**
 * ข้อความของผู้ใช้ที่ส่งคู่กับคำขอสรุป เซิร์ฟเวอร์ต้องการข้อความอย่างน้อยหนึ่งข้อความในทุกคำขอ
 * แต่คำขอสรุปใช้เฉพาะบันทึกการประชุม ไม่ใช้ประวัติบทสนทนา (server/chat.ts)
 */
const SUMMARY_PROMPT = "สรุปการประชุม";

interface MeetingOptions {
  /** เซสชันผ่านการตรวจแล้วและใช้งานได้ */
  ready: boolean;
  controller: ConversationController;
}

export interface Meeting {
  /** ที่นี่ใช้โหมดสรุปการประชุมได้ (เบราว์เซอร์บนคอมพิวเตอร์ที่มีระบบรู้จำเสียง) */
  capable: boolean;
  state: MeetingState;
  /** มีการประชุมอยู่: กำลังจด พักการจด หรือกำลังสรุป */
  active: boolean;
  /** เริ่มจดการประชุมใหม่ บทสนทนาที่ค้างอยู่ถูกหยุดก่อน เพื่อให้ Javis เงียบและปล่อยไมโครโฟนให้การจด */
  begin: () => void;
  pause: () => void;
  resume: () => void;
  /** จบการประชุม แล้วส่งบันทึกทั้งหมดให้ AI สรุปครั้งเดียว */
  finish: () => void;
  /** ยกเลิกการประชุมและทิ้งทุกอย่างที่จดไว้ */
  cancel: () => void;
}

/** เจ้าของบันทึกการประชุมในแท็บนี้: ชื่อผู้ใช้ที่เข้าสู่ระบบอยู่ หรือ null เมื่อไม่มีการเข้าสู่ระบบ */
const meetingOwner = (): string | null => sessionStore.get()?.name ?? null;

/**
 * โหมดสรุปการประชุม: ผูกตัวจดการประชุมเข้ากับ React บทสนทนา และไมโครโฟนของแท็บ
 * - ระหว่างจด แท็บนี้เป็นแท็บที่ฟัง แท็บอื่นของ Javis จึงไม่เริ่มฟังเองมาแย่งไมโครโฟน
 * - คำสรุปที่ได้ถูกเพิ่มลงบทสนทนา ผู้ใช้จึงถามต่อจากคำสรุปได้
 * - บันทึกที่ยังไม่ได้สรุปเก็บไว้ในเครื่อง ถ้าหน้าเว็บถูกปิดกลางประชุม จะถูกนำกลับมาตอนเปิดใหม่
 * ที่ที่ใช้โหมดนี้ไม่ได้ ตัวนี้ไม่ทำอะไรเลย
 */
export function useMeeting({ ready, controller }: MeetingOptions): Meeting {
  const [capable] = useState(handsFreeAvailable);
  const [recorder] = useState(
    () =>
      new MeetingRecorder({
        recognizer: createDictationRecognizer(),
        draft: createMeetingDraftStore(undefined, undefined, meetingOwner),
        summarize: ({ transcript, minutes, signal, onDelta }) =>
          streamChatReply([{ role: "user", content: SUMMARY_PROMPT }], {
            signal,
            meeting: { transcript, minutes },
            onEvent: (event) => {
              if (event.type === "delta") onDelta(event.text);
            }
          }),
        onSummary: ({ summary, transcript, minutes, startedAt }) =>
          controller.addExchange(summaryRequestText(minutes), { text: summary, meeting: { transcript, minutes, startedAt } })
      })
  );
  const state = useSyncExternalStore(recorder.subscribe, recorder.getState);
  const active = state.status !== "idle";
  const recording = state.status === "recording";

  // ผู้ใช้อยู่ในระบบ: นำบันทึกที่ค้างจากการประชุมที่หน้าเว็บถูกปิดกลางคันกลับมา เว้นแต่แท็บอื่นกำลังประชุมอยู่ ซึ่งบันทึกนั้นเป็นของแท็บนั้น
  // ผู้ใช้ไม่อยู่ในระบบแล้ว: ปิดไมโครโฟนและล้างหน้าจอ โดยเก็บบันทึกไว้ในเครื่องให้เจ้าของกลับมาสรุป
  useEffect(() => {
    if (!capable) return;
    if (!ready) {
      recorder.shelve();
      return;
    }

    // รอจนไม่มีแท็บอื่นประชุมอยู่ (ทันทีถ้าไม่มี): แท็บที่ประชุมอยู่อาจเพิ่งถูกปิด ซึ่งเบราว์เซอร์ปล่อยสิทธิ์ของแท็บนั้นช้ากว่าที่แท็บนี้เปิดเสร็จ
    return meetingLock.waitFor({
      onAcquired: () => {
        recorder.restore();
        // ไม่มีอะไรให้นำกลับมา: ไม่ต้องถือสิทธิ์ไว้ ถ้ามี การประชุมที่นำกลับมาจะถือต่อเอง (ดูด้านล่าง)
        if (recorder.getState().status === "idle") meetingLock.release();
      },
      onLost: () => undefined
    });
  }, [capable, ready, recorder]);

  // ตลอดการประชุม แท็บนี้เป็นเจ้าของบันทึกที่เก็บในเครื่อง แท็บที่เปิดทีหลังจึงไม่นำบันทึกนี้ไปแสดงว่าเป็นของค้าง
  useEffect(() => {
    if (!active) return;
    void meetingLock.acquire({ steal: true, onLost: () => undefined });
    return () => meetingLock.release();
  }, [active]);

  // ระหว่างจด แท็บนี้เป็นแท็บที่ฟัง: แท็บอื่นไม่เริ่มฟังเองมาแย่งไมโครโฟน และถ้าผู้ใช้เปิดไมโครโฟนที่แท็บอื่นเอง ที่นี่พักการจด
  // โหมดฟังตลอดเวลาถูกพักไว้ตลอดการประชุมและปล่อยสิทธิ์นี้ก่อนแล้ว (src/hooks/useHandsFree.ts)
  // วงคลื่นเสียงขยับตามเสียงจริงด้วย ให้เห็นว่าไมโครโฟนได้ยินเสียงในห้องประชุม
  useEffect(() => {
    if (!recording) return;

    void listeningLock.acquire({ steal: true, onLost: () => recorder.pause(MEETING_TEXT.movedElsewhere) });
    const meter = sessionMeterWanted() ? getSessionMeter() : null;
    void meter?.start();
    return () => {
      meter?.stop();
      listeningLock.release();
    };
  }, [recorder, recording]);

  const begin = useCallback(() => {
    if (recorder.getState().status !== "idle") return;
    controller.stop();
    // การประชุมใช้พื้นที่หลักของจอ หน้าเว็บที่เปิดค้างไว้ยังอยู่ และกลับไปดูได้หลังประชุม
    browserStore.hide();
    void recorder.start();
  }, [controller, recorder]);

  // สั่งด้วยเสียงหรือพิมพ์ว่า "เริ่มโหมดประชุม": แอปเริ่มจดเองทันที ไม่ส่งไปถาม AI
  useEffect(() => {
    if (!capable || !ready) return;
    return appCommands.register({ matches: isMeetingStartCommand, run: begin });
  }, [begin, capable, ready]);

  // ข้อความแจ้งว่าเริ่มจดไม่สำเร็จ หายไปเมื่อผู้ใช้กลับไปสนทนาต่อ
  useEffect(
    () =>
      controller.subscribe(() => {
        if (controller.getState().phase !== "idle") recorder.dismissNotice();
      }),
    [controller, recorder]
  );

  // ออกจากหน้า: ปิดไมโครโฟน บันทึกที่จดไว้ยังอยู่ในเครื่อง
  useEffect(() => recorder.shelve, [recorder]);

  const pause = useCallback(() => recorder.pause(), [recorder]);
  const finish = useCallback(() => void recorder.finish(), [recorder]);

  return { capable, state, active, begin, pause, resume: recorder.resume, finish, cancel: recorder.cancel };
}
