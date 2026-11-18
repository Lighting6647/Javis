import type { CustomVoiceRecord } from "../services/customVoicesApi";
import type { VoicePersonaId } from "../speech/types";

export type VoiceSwitchCommand =
  | {
      kind: "persona";
      persona: VoicePersonaId;
      cloudVoice: string | null;
      reply: string;
    }
  | {
      kind: "custom";
      voice: CustomVoiceRecord;
      reply: string;
    }
  | {
      kind: "open-recorder";
      reply: string;
    };

const VOICE_SWITCH_INTENT = /(?:เปลี่ยน|สลับ|ขอใช้|ใช้|พูดด้วย|พูดเป็น|เอา|ขอ)(?:กลับ)?(?:มา|ไป)?(?:เป็น|ใช้)?\s*(?:โทน)?เสียง/i;

const CUSTOM_SELF_VOICE_HINT = /(?:เสียงของไลท์|เสียงไลท์|เสียงของฉัน|เสียงฉัน|เสียงตัวเอง|เสียงที่บันทึกไว้|เสียงจำลอง)/i;

const PERSONA_MATCHERS: Array<{ pattern: RegExp; persona: VoicePersonaId; cloudVoice: string | null; reply: string }> = [
  {
    pattern: /(?:gen\s*z|เด็กสาว|วัยรุ่น|leda|ผู้หญิงสดใส|สาวน้อย)/i,
    persona: "genz-girl",
    cloudVoice: null,
    reply: "สลับกลับมาใช้เสียงสาวน้อย Gen Z สดใสให้แล้วค่า มีอะไรให้ช่วยบอกได้เลยน้า!"
  },
  {
    pattern: /(?:ผู้ช่วยสุภาพ|สุภาพ|kore|เป็นทางการ)/i,
    persona: "assistant",
    cloudVoice: "Kore",
    reply: "เปลี่ยนเป็นเสียงผู้ช่วยสาวสุภาพแล้วค่ะ พร้อมช่วยดูแลงานให้คุณไลท์แล้วนะคะ"
  },
  {
    pattern: /(?:สายลุย|กระฉับกระเฉง|zephyr|คล่องตัว)/i,
    persona: "upbeat-buddy",
    cloudVoice: "Zephyr",
    reply: "สลับเป็นเสียงสายลุยกระฉับกระเฉงแล้วค่ะ ลุยงานไหนต่อดีคะ!"
  },
  {
    pattern: /(?:นุ่มนวล|ผ่อนคลาย|aoede|ละมุน|อ่านข่าว)/i,
    persona: "calm-soft",
    cloudVoice: "Aoede",
    reply: "เปลี่ยนเป็นเสียงนุ่มนวลผ่อนคลายแล้วค่ะ สบาย ๆ ได้เลยนะคะ"
  }
];

/**
 * แปลงคำสั่งพูด/ข้อความสำหรับสลับโทนเสียงหรือเสียงจำลองของผู้ใช้ได้ทันทีโดยไม่ต้องถาม AI
 * คืน null ถ้าข้อความไม่ใช่คำสั่งเปลี่ยนเสียง
 */
export function matchVoiceSwitchCommand(
  rawText: string,
  customVoices: readonly CustomVoiceRecord[]
): VoiceSwitchCommand | null {
  const text = rawText.trim();
  if (!text) return null;

  const hasIntent = VOICE_SWITCH_INTENT.test(text);
  const directPersonaMention = PERSONA_MATCHERS.find((entry) => entry.pattern.test(text));
  const namedCustom = customVoices.find((voice) => {
    const cleanName = voice.displayName.trim().toLowerCase();
    return cleanName.length >= 2 && text.toLowerCase().includes(cleanName);
  });
  const asksOwnVoice = CUSTOM_SELF_VOICE_HINT.test(text);

  if (!hasIntent && !asksOwnVoice) return null;

  if (namedCustom) {
    return {
      kind: "custom",
      voice: namedCustom,
      reply: `สลับมาพูดด้วย${namedCustom.displayName}เรียบร้อยแล้วค่ะ`
    };
  }

  if (asksOwnVoice) {
    const first = customVoices[0];
    if (first) {
      return {
        kind: "custom",
        voice: first,
        reply: `สลับมาพูดด้วย${first.displayName}เรียบร้อยแล้วค่ะ`
      };
    }
    return {
      kind: "open-recorder",
      reply: "ยังไม่มีเสียงของคุณไลท์ที่บันทึกไว้ เปิดเมนูบันทึกเสียงให้เลยนะคะ"
    };
  }

  if (directPersonaMention) {
    return {
      kind: "persona",
      persona: directPersonaMention.persona,
      cloudVoice: directPersonaMention.cloudVoice,
      reply: directPersonaMention.reply
    };
  }

  return null;
}
