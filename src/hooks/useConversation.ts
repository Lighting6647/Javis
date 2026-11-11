import { useEffect, useState, useSyncExternalStore } from "react";
import { ConversationController } from "../conversation/controller";
import { streamChatReply } from "../services/chatApi";
import { voiceSettingsStore } from "../services/voiceSettingsStore";
import { createSpeechServices } from "../speech";

/** ผูกตัวควบคุมบทสนทนาเข้ากับ React และหยุดเสียงทั้งหมดเมื่อออกจากหน้า */
export function useConversation() {
  const [{ controller, synthesizer }] = useState(() => {
    const services = createSpeechServices();
    services.synthesizer.applySettings(voiceSettingsStore.get());
    return {
      controller: new ConversationController({ ...services, chat: streamChatReply }),
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
    sendText: controller.sendText
  };
}
