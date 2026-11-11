import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** ส่วนของแท็ก <webview> ของ Electron ที่ Javis ใช้ */
export interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  executeJavaScript(code: string): Promise<unknown>;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<WebviewElement>, WebviewElement> & {
        src?: string;
        partition?: string;
      };
    }
  }
}
