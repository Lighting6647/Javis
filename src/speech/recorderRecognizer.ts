import { createSilenceDetector, rmsLevel } from "./silenceDetector";
import { SpeechError, type SpeechErrorCode, type SpeechRecognizer } from "./types";

const CHECK_INTERVAL_MS = 100;
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/** ส่งเสียงที่อัดไปแปลงเป็นข้อความ คืนข้อความที่ได้ยิน ล้มเหลวด้วย SpeechError */
export type Transcribe = (audio: Blob, signal: AbortSignal) => Promise<string>;

interface Session {
  finish: (verdict: "send" | "discard" | SpeechErrorCode) => void;
}

function mapMediaError(error: unknown): SpeechErrorCode {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  if (name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError") return "no-microphone";
  return "unknown";
}

function pickMimeType(): string | undefined {
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * ตัวฟังสำหรับแอปเดสก์ท็อป ซึ่งระบบรู้จำเสียงของเบราว์เซอร์ใช้ไม่ได้:
 * อัดเสียงเอง ตัดจบเมื่อผู้ใช้เงียบ แล้วส่งไปแปลงเป็นข้อความผ่านเซิร์ฟเวอร์ Javis
 * จึงไม่มีข้อความขึ้นสดระหว่างพูด และเสียงออกจากอุปกรณ์
 */
export class RecorderSpeechRecognizer implements SpeechRecognizer {
  private session: Session | null = null;
  /** เพิ่มขึ้นทุกครั้งที่ถูกยกเลิก เพื่อให้การฟังที่ยังรอไมโครโฟนอยู่รู้ตัวและไม่เริ่มอัด */
  private generation = 0;

  constructor(private readonly transcribe: Transcribe) {}

  async prepare(): Promise<void> {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new SpeechError("not-supported");
    }

    // ขอสิทธิ์ไมโครโฟนตั้งแต่ตอนเริ่ม เพื่อให้ผู้ใช้เห็นข้อความแจ้งทันทีถ้าไม่ได้รับอนุญาต
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      throw new SpeechError(mapMediaError(error));
    }
  }

  isOnDevice(): boolean {
    return false;
  }

  async listen(): Promise<string> {
    this.cancel();
    const generation = this.generation;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (error) {
      throw new SpeechError(mapMediaError(error));
    }

    // ถูกยกเลิกระหว่างรอไมโครโฟน: ปิดไมค์ทันที ไม่เริ่มอัด
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      throw new SpeechError("aborted");
    }

    return new Promise<string>((resolve, reject) => {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      const upload = new AbortController();
      const detector = createSilenceDetector();
      const startedAt = performance.now();
      let settled = false;
      let verdict: "send" | "discard" | SpeechErrorCode = "discard";

      const release = () => {
        clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close().catch(() => undefined);
      };

      const settle = (action: () => void) => {
        if (settled) return;
        settled = true;
        if (this.session === session) this.session = null;
        action();
      };

      const session: Session = {
        finish: (next) => {
          // ยกเลิกได้แม้อัดเสร็จแล้วและกำลังรอผลแปลงเสียง
          if (next === "aborted") upload.abort();
          if (recorder.state === "inactive") return;
          verdict = next;
          release();
          recorder.stop();
        }
      };
      this.session = session;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        release();
        settle(() => reject(new SpeechError("unknown")));
      };
      recorder.onstop = () => {
        if (verdict === "discard") {
          settle(() => resolve(""));
          return;
        }
        if (verdict !== "send") {
          const code = verdict;
          settle(() => reject(new SpeechError(code)));
          return;
        }

        const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        this.transcribe(audio, upload.signal).then(
          (text) => settle(() => resolve(text.trim())),
          (error: unknown) =>
            settle(() => {
              if (upload.signal.aborted) reject(new SpeechError("aborted"));
              else reject(error instanceof SpeechError ? error : new SpeechError("network"));
            })
        );
      };

      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        const result = detector.feed(rmsLevel(samples), performance.now() - startedAt);
        if (result === "continue") return;
        // ไม่ได้ยินเสียงพูดเลย: ทิ้งเสียงที่อัดไว้ ไม่ต้องส่งไปแปลงให้เสียค่าใช้จ่าย
        session.finish(detector.heardSpeech ? "send" : "discard");
      }, CHECK_INTERVAL_MS);

      try {
        recorder.start();
      } catch {
        release();
        settle(() => reject(new SpeechError("unknown")));
      }
    });
  }

  /** ผู้ใช้บอกว่าพูดจบแล้ว: ส่งเสียงเท่าที่อัดได้ไปแปลงเป็นข้อความ */
  stop(): void {
    this.session?.finish("send");
  }

  cancel(): void {
    this.generation += 1;
    this.session?.finish("aborted");
  }
}
