import { describe, expect, it } from "vitest";
import { matchAssistantVoiceCommand } from "./assistantVoiceCommands";

describe("matchAssistantVoiceCommand", () => {
  const customApps = [
    { id: "custom-obs", name: "OBS Studio", path: "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", createdAt: 1 },
    { id: "custom-mt5", name: "MT5", path: "C:\\Program Files\\MetaTrader 5\\terminal64.exe", createdAt: 2 }
  ];

  it("answers time and date queries immediately without AI", () => {
    const sampleDate = new Date("2026-11-21T08:30:00Z"); // 15:30 +07:00
    const timeCmd = matchAssistantVoiceCommand("เดลลูน่า กี่โมงแล้ว", customApps, sampleDate);
    expect(timeCmd?.kind).toBe("time");
    expect(timeCmd?.reply).toContain("15:30");

    const dateCmd = matchAssistantVoiceCommand("วันนี้วันที่เท่าไหร่ค่ะ", customApps, sampleDate);
    expect(dateCmd?.kind).toBe("date");
    expect(dateCmd?.reply).toContain("2569");
  });

  it("parses timer set and cancel commands", () => {
    const setCmd = matchAssistantVoiceCommand("ตั้งเวลา 5 นาทีให้หน่อย");
    expect(setCmd).toMatchObject({ kind: "timer-set", durationMs: 300_000, label: "5 นาที" });

    const cancelCmd = matchAssistantVoiceCommand("ยกเลิกตัวจับเวลา");
    expect(cancelCmd?.kind).toBe("timer-cancel");
  });

  it("builds Google Maps navigation, YouTube music, and tel URLs", () => {
    const mapCmd = matchAssistantVoiceCommand("นำทางไป เซ็นทรัลเวิลด์");
    expect(mapCmd).toMatchObject({
      kind: "open-url",
      url: "https://www.google.com/maps/dir/?api=1&destination=%E0%B9%80%E0%B8%8B%E0%B9%87%E0%B8%99%E0%B8%97%E0%B8%A3%E0%B8%B1%E0%B8%A5%E0%B9%80%E0%B8%A7%E0%B8%B4%E0%B8%A5%E0%B8%94%E0%B9%8C"
    });

    const ytCmd = matchAssistantVoiceCommand("เปิดเพลง ลมหนาว");
    expect(ytCmd).toMatchObject({
      kind: "open-url",
      url: "https://www.youtube.com/results?search_query=%E0%B8%A5%E0%B8%A1%E0%B8%AB%E0%B8%99%E0%B8%B2%E0%B8%A7"
    });

    const callCmd = matchAssistantVoiceCommand("โทรหา 081-234-5678");
    expect(callCmd).toMatchObject({ kind: "open-url", url: "tel:0812345678" });
  });

  it("resolves Voice Contacts for call and email commands", () => {
    const contacts = [
      { id: "c1", name: "คุณแม่", aliases: ["แม่"], phone: "0891112222", createdAt: 1 },
      { id: "c2", name: "ทีมพัฒนา", aliases: ["ทีม"], email: "team@example.com", createdAt: 2 }
    ];

    const callMom = matchAssistantVoiceCommand("เดลลูน่า โทรหาแม่หน่อย", [], new Date(), contacts);
    expect(callMom).toMatchObject({ kind: "open-url", url: "tel:0891112222" });

    const mailTeam = matchAssistantVoiceCommand("ส่งเมลหาทีม", [], new Date(), contacts);
    expect(mailTeam).toMatchObject({ kind: "open-url", url: "mailto:team@example.com" });
  });

  it("matches navigation, speech rate, theme, and custom desktop apps", () => {
    expect(matchAssistantVoiceCommand("เปิดหน้างาน")?.kind).toBe("navigate");
    expect(matchAssistantVoiceCommand("พูดเร็วขึ้น")?.kind).toBe("speech-rate");
    expect(matchAssistantVoiceCommand("เปลี่ยนเป็นธีมสว่าง")).toMatchObject({ kind: "theme", theme: "plain" });

    const customCmd = matchAssistantVoiceCommand("เดลลูน่า เปิด OBS ให้หน่อย", customApps);
    expect(customCmd?.kind).toBe("launch-custom-app");
    if (customCmd?.kind === "launch-custom-app") {
      expect(customCmd.app.id).toBe("custom-obs");
    }
  });
});
