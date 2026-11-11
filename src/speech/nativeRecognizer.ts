import { SpeechRecognition } from "@capgo/capacitor-speech-recognition";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { SPEECH_LANGUAGE, SpeechError, type SpeechErrorCode, type SpeechRecognizer } from "./types";

/** เงียบนานเท่านี้หลังเริ่มพูด ถือว่าพูดจบ (iOS ไม่ตัดจบให้เอง) */
const END_OF_SPEECH_SILENCE_MS = 1500;
/** ไม่ได้ยินอะไรเลยนานเท่านี้ ถือว่าไม่มีคำพูด */
const NO_SPEECH_TIMEOUT_MS = 8000;
const MAX_LISTEN_MS = 60_000;
/** หลังหยุดฟัง ผลลัพธ์สุดท้ายอาจตามมาช้ากว่าสัญญาณหยุดเล็กน้อย */
const FINAL_RESULT_GRACE_MS = 1000;

/**
 * ใช้ SFSpeechRecognizer แบบบังคับประมวลผลในเครื่อง แทนเส้นทาง SpeechAnalyzer ของ iOS 26
 * ซึ่งบางเครื่องเริ่มแล้วหยุดโดยไม่ส่งข้อความระหว่างพูดออกมา
 */
const ON_DEVICE_OPTIONS = { useOnDeviceRecognition: true, preferLegacyRecognizer: true } as const;

interface Session {
  transcript: string;
  stopping: boolean;
  finished: boolean;
  handles: PluginListenerHandle[];
  timers: Set<ReturnType<typeof setTimeout>>;
  silenceTimer: ReturnType<typeof setTimeout> | null;
  requestStop: () => void;
  finish: (error?: SpeechErrorCode) => void;
}

function mapError(error: unknown): SpeechErrorCode {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (message.includes("permission") || message.includes("denied")) return "permission-denied";
  if (message.includes("microphone") || message.includes("in use")) return "no-microphone";
  if (message.includes("network")) return "network";
  return "unknown";
}

/** ความผิดพลาดที่การถอยไปใช้ระบบรู้จำเสียงแบบออนไลน์ช่วยไม่ได้ */
function isFinal(error: unknown): boolean {
  return error instanceof SpeechError && (error.code === "aborted" || error.code === "permission-denied");
}

/** ตัวฟังบนแอปมือถือ: iOS ใช้ Apple Speech framework ส่วน Android ใช้ SpeechRecognizer ของระบบ */
export class NativeSpeechRecognizer implements SpeechRecognizer {
  private session: Session | null = null;
  private onDevice = false;

  async prepare(): Promise<void> {
    const available = await SpeechRecognition.available().then(
      (result) => result.available,
      () => false
    );
    if (!available) throw new SpeechError("not-supported");

    let status = await SpeechRecognition.checkPermissions();
    if (status.speechRecognition !== "granted") {
      status = await SpeechRecognition.requestPermissions();
    }
    if (status.speechRecognition !== "granted") throw new SpeechError("permission-denied");

    this.onDevice = await this.detectOnDeviceSupport();
  }

  isOnDevice(): boolean {
    return this.onDevice;
  }

  async listen(onPartial: (text: string) => void): Promise<string> {
    this.cancel();
    if (!this.onDevice) return this.listenOnce(onPartial, false);

    try {
      return await this.listenOnce(onPartial, true);
    } catch (error) {
      if (isFinal(error)) throw error;
      // โมเดลในเครื่องใช้ไม่ได้ (เช่นยังดาวน์โหลดไม่เสร็จ): ถอยไปใช้แบบออนไลน์และจำไว้ทั้งรอบการใช้งาน
      this.onDevice = false;
      return this.listenOnce(onPartial, false);
    }
  }

  stop(): void {
    this.session?.requestStop();
  }

  cancel(): void {
    const session = this.session;
    if (!session) return;

    void SpeechRecognition.stop().catch(() => undefined);
    session.finish("aborted");
  }

