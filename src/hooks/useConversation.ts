import { useEffect, useState, useSyncExternalStore } from "react";
import { browserStore, isDesktopApp } from "../browser/browserStore";
import { ConversationController } from "../conversation/controller";
import { memoryStore } from "../memory/memoryStore";
import { streamChatReply } from "../services/chatApi";
import { openExternalPage } from "../services/openPage";
import { voiceSettingsStore } from "../services/voiceSettingsStore";
import { createSpeechServices } from "../speech";

/** ผูกตัวควบคุมบทสนทนาเข้ากับ React และหยุดเสียงทั้งหมดเมื่อออกจากหน้า */
export function useConversation() {
  const [{ controller, synthesizer }] = useState(() => {
    const services = createSpeechServices();
    services.synthesizer.applySettings(voiceSettingsStore.get());
    return {
      controller: new ConversationController({
        ...services,
        chat: streamChatReply,
        // แอปเดสก์ท็อปเปิดหน้าเว็บในเบราว์เซอร์ในตัว ที่อื่นเปิดแท็บใหม่หรือเบราว์เซอร์ของระบบ
        openPage: (url) => (isDesktopApp() ? browserStore.open(url) : openExternalPage(url)),
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
      }),
      synthesizer: services.synthesizer
    };
  });
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const voiceSettings = useSyncExternalStore(voiceSettingsStore.subscribe, voiceSettingsStore.get);

  useEffect(() => controller.stop, [controller]);

  // เสียงและความเร็วที่ผู้ใช้เลือก มีผลกับประโยคถัดไปทันที
  useEffect(() => {
    synthesizer.applySettings(voiceSettings);
  }, [synthesizer, voiceSettings]);

  return {
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
