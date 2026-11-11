import { ArrowLeft, ArrowRight, Globe, LoaderCircle, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type BrowserState, browserStore } from "../browser/browserStore";
import { buildFillScript, EXTRACT_FIELDS_SCRIPT } from "../browser/pageScripts";
import { sanitizeFillResult, sanitizePageContext } from "../browser/sanitize";
import type { PageBridge } from "../browser/types";
import type { WebviewElement } from "../browser/webview";
import { hostOf } from "../conversation/richText";

/** รหัสข้อผิดพลาดของ Chromium ที่หมายถึงการโหลดถูกยกเลิกเอง ไม่ใช่ความล้มเหลว */
const ERROR_ABORTED = -3;

interface FailLoadEvent extends Event {
  errorCode: number;
  isMainFrame: boolean;
}

interface BrowserViewProps {
  browser: BrowserState;
}

/**
 * เบราว์เซอร์ในตัวของแอปเดสก์ท็อป: แสดงหน้าเว็บที่ผู้ใช้สั่งเปิด
 * และเป็นตัวกลางให้ Javis อ่านช่องกรอกข้อมูลกับกรอกค่าตามที่ผู้ใช้ยืนยัน
 */
export function BrowserView({ browser }: BrowserViewProps) {
  const viewRef = useRef<WebviewElement>(null);
  const [ready, setReady] = useState(false);
  /** หน้าแรกถูกโหลดผ่าน src ตอนสร้าง หลังจากนั้นจึงสั่งเปลี่ยนหน้าด้วย loadURL */
  const [initialUrl] = useState(browser.requestedUrl ?? "");
  const loadedRequest = useRef(browser.requestId);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const sync = () => {
      try {
        browserStore.update({
          currentUrl: view.getURL(),
          title: view.getTitle(),
          canGoBack: view.canGoBack(),
          canGoForward: view.canGoForward()
        });
      } catch {
        // หน้ายังไม่พร้อมให้ถามสถานะ จะอัปเดตอีกครั้งเมื่อพร้อม
      }
    };
    const onReady = () => {
      setReady(true);
      sync();
    };
    const onStart = () => browserStore.update({ loading: true, error: null });
    const onStop = () => {
      browserStore.update({ loading: false });
      sync();
    };
    const onFail = (event: Event) => {
      const { errorCode, isMainFrame } = event as FailLoadEvent;
      if (!isMainFrame || errorCode === ERROR_ABORTED) return;
      browserStore.update({ loading: false, error: "เปิดหน้าเว็บนี้ไม่ได้ กรุณาตรวจที่อยู่เว็บหรืออินเทอร์เน็ตแล้วลองใหม่" });
    };

    view.addEventListener("dom-ready", onReady);
    view.addEventListener("did-start-loading", onStart);
    view.addEventListener("did-stop-loading", onStop);
    view.addEventListener("did-navigate", sync);
    view.addEventListener("did-navigate-in-page", sync);
    view.addEventListener("page-title-updated", sync);
    view.addEventListener("did-fail-load", onFail);

    return () => {
      view.removeEventListener("dom-ready", onReady);
      view.removeEventListener("did-start-loading", onStart);
      view.removeEventListener("did-stop-loading", onStop);
      view.removeEventListener("did-navigate", sync);
      view.removeEventListener("did-navigate-in-page", sync);
      view.removeEventListener("page-title-updated", sync);
      view.removeEventListener("did-fail-load", onFail);
    };
  }, []);

  // ผู้ใช้สั่งเปิดหน้าใหม่ขณะที่เบราว์เซอร์เปิดอยู่แล้ว
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready || !browser.requestedUrl || loadedRequest.current === browser.requestId) return;
    loadedRequest.current = browser.requestId;
    void view.loadURL(browser.requestedUrl).catch(() => undefined);
  }, [ready, browser.requestId, browser.requestedUrl]);

  // เปิดให้ Javis อ่านช่องและกรอกค่าได้เมื่อหน้าพร้อม
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready) return;

    const bridge: PageBridge = {
      async getContext() {
        try {
          return sanitizePageContext(await view.executeJavaScript(EXTRACT_FIELDS_SCRIPT));
        } catch {
          return null;
        }
      },
      async fill(pageUrl, values) {
        const ids = values.map((entry) => entry.id);
        try {
          const script = buildFillScript(
            pageUrl,
            values.map(({ id, value }) => ({ id, value }))
          );
          return sanitizeFillResult(await view.executeJavaScript(script), ids);
        } catch {
          return { filled: 0, missing: ids, failure: "unavailable" };
        }
      }
    };

    browserStore.setBridge(bridge);
    return () => browserStore.setBridge(null);
  }, [ready]);

  /** สั่งงานเบราว์เซอร์จากปุ่ม โดยไม่ล้มถ้าหน้ายังไม่พร้อม */
  const navigate = (action: "back" | "forward" | "reload") => {
    const view = viewRef.current;
    if (!view || !ready) return;
    try {
      if (action === "back") view.goBack();
      else if (action === "forward") view.goForward();
      else view.reload();
    } catch {
      // หน้ากำลังเปลี่ยนสถานะ ผู้ใช้กดใหม่ได้
    }
  };

  return (
    <section className={browser.visible ? "browser" : "browser concealed"} aria-label="เบราว์เซอร์ในตัว" aria-hidden={!browser.visible}>
      <div className="browser-bar">
        <button type="button" className="icon-button" onClick={() => navigate("back")} disabled={!browser.canGoBack} aria-label="ย้อนกลับ">
          <ArrowLeft size={17} aria-hidden />
        </button>
        <button type="button" className="icon-button" onClick={() => navigate("forward")} disabled={!browser.canGoForward} aria-label="ไปข้างหน้า">
          <ArrowRight size={17} aria-hidden />
        </button>
        <button type="button" className="icon-button" onClick={() => navigate("reload")} aria-label="โหลดหน้าใหม่">
          <RotateCw size={16} aria-hidden />
        </button>

        <div className="browser-address" title={browser.currentUrl}>
          {browser.loading ? <LoaderCircle size={14} className="spin" aria-hidden /> : <Globe size={14} aria-hidden />}
          <strong>{hostOf(browser.currentUrl)}</strong>
          <span>{browser.title}</span>
        </div>

        <button type="button" className="icon-button" onClick={browserStore.close} aria-label="ปิดหน้าเว็บ">
          <X size={17} aria-hidden />
        </button>
      </div>

      {browser.error && <p className="browser-error" role="alert">{browser.error}</p>}

      <webview ref={viewRef} src={initialUrl} partition="persist:javis-browser" className="browser-frame" />
    </section>
  );
}