  /** เปิดเฉพาะ iPhone/iPad ที่มีโมเดลภาษาไทยในเครื่อง เสียงจึงไม่ถูกส่งออกจากอุปกรณ์ */
  private async detectOnDeviceSupport(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "ios") return false;
    try {
      const { available } = await SpeechRecognition.isOnDeviceRecognitionAvailable({
        language: SPEECH_LANGUAGE,
        preferLegacyRecognizer: ON_DEVICE_OPTIONS.preferLegacyRecognizer
      });
      return available;
    } catch {
      return false;
    }
  }

  private listenOnce(onPartial: (text: string) => void, onDevice: boolean): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const later = (callback: () => void, delay: number) => {
        const timer = setTimeout(() => {
          session.timers.delete(timer);
          callback();
        }, delay);
        session.timers.add(timer);
        return timer;
      };

      const armSilenceTimer = (delay: number) => {
        if (session.silenceTimer) {
          clearTimeout(session.silenceTimer);
          session.timers.delete(session.silenceTimer);
        }
        session.silenceTimer = later(() => session.requestStop(), delay);
      };

      const session: Session = {
        transcript: "",
        stopping: false,
        finished: false,
        handles: [],
        timers: new Set(),
        silenceTimer: null,
        requestStop: () => {
          if (session.finished || session.stopping) return;
          session.stopping = true;
          void SpeechRecognition.stop().catch(() => undefined);
          later(() => session.finish(), FINAL_RESULT_GRACE_MS);
        },
        finish: (error) => {
          if (session.finished) return;
          session.finished = true;
          session.timers.forEach((timer) => clearTimeout(timer));
          session.timers.clear();
          session.handles.forEach((handle) => void handle.remove().catch(() => undefined));
          if (this.session === session) this.session = null;
          if (error) reject(new SpeechError(error));
          else resolve(session.transcript);
        }
      };
      this.session = session;

      const track = async (pending: Promise<PluginListenerHandle>) => {
        const handle = await pending;
        if (session.finished) void handle.remove().catch(() => undefined);
        else session.handles.push(handle);
      };

      const begin = async () => {
        await track(
          SpeechRecognition.addListener("partialResults", ({ matches }) => {
            const text = matches?.[0]?.trim();
            if (!text || session.finished) return;

            session.transcript = text;
            onPartial(text);
            // ผลลัพธ์ที่มาหลังสั่งหยุดคือผลลัพธ์สุดท้าย จบได้ทันที
            if (session.stopping) session.finish();
            else armSilenceTimer(END_OF_SPEECH_SILENCE_MS);
          })
        );
        await track(
          SpeechRecognition.addListener("listeningState", ({ state, status }) => {
            const stopped = state === "stopped" || status === "stopped";
            if (!stopped || session.finished || session.stopping) return;
            session.stopping = true;
            later(() => session.finish(), FINAL_RESULT_GRACE_MS);
          })
        );
        await track(
          SpeechRecognition.addListener("error", ({ code, message }) => {
            if (session.finished) return;
            const detail = `${code} ${message}`;
            // ได้ยินไปแล้วบางส่วน หรือระบบแจ้งว่าไม่มีคำพูด: จบด้วยข้อความเท่าที่มี ไม่ถือเป็นความผิดพลาด
            if (session.transcript || /no.?match|no.?speech|timeout/i.test(detail)) session.finish();
            else session.finish(mapError(detail));
          })
        );
        if (session.finished) return;

        // ตั้งเวลาก่อนสั่งเริ่ม เพราะบางเครื่องตอบกลับคำสั่งเริ่มก็ต่อเมื่อฟังจบแล้ว
        armSilenceTimer(NO_SPEECH_TIMEOUT_MS);
        later(() => session.requestStop(), MAX_LISTEN_MS);

        const result = await SpeechRecognition.start({
          language: SPEECH_LANGUAGE,
          maxResults: 1,
          partialResults: true,
          popup: false,
          ...(onDevice ? ON_DEVICE_OPTIONS : {})
        });
        if (session.finished) {
          void SpeechRecognition.stop().catch(() => undefined);
          return;
        }

        // ได้ข้อความกลับมาพร้อมคำสั่งเริ่ม แปลว่าการฟังรอบนี้จบแล้ว
        const text = result?.matches?.[0]?.trim();
        if (text) {
          session.transcript = text;
          session.finish();
        }
      };

      begin().catch((error: unknown) => session.finish(mapError(error)));
    });
  }
}
