import { type DictationHandlers, SPEECH_LANGUAGE, SpeechError, type SpeechErrorCode, type SpeechRecognizer } from "./types";

/** ส่วนของ Web Speech API ที่ใช้งานจริง ประกาศเองเพราะยังไม่อยู่ในชนิดมาตรฐานของทุกเบราว์เซอร์ */
interface WebRecognitionResultEvent {
  /** ผลลัพธ์แรกที่เปลี่ยนในเหตุการณ์นี้ ผลลัพธ์ก่อนหน้านั้นจบไปแล้วและเคยส่งมาแล้ว */
  resultIndex?: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
}

interface WebRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: WebRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type WebRecognitionConstructor = new () => WebRecognition;

interface ActiveSession {
  recognition: WebRecognition;
  reject: (error: SpeechError) => void;
}

function getConstructor(): WebRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: WebRecognitionConstructor;
    webkitSpeechRecognition?: WebRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function mapError(error: string): SpeechErrorCode | null {
  switch (error) {
    case "no-speech":
      return null;
    case "aborted":
      return "aborted";
    case "not-allowed":
    case "service-not-allowed":
      return "permission-denied";
    case "audio-capture":
      return "no-microphone";
    case "network":
      return "network";
    case "language-not-supported":
      return "not-supported";
    default:
      return "unknown";
  }
}

/** ตัวฟังบนเบราว์เซอร์: Safari ใช้ระบบเสียงของ Apple ส่วน Chrome/Edge ใช้ของผู้ผลิตเบราว์เซอร์ */
export class WebSpeechRecognizer implements SpeechRecognizer {
  private active: ActiveSession | null = null;

  async prepare(): Promise<void> {
    if (!getConstructor()) throw new SpeechError("not-supported");
  }

  /** เบราว์เซอร์ไม่บอกว่าประมวลผลเสียงที่ใด จึงไม่อ้างว่าอยู่ในเครื่อง */
  isOnDevice(): boolean {
    return false;
  }

  listen(onPartial: (text: string) => void): Promise<string> {
    this.cancel();

    return new Promise<string>((resolve, reject) => {
      const Recognition = getConstructor();
      if (!Recognition) {
        reject(new SpeechError("not-supported"));
        return;
      }

      const recognition = new Recognition();
      recognition.lang = SPEECH_LANGUAGE;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let transcript = "";
      let failure: SpeechErrorCode | null = null;

      recognition.onresult = (event) => {
        let text = "";
        for (let index = 0; index < event.results.length; index += 1) {
          text += event.results[index]?.[0]?.transcript ?? "";
        }
        transcript = text.trim();
        onPartial(transcript);
      };

      recognition.onerror = (event) => {
        failure = mapError(event.error);
      };

      // บางเบราว์เซอร์ไม่ส่งผลลัพธ์สุดท้ายแยกมา จึงสรุปผลตอนจบการฟังเสมอ
      recognition.onend = () => {
        if (this.active?.recognition !== recognition) return;
        this.active = null;
        if (failure) reject(new SpeechError(failure));
        else resolve(transcript);
      };

      this.active = { recognition, reject };

      try {
        recognition.start();
      } catch {
        this.active = null;
        reject(new SpeechError("unknown"));
      }
    });
  }

  /**
   * ฟังต่อเนื่องสำหรับจดคำพูดยาว ๆ: ระบบฟังไม่จบเมื่อผู้พูดหยุด แต่ส่งข้อความของแต่ละช่วงคำพูดที่จบแล้วมาเรื่อย ๆ
   * จึงไม่เสียคำพูดช่วงรอยต่อเหมือนการเปิดฟังใหม่ทุกประโยค เบราว์เซอร์ยังจบการฟังเองเป็นระยะ (เช่นเมื่อเงียบนาน)
   * ซึ่งผู้เรียกต้องเรียกใหม่เพื่อฟังต่อ
   */
  dictate(handlers: DictationHandlers): Promise<void> {
    this.cancel();

    return new Promise<void>((resolve, reject) => {
      const Recognition = getConstructor();
      if (!Recognition) {
        reject(new SpeechError("not-supported"));
        return;
      }

      const recognition = new Recognition();
      recognition.lang = SPEECH_LANGUAGE;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      /** คำที่ได้ยินของช่วงที่ยังไม่จบ ถ้าการฟังจบก่อนที่ช่วงนี้จะถูกยืนยัน จะส่งเป็นช่วงสุดท้าย เพื่อไม่ให้คำพูดหาย */
      let pending = "";
      let failure: SpeechErrorCode | null = null;

      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result?.[0]?.transcript ?? "";
          if (result?.isFinal) {
            if (text.trim()) handlers.onFinal(text.trim());
          } else {
            interim += text;
          }
        }
        pending = interim.trim();
        handlers.onPartial(pending);
      };

      recognition.onerror = (event) => {
        failure = mapError(event.error);
      };

      recognition.onend = () => {
        if (this.active?.recognition !== recognition) return;
        this.active = null;
        if (pending) handlers.onFinal(pending);
        if (failure) reject(new SpeechError(failure));
        else resolve();
      };

      this.active = { recognition, reject };

      try {
        recognition.start();
      } catch {
        this.active = null;
        reject(new SpeechError("unknown"));
      }
    });
  }

  stop(): void {
    try {
      this.active?.recognition.stop();
    } catch {
      // การฟังจบไปแล้ว ไม่ต้องทำอะไร
    }
  }

  cancel(): void {
    const session = this.active;
    if (!session) return;

    this.active = null;
    session.recognition.onresult = null;
    session.recognition.onerror = null;
    session.recognition.onend = null;
    try {
      session.recognition.abort();
    } catch {
      // การฟังจบไปแล้ว ไม่ต้องทำอะไร
    }
    session.reject(new SpeechError("aborted"));
  }
}
