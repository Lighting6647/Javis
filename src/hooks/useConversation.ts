import { Capacitor } from "@capacitor/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { browserStore, isDesktopApp } from "../browser/browserStore";
import { ConversationController } from "../conversation/controller";
import { memoryStore } from "../memory/memoryStore";
import { streamChatReply } from "../services/chatApi";
import { clearConversationSnapshot, restoredConversation, saveConversationSnapshot } from "../services/conversationSnapshot";
import { leaveToPage, openExternalPage } from "../services/openPage";
import { sessionStore } from "../services/sessionStore";
import { voiceSettingsStore } from "../services/voiceSettingsStore";
import { createSpeechServices, handsFreeAvailable } from "../speech";

interface ConversationOptions {
  /** เซสชันผ่านการตรวจแล้วและใช้งานได้ บทสนทนาที่เก็บไว้จะถูกคืนให้หลังจากนี้เท่านั้น */
  ready: boolean;
}

/**
 * เว็บในเบราว์เซอร์ทั่วไป ซึ่งบล็อกแท็บใหม่ของคำสั่งเสียง
 * แอปเดสก์ท็อปมีเบราว์เซอร์ในตัว และแอปมือถือเปิดด้วยเบราว์เซอร์ของระบบ จึงไม่ต้องพาแท็บไปไหน
 */
const runsInBrowserTab = (): boolean => !isDesktopApp() && !Capacitor.isNativePlatform();

/**
 * เจ้าของบทสนทนาในแท็บนี้: ชื่อผู้ใช้ที่เข้าสู่ระบบอยู่ หรือ null เมื่อไม่มีใครเข้าสู่ระบบ
 * อ่านจากคลังเซสชันทั้งตอนเก็บและตอนคืน เพื่อให้บทสนทนากลับไปหาคนเดิมเท่านั้น
 */
const conversationOwner = (): string | null => sessionStore.get()?.name ?? null;

/** ผูกตัวควบคุมบทสนทนาเข้ากับ React และหยุดเสียงทั้งหมดเมื่อออกจากหน้า */
export function useConversation({ ready }: ConversationOptions) {
  const [inBrowser] = useState(runsInBrowserTab);
  const [{ controller, synthesizer }] = useState(() => {
    const services = createSpeechServices();
    services.synthesizer.applySettings(voiceSettingsStore.get());

    const controller: ConversationController = new ConversationController({
      ...services,
      chat: streamChatReply,
      // เบราว์เซอร์บนคอมพิวเตอร์ฟังตลอดเวลา: เงียบก็ฟังต่อ ไม่ต้องให้ผู้ใช้แตะไมโครโฟนใหม่ทุกครั้ง
      handsFree: handsFreeAvailable(),
      // แอปเดสก์ท็อปเปิดหน้าเว็บในเบราว์เซอร์ในตัว ที่อื่นเปิดแท็บใหม่หรือเบราว์เซอร์ของระบบ
      openPage: (url) => (isDesktopApp() ? browserStore.open(url) : openExternalPage(url)),
      // เว็บในเบราว์เซอร์: หน้าที่เจ้าของเว็บยอมให้แสดงในกรอบ แสดงในพื้นที่หลักของ Javis เลย ไม่ต้องเปิดแท็บใหม่
      showPage: runsInBrowserTab() ? browserStore.showFramed : undefined,
      // เบราว์เซอร์ไม่ยอมเปิดแท็บใหม่: พาแท็บนี้ไปแทน โดยเก็บบทสนทนาไว้คืนให้ตอนผู้ใช้กลับมา
      leaveToPage: runsInBrowserTab()
        ? (url) => {
            saveConversationSnapshot({ owner: conversationOwner(), messages: controller.getState().messages });
            if (leaveToPage(url)) return true;
            clearConversationSnapshot();
            return false;
          }
        : undefined,
      getPageContext: async () => {
        if (!browserStore.get().requestedUrl) return null;
        return (await browserStore.getBridge()?.getContext()) ?? null;
      },
      fillPage: async (pageUrl, values) =>
        (await browserStore.getBridge()?.fill(pageUrl, values)) ?? {
          filled: 0,
          missing: values.map((entry) => entry.id),
          failure: "unavailable"
        },
      memory: { list: memoryStore.get, add: memoryStore.add, remove: memoryStore.remove }
    });
    return { controller, synthesizer: services.synthesizer };
  });
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const voiceSettings = useSyncExternalStore(voiceSettingsStore.subscribe, voiceSettingsStore.get);

  useEffect(() => controller.stop, [controller]);

  // ผู้ใช้กลับมาหลัง Javis พาแท็บนี้ไปยังเว็บอื่น: แสดงบทสนทนาเดิมต่อ
  // รอให้เซสชันผ่านการตรวจก่อน เพราะระหว่างตรวจแอปจะล้างบทสนทนา และบทสนทนาต้องคืนให้เจ้าของเดิมเท่านั้น
  useEffect(() => {
    if (ready && inBrowser) controller.restore(restoredConversation(conversationOwner()));
  }, [controller, inBrowser, ready]);

  // เบราว์เซอร์คืนหน้าเดิมให้ทั้งหน้าตอนผู้ใช้กดย้อนกลับ: บทสนทนายังอยู่ครบ ของที่เก็บไว้จึงไม่ต้องใช้
  // ถ้าปล่อยไว้ มันจะโผล่กลับมาตอนผู้ใช้โหลดหน้าซ้ำ ทั้งที่การโหลดซ้ำควรเริ่มบทสนทนาใหม่
  useEffect(() => {
    const dropSnapshot = (event: PageTransitionEvent) => {
      if (event.persisted) clearConversationSnapshot();
    };
    window.addEventListener("pageshow", dropSnapshot);
    return () => window.removeEventListener("pageshow", dropSnapshot);
  }, []);

  // เสียงและความเร็วที่ผู้ใช้เลือก มีผลกับประโยคถัดไปทันที
  useEffect(() => {
    synthesizer.applySettings(voiceSettings);
  }, [synthesizer, voiceSettings]);

  return {
    controller,
    state,
    synthesizer,
    voiceSettings,
    start: controller.start,
    stop: controller.stop,
    reset: controller.reset,
    interrupt: controller.interrupt,
    finishListening: controller.finishListening,
    sendText: controller.sendText,
    confirmFill: controller.confirmFill,
    cancelFill: controller.cancelFill,
    undoMemory: controller.undoMemory,
    markLinkOpened: controller.markLinkOpened
  };
}
