import { ExternalLink, Globe, LoaderCircle, RotateCw, Volume2, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { type BrowserState, browserStore } from "../browser/browserStore";
import { createExternalAutoOpener, isKnownFrameBlocked, toEmbeddableFrameUrl } from "../browser/frameEmbed";
import { hostOf } from "../conversation/richText";
import { openExternalPage } from "../services/openPage";

/** หน้าในกรอบยังไม่แจ้งว่าโหลดเสร็จภายในเวลานี้: บอกทางออกให้ผู้ใช้ เพราะหน้า Javis มองไม่เห็นว่าข้างในเกิดอะไรขึ้น */
const SLOW_LOAD_MS = 8000;

/**
 * สิทธิ์ของหน้าในกรอบ: รันสคริปต์ ใช้ที่เก็บของเว็บตัวเอง ส่งฟอร์ม และเปิดลิงก์ในแท็บใหม่ได้ ตามที่หน้าเว็บทั่วไปต้องใช้
 * แต่พาแท็บของ Javis ไปที่อื่นไม่ได้ ดาวน์โหลดไฟล์ไม่ได้ และใช้ไมโครโฟน กล้อง หรือตำแหน่งไม่ได้ (ไม่ได้มอบสิทธิ์ผ่าน allow)
 */
const FRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

interface FrameViewProps {
  browser: BrowserState;
  /** สั่งให้ Javis ดึงเนื้อหาหน้าเว็บนี้มาสรุปและอ่านให้ฟัง */
  onReadPage?: () => void;
}

/**
 * กรอบแสดงหน้าเว็บในหน้า Javis สำหรับเว็บในเบราว์เซอร์: ผู้ใช้สั่งเปิดเว็บหรือหาข้อมูลแล้วเห็นหน้านั้นในพื้นที่หลักเลย
 * ไม่ต้องออกจาก Javis และ Javis ยังฟังต่อได้ แสดงเฉพาะหน้าที่เซิร์ฟเวอร์ตรวจแล้วว่าเจ้าของเว็บยอมให้แสดงในกรอบ
 * (แอปเดสก์ท็อปใช้เบราว์เซอร์ในตัวที่ src/components/BrowserView.tsx ซึ่งแสดงได้ทุกเว็บ)
 */
export function FrameView({ browser, onReadPage }: FrameViewProps) {
  /** เพิ่มเพื่อโหลดหน้าเดิมใหม่ */
  const [reloads, setReloads] = useState(0);
  /** กรอบที่โหลดนานเกินกำหนด จำเป็นรายกรอบ จึงหายเองเมื่อเปิดหน้าใหม่หรือโหลดเสร็จ */
  const [slowFrame, setSlowFrame] = useState<string | null>(null);
  /** เปิดหน้าที่แสดงในกรอบไม่ได้ในแท็บใหม่ให้เอง ครั้งเดียวต่อหนึ่งคำสั่ง */
  const [autoOpener] = useState(() => createExternalAutoOpener(openExternalPage));
  const url = browser.requestedUrl ?? "";
  const frameSrc = toEmbeddableFrameUrl(url);
  const blockedInFrame = isKnownFrameBlocked(frameSrc);
  /** สร้างกรอบใหม่ทุกครั้งที่สั่งเปิดหรือโหลดใหม่ เพื่อไม่ให้หน้าเก่าค้างอยู่ระหว่างรอหน้าใหม่ */
  const frameKey = `${browser.requestId}:${reloads}`;
  const slow = browser.loading && slowFrame === frameKey;
  /** null = ยังไม่ได้ลองเปิดแยกสำหรับคำสั่งนี้ (เช่นกรอบยังซ่อนอยู่) */
  const autoOpenStatus = useSyncExternalStore(autoOpener.subscribe, () => autoOpener.statusOf(browser.requestId));

  // หน้าที่แสดงในกรอบไม่ได้: ลองเปิดในแท็บใหม่ให้เองหนึ่งครั้ง ถ้าเบราว์เซอร์กันไว้ การ์ดจะบอกให้ผู้ใช้กดปุ่มเปิดเอง
  useEffect(() => {
    if (!browser.visible || !blockedInFrame || !url) return;
    if (autoOpener.attempt(browser.requestId, url)) browserStore.update({ loading: false });
  }, [autoOpener, browser.requestId, browser.visible, blockedInFrame, url]);

  useEffect(() => {
    if (!browser.loading || blockedInFrame) return;
    const timer = window.setTimeout(() => setSlowFrame(frameKey), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [browser.loading, blockedInFrame, frameKey]);

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

        {onReadPage && (
          <button
            type="button"
            className="browser-read-btn"
            onClick={onReadPage}
            aria-label="อ่านหน้านี้ให้ฟัง"
            title="ให้จาร์วิสดึงเนื้อหาหน้าเว็บนี้มาสรุปและอ่านให้ฟัง"
          >
            <Volume2 size={15} aria-hidden />
            <span>อ่านหน้านี้</span>
          </button>
        )}
        <a className="icon-button" href={url} target="_blank" rel="noopener noreferrer" aria-label="เปิดหน้านี้ในแท็บใหม่" title="เปิดหน้านี้ในแท็บใหม่">
          <ExternalLink size={16} aria-hidden />
        </a>
        <button type="button" className="icon-button" onClick={browserStore.close} aria-label="ปิดหน้าเว็บ">
          <X size={17} aria-hidden />
        </button>
      </div>

      {slow && !blockedInFrame && (
        <p className="browser-note" role="status">
          หน้านี้โหลดนานกว่าปกติ ถ้ายังไม่ขึ้น กดปุ่มเปิดในแท็บใหม่ที่มุมขวาบนของกรอบได้
        </p>
      )}

      {blockedInFrame ? (
        <div className="browser-blocked-card" role="region" aria-label="เว็บนี้ไม่อนุญาตให้แสดงในกรอบ">
          <Globe size={28} aria-hidden />
          <strong>
            {autoOpenStatus === "opened" ? `เปิด ${hostOf(url)} ในแท็บใหม่ให้แล้วค่ะ` : `${hostOf(url)} เปิดในจาร์วิสไม่ได้ค่ะ`}
          </strong>
          <p>
            {autoOpenStatus === "opened"
              ? "เว็บนี้ไม่ยอมให้แสดงในจาร์วิส เลยเปิดแยกให้นะคะ ถ้าแท็บใหม่ไม่ขึ้น กดปุ่มด้านล่างได้เลยค่ะ"
              : autoOpenStatus === "blocked"
                ? "เบราว์เซอร์กันหน้าต่างเด้งไว้ค่ะ กดปุ่มด้านล่างเพื่อเปิดในแท็บใหม่นะคะ (ถ้าเป็น YouTube สั่งชื่อเพลงหรือคลิปเจาะจง จะเล่นในจาร์วิสได้เลยค่ะ)"
                : "เจ้าของเว็บไม่ยอมให้แสดงในกรอบค่ะ กดปุ่มด้านล่างเพื่อเปิดในแท็บใหม่นะคะ"}
          </p>
          <div className="browser-blocked-actions">
            <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} aria-hidden /> {autoOpenStatus === "opened" ? "เปิดอีกครั้ง" : "เปิดในแท็บใหม่"}
            </a>
            <button type="button" className="btn btn-quiet" onClick={browserStore.close}>
              ปิดหน้าเว็บ
            </button>
          </div>
        </div>
      ) : (
        <iframe
          key={frameKey}
          className="browser-frame"
          src={frameSrc}
          title={browser.title || hostOf(url)}
          sandbox={FRAME_SANDBOX}
          referrerPolicy="no-referrer"
          onLoad={() => browserStore.update({ loading: false })}
        />
      )}
    </section>
  );
}
