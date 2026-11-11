import { SPEECH_LANGUAGE, SpeechError, type SpeechErrorCode, type SpeechRecognizer } from "./types";

/** ส่วนของ Web Speech API ที่ใช้งานจริง ประกาศเองเพราะยังไม่อยู่ในชนิดมาตรฐานของทุกเบราว์เซอร์ */
interface WebRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
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
