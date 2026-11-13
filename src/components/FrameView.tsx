import { ExternalLink, Globe, LoaderCircle, RotateCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type BrowserState, browserStore } from "../browser/browserStore";
import { hostOf } from "../conversation/richText";

/** หน้าในกรอบยังไม่แจ้งว่าโหลดเสร็จภายในเวลานี้: บอกทางออกให้ผู้ใช้ เพราะหน้า Javis มองไม่เห็นว่าข้างในเกิดอะไรขึ้น */
const SLOW_LOAD_MS = 8000;

/**
 * สิทธิ์ของหน้าในกรอบ: รันสคริปต์ ใช้ที่เก็บของเว็บตัวเอง ส่งฟอร์ม และเปิดลิงก์ในแท็บใหม่ได้ ตามที่หน้าเว็บทั่วไปต้องใช้
 * แต่พาแท็บของ Javis ไปที่อื่นไม่ได้ ดาวน์โหลดไฟล์ไม่ได้ และใช้ไมโครโฟน กล้อง หรือตำแหน่งไม่ได้ (ไม่ได้มอบสิทธิ์ผ่าน allow)
 */
const FRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

interface FrameViewProps {
  browser: BrowserState;
}

/**
 * กรอบแสดงหน้าเว็บในหน้า Javis สำหรับเว็บในเบราว์เซอร์: ผู้ใช้สั่งเปิดเว็บหรือหาข้อมูลแล้วเห็นหน้านั้นในพื้นที่หลักเลย
 * ไม่ต้องออกจาก Javis และ Javis ยังฟังต่อได้ แสดงเฉพาะหน้าที่เซิร์ฟเวอร์ตรวจแล้วว่าเจ้าของเว็บยอมให้แสดงในกรอบ
 * (แอปเดสก์ท็อปใช้เบราว์เซอร์ในตัวที่ src/components/BrowserView.tsx ซึ่งแสดงได้ทุกเว็บ)
 */
export function FrameView({ browser }: FrameViewProps) {
  /** เพิ่มเพื่อโหลดหน้าเดิมใหม่ */
  const [reloads, setReloads] = useState(0);
  /** กรอบที่โหลดนานเกินกำหนด จำเป็นรายกรอบ จึงหายเองเมื่อเปิดหน้าใหม่หรือโหลดเสร็จ */
  const [slowFrame, setSlowFrame] = useState<string | null>(null);
  const url = browser.requestedUrl ?? "";
  /** สร้างกรอบใหม่ทุกครั้งที่สั่งเปิดหรือโหลดใหม่ เพื่อไม่ให้หน้าเก่าค้างอยู่ระหว่างรอหน้าใหม่ */
  const frameKey = `${browser.requestId}:${reloads}`;
  const slow = browser.loading && slowFrame === frameKey;

  useEffect(() => {
    if (!browser.loading) return;
    const timer = window.setTimeout(() => setSlowFrame(frameKey), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [browser.loading, frameKey]);

  const reload = () => {
    browserStore.update({ loading: true });
    setReloads((count) => count + 1);
  };

  return (
    <section className={browser.visible ? "browser" : "browser concealed"} aria-label="หน้าเว็บที่เปิดอยู่" aria-hidden={!browser.visible}>
      <div className="browser-bar">
        <button type="button" className="icon-button" onClick={reload} aria-label="โหลดหน้าใหม่">
          <RotateCw size={16} aria-hidden />
        </button>

        <div className="browser-address" title={url}>
          {browser.loading ? <LoaderCircle size={14} className="spin" aria-hidden /> : <Globe size={14} aria-hidden />}
          <strong>{hostOf(url)}</strong>
          <span>{browser.title}</span>
        </div>

        <a className="icon-button" href={url} target="_blank" rel="noopener noreferrer" aria-label="เปิดหน้านี้ในแท็บใหม่" title="เปิดหน้านี้ในแท็บใหม่">
          <ExternalLink size={16} aria-hidden />
        </a>
        <button type="button" className="icon-button" onClick={browserStore.close} aria-label="ปิดหน้าเว็บ">
          <X size={17} aria-hidden />
        </button>
      </div>

      {slow && (
        <p className="browser-note" role="status">
          หน้านี้โหลดนานกว่าปกติ ถ้ายังไม่ขึ้น กดปุ่มเปิดในแท็บใหม่ที่มุมขวาบนของกรอบได้
        </p>
      )}

      <iframe
        key={frameKey}
        className="browser-frame"
        src={url}
        title={browser.title || hostOf(url)}
        sandbox={FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        onLoad={() => browserStore.update({ loading: false })}
      />
    </section>
  );
}
