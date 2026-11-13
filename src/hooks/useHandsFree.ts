import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ConversationController } from "../conversation/controller";
import { handsFreeStore } from "../services/handsFreeStore";
import { listeningLock } from "../services/listeningLock";
import { micLevelStore } from "../services/micLevelStore";
import { themeStore } from "../services/themeStore";
import { handsFreeAvailable } from "../speech";
import { getSessionMeter, queryMicrophonePermission } from "../speech/sessionMeter";

/** รอให้การเริ่มฟังเองสำเร็จนานสุดเท่านี้ก่อนแสดงแถบสั่งงาน เพื่อไม่ให้ผู้ใช้ค้างอยู่กับหน้าที่สั่งงานไม่ได้ ถ้าการเริ่มฟังค้าง */
const START_PATIENCE_MS = 4000;

interface HandsFreeOptions {
  /** เซสชันผ่านการตรวจแล้วและใช้งานได้ */
  ready: boolean;
  /** พักการฟังไว้ก่อน เช่นระหว่างเปิดหน้าตั้งค่า ซึ่งมีเสียงตัวอย่างที่ไมโครโฟนไม่ควรได้ยิน */
  paused: boolean;
  controller: ConversationController;
}

export interface HandsFree {
  /** ที่นี่ฟังตลอดเวลาได้ (เบราว์เซอร์บนคอมพิวเตอร์ที่มีระบบรู้จำเสียง) */
  capable: boolean;
  /** กำลังจะเริ่มฟังเองในอีกอึดใจ (เช่นตอนเปิดหน้า): ยังไม่ต้องแสดงแถบสั่งงาน เพราะแสดงแล้วก็จะหายไปทันที */
  pending: boolean;
  /** แท็บอื่นของ Javis กำลังฟังอยู่ แท็บนี้จึงไม่ฟัง จนกว่าผู้ใช้จะเปิดไมโครโฟนที่แท็บนี้เอง */
  heldElsewhere: boolean;
  /** ผู้ใช้เปิดไมโครโฟนเอง: เริ่มฟังที่แท็บนี้ แม้แท็บอื่นจะฟังอยู่ หรือเบราว์เซอร์ยังต้องถามสิทธิ์ก่อน */
  enable: () => void;
  /** ผู้ใช้ปิดไมโครโฟน: หยุดฟัง และจำไว้ว่าปิด จึงไม่เปิดฟังเองในครั้งถัดไป */
  disable: () => void;
}

/** สิทธิ์ไมโครโฟนเท่าที่หน้าจอต้องรู้: ยังไม่ทราบ อนุญาตแล้ว หรืออย่างอื่น (ยังไม่ได้ถาม ถูกปฏิเสธ หรือเบราว์เซอร์ไม่บอก) */
type MicPermission = "unknown" | "granted" | "other";

/** ควรเปิดไมโครโฟนเส้นที่ใช้วัดเสียงไว้ระหว่างฟังไหม: เฉพาะธีมที่มีวงคลื่นเสียง และผู้ใช้ไม่ได้ปิดตัวเลือกไว้ */
const meterWanted = (): boolean => themeStore.get() === "holo" && micLevelStore.get();

/**
 * โหมดฟังตลอดเวลา: เปิดหน้าแล้ว Javis ฟังเอง ไม่ต้องแตะไมโครโฟนก่อนพูดทุกครั้ง
 * - เริ่มฟังเองเมื่อผู้ใช้อนุญาตไมโครโฟนให้เว็บนี้ไว้แล้ว ถ้ายัง ผู้ใช้ต้องแตะปุ่มไมโครโฟนหนึ่งครั้งให้เบราว์เซอร์ถามสิทธิ์
 * - ฟังได้ทีละแท็บ แท็บที่เปิดทีหลังจะรอ จนกว่าผู้ใช้จะเปิดไมโครโฟนที่แท็บนั้นเอง
 * - ไม่กลับมาฟังเองหลังล้มเหลว (เช่นถูกปฏิเสธสิทธิ์) เพื่อไม่วนขอซ้ำ ผู้ใช้เปิดเองได้จากปุ่มไมโครโฟน
 * ที่ที่ฟังตลอดเวลาไม่ได้ ตัวนี้ไม่ทำอะไรเลย และแอปใช้ปุ่มไมโครโฟนตามเดิม
 */
