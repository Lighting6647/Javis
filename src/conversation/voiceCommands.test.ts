import { describe, expect, it } from "vitest";
import { matchVoiceSwitchCommand } from "./voiceCommands";

const CUSTOM_VOICES = [{ id: "voice_light_01", displayName: "เสียงของคุณไลท์" }];

describe("matchVoiceSwitchCommand", () => {
  it("สลับไปเสียงของไลท์ที่บันทึกไว้เมื่อสั่งด้วยคำพูดธรรมชาติ", () => {
    expect(matchVoiceSwitchCommand("พูดด้วยเสียงของไลท์", CUSTOM_VOICES)).toEqual({
      kind: "custom",
      voice: CUSTOM_VOICES[0],
      reply: "สลับมาพูดด้วยเสียงของคุณไลท์เรียบร้อยแล้วค่ะ"
    });
  });

  it("เมื่อสั่งใช้เสียงของไลท์แต่ยังไม่มีโปรไฟล์: แจ้งให้เปิดเมนูบันทึกเสียง", () => {
    expect(matchVoiceSwitchCommand("สลับเป็นเสียงของไลท์", [])).toMatchObject({ kind: "open-recorder" });
  });

  it("สลับเป็นบุคลิกเสียงมาตรฐาน Gen Z / สุภาพ / สายลุย / นุ่มนวล ได้ทันที", () => {
    expect(matchVoiceSwitchCommand("สลับกลับเป็นเสียงสาว Gen Z", CUSTOM_VOICES)).toMatchObject({
      kind: "persona",
      persona: "genz-girl"
    });
    expect(matchVoiceSwitchCommand("เปลี่ยนเสียงเป็นผู้ช่วยสุภาพ", CUSTOM_VOICES)).toMatchObject({
      kind: "persona",
      persona: "assistant"
    });
    expect(matchVoiceSwitchCommand("ขอใช้เสียงนุ่มนวลผ่อนคลาย", CUSTOM_VOICES)).toMatchObject({
      kind: "persona",
      persona: "calm-soft"
    });
  });

  it("ไม่จับข้อความคำถามทั่วไปที่ไม่ใช่คำสั่งสลับเสียง", () => {
    expect(matchVoiceSwitchCommand("วันนี้เสียงของตลาดหุ้นเป็นยังไงบ้าง", CUSTOM_VOICES)).toBeNull();
    expect(matchVoiceSwitchCommand("ช่วยเช็กโปรเจกต์ Tamsang ให้หน่อย", CUSTOM_VOICES)).toBeNull();
  });
});