export function useHandsFree({ ready, paused, controller }: HandsFreeOptions): HandsFree {
  const [capable] = useState(handsFreeAvailable);
  const enabled = useSyncExternalStore(handsFreeStore.subscribe, handsFreeStore.get);
  const active = useSyncExternalStore(controller.subscribe, () => controller.getState().active);
  const [heldElsewhere, setHeldElsewhere] = useState(false);
  const [permission, setPermission] = useState<MicPermission>("unknown");
  /** โหมดเสียงของแท็บนี้จบลงเอง (ล้มเหลว หรือถูกย้ายไปแท็บอื่น) จึงไม่ได้กำลังจะเริ่มฟัง */
  const [ended, setEnded] = useState(false);
  const [patient, setPatient] = useState(true);
  /** เพิ่มเพื่อให้ลองเริ่มฟังใหม่ ทั้งที่เงื่อนไขอื่นไม่เปลี่ยน */
  const [attempt, setAttempt] = useState(0);
  /** การลองครั้งถัดไปมาจากผู้ใช้กดปุ่มไมโครโฟนเอง */
  const requestedByUser = useRef(false);
  /** แท็บนี้ตั้งใจฟังอยู่: ตั้งแต่ก่อนตัวควบคุมเข้าโหมดเสียง จนโหมดเสียงจบ ใช้ตัดสินว่าไมโครโฟนเส้นที่วัดควรเปิดไหม */
  const listening = useRef(false);
  /** กำลังหยุดโหมดเสียงเองเพื่อเริ่มใหม่หรือเพราะเงื่อนไขเปลี่ยน (เช่นเปิดหน้าตั้งค่า): ไม่นับว่าโหมดเสียงจบลงเอง */
  const tearingDown = useRef(false);

  /** เปิดหรือปิดไมโครโฟนเส้นที่ใช้วัดเสียงให้ตรงกับสถานะปัจจุบัน */
  const syncMeter = useCallback((): Promise<boolean> => {
    const meter = getSessionMeter();
    if (!meter) return Promise.resolve(false);
    if (listening.current && meterWanted()) return meter.start();
    meter.stop();
    return Promise.resolve(false);
  }, []);

  // สิทธิ์ไมโครโฟนสำหรับตัดสินว่าจะแสดงแถบสั่งงานตอนเปิดหน้าไหม
  useEffect(() => {
    if (!capable) return;

    let cancelled = false;
    let status: PermissionStatus | null = null;
    const read = () => {
      if (status) setPermission(status.state === "granted" ? "granted" : "other");
    };
    void queryMicrophonePermission().then((result) => {
      if (cancelled) return;
      if (!result) {
        setPermission("other");
        return;
      }
      status = result;
      result.addEventListener("change", read);
      read();
    });
    return () => {
      cancelled = true;
      status?.removeEventListener("change", read);
    };
  }, [capable]);

  // ติดตามตัวควบคุมโดยตรง ไม่ผ่านการวาดหน้าจอ: โหมดเสียงจบเมื่อไร ไมโครโฟนเส้นที่วัดต้องปิดทันที
  useEffect(() => {
    if (!capable) return;

    let wasActive = controller.getState().active;
    const onState = () => {
      const nowActive = controller.getState().active;
      if (wasActive && !nowActive) {
        listening.current = false;
        void syncMeter();
        if (!tearingDown.current) setEnded(true);
      }
      wasActive = nowActive;
    };
    const stopWatching = [controller.subscribe(onState), themeStore.subscribe(() => void syncMeter()), micLevelStore.subscribe(() => void syncMeter())];
    return () => stopWatching.forEach((stop) => stop());
  }, [capable, controller, syncMeter]);

  useEffect(() => {
    if (!capable || !ready || !enabled || paused) return;

    const byUser = requestedByUser.current;
    requestedByUser.current = false;
    let cancelled = false;
    let status: PermissionStatus | null = null;

    const begin = async (steal: boolean) => {
      const mine = await listeningLock.acquire({
        steal,
        onLost: () => {
          // ผู้ใช้เปิดไมโครโฟนที่แท็บอื่น การฟังจึงย้ายไปที่นั่น
          controller.stop();
          setHeldElsewhere(true);
        }
      });
      if (cancelled) return;
      setHeldElsewhere(!mine);
      if (!mine || controller.getState().active) return;
      setEnded(false);

      // เปิดไมโครโฟนเส้นที่วัดเสียงก่อนเข้าโหมดเสียง: หน้าที่เปิดไมโครโฟนอยู่ เบราว์เซอร์ยอมให้พูดตอบได้โดยผู้ใช้ไม่ต้องแตะก่อน
      listening.current = true;
      await syncMeter();
      if (cancelled) return;
      void controller.start();
    };

    // ผู้ใช้อนุญาตไมโครโฟนไว้แล้ว (หรือเพิ่งอนุญาต): เริ่มฟังเอง โดยไม่ทำให้เบราว์เซอร์ถามสิทธิ์เองตอนเปิดหน้า
    const whenGranted = () => {
      if (status?.state !== "granted") return;
      // เพิ่งได้สิทธิ์ระหว่างที่ฟังอยู่แล้ว (ผู้ใช้กดปุ่มไมโครโฟนแล้วตอบอนุญาต): เปิดไมโครโฟนเส้นที่วัดเสียงตามมา
      if (controller.getState().active) void syncMeter();
      else void begin(false);
    };
    void queryMicrophonePermission().then((result) => {
      if (cancelled || !result) return;
      status = result;
      result.addEventListener("change", whenGranted);
      if (!byUser) whenGranted();
    });
    if (byUser) void begin(true);

    return () => {
      cancelled = true;
      status?.removeEventListener("change", whenGranted);
      tearingDown.current = true;
      controller.stop();
      tearingDown.current = false;
      listening.current = false;
      void syncMeter();
      listeningLock.release();
    };
  }, [attempt, capable, controller, enabled, paused, ready, syncMeter]);

  // เบราว์เซอร์คืนหน้าเดิมให้ตอนผู้ใช้กดย้อนกลับ หลัง Javis พาแท็บนี้ไปยังเว็บอื่น: กลับมาฟังต่อ
  useEffect(() => {
    if (!capable) return;
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted) setAttempt((count) => count + 1);
    };
    window.addEventListener("pageshow", resume);
    return () => window.removeEventListener("pageshow", resume);
  }, [capable]);

  // กำลังจะเริ่มฟังเอง: รู้ได้ตั้งแต่ก่อนสิทธิ์ไมโครโฟนจะตอบกลับมา จึงไม่ต้องแสดงแถบสั่งงานแวบหนึ่งตอนเปิดหน้า
  const starting = capable && ready && enabled && !paused && !active && !ended && !heldElsewhere && permission !== "other";
  useEffect(() => {
    if (!starting) return;
    const timer = window.setTimeout(() => setPatient(false), START_PATIENCE_MS);
    return () => window.clearTimeout(timer);
  }, [starting]);

  const enable = useCallback(() => {
    requestedByUser.current = true;
    handsFreeStore.set(true);
    setAttempt((count) => count + 1);
  }, []);

  const disable = useCallback(() => {
    setHeldElsewhere(false);
    handsFreeStore.set(false);
  }, []);

  return { capable, pending: starting && patient, heldElsewhere, enable, disable };
}
