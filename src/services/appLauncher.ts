import { Capacitor } from "@capacitor/core";
import { customAppsStore } from "./customAppsStore";

export type AppLaunchPlatform = "desktop" | "mobile" | "web";

export interface AppLaunchResult {
  ok: boolean;
  platform: AppLaunchPlatform;
  message: string;
}

interface MobileSchemeConfig {
  iosScheme?: string;
  androidScheme?: string;
  webUrl?: string;
}

const APP_META: Record<string, { name: string; mobile: MobileSchemeConfig }> = {
  chrome: {
    name: "Google Chrome",
    mobile: { iosScheme: "googlechrome://", androidScheme: "googlechrome://", webUrl: "https://www.google.com" }
  },
  edge: {
    name: "Microsoft Edge",
    mobile: { iosScheme: "microsoft-edge://", androidScheme: "microsoft-edge://" }
  },
  vscode: { name: "Visual Studio Code", mobile: {} },
  notepad: { name: "Notepad", mobile: {} },
  calculator: { name: "Calculator", mobile: {} },
  explorer: { name: "File Explorer", mobile: {} },
  terminal: { name: "Terminal", mobile: {} },
  excel: {
    name: "Microsoft Excel",
    mobile: { iosScheme: "ms-excel://", androidScheme: "ms-excel://" }
  },
  word: {
    name: "Microsoft Word",
    mobile: { iosScheme: "ms-word://", androidScheme: "ms-word://" }
  },
  line: {
    name: "LINE",
    mobile: { iosScheme: "line://", androidScheme: "line://", webUrl: "https://line.me" }
  },
  spotify: {
    name: "Spotify",
    mobile: { iosScheme: "spotify://", androidScheme: "spotify://", webUrl: "https://open.spotify.com" }
  },
  gmail: {
    name: "Gmail",
    mobile: { iosScheme: "googlegmail://", androidScheme: "googlegmail://", webUrl: "https://mail.google.com" }
  },
  calendar: {
    name: "Google Calendar",
    mobile: { iosScheme: "googlecalendar://", androidScheme: "googlecalendar://", webUrl: "https://calendar.google.com" }
  },
  maps: {
    name: "Google Maps",
    mobile: { iosScheme: "comgooglemaps://", androidScheme: "geo:0,0", webUrl: "https://maps.google.com" }
  },
  youtube: {
    name: "YouTube",
    mobile: { iosScheme: "youtube://", androidScheme: "youtube://", webUrl: "https://www.youtube.com" }
  },
  settings: {
    name: "System Settings",
    mobile: { iosScheme: "app-settings:" }
  }
};

interface DesktopBridge {
  isDesktop?: boolean;
  platform?: string;
  launchApp?: (appId: string, customPath?: string) => Promise<{ ok: boolean; message?: string }>;
}

function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { javisDesktop?: DesktopBridge };
  return scope.javisDesktop?.isDesktop ? scope.javisDesktop : null;
}

/**
 * เปิดโปรแกรมบนคอมพิวเตอร์ (Electron IPC) หรือแอปบนมือถือ (Capacitor Deep Link / URL Scheme)
 * กรณีอยู่บนเว็บเบราว์เซอร์ทั่วไป จะเปิดลิงก์เว็บสำรองถ้ามี หรือแจ้งให้เปิดผ่านแอปเดสก์ท็อป/มือถือ
 */
export async function launchAllowedApp(appId: string, appName?: string): Promise<AppLaunchResult> {
  const normalized = appId.trim().toLowerCase();
  const customApp = customAppsStore.find(appId);
  const meta = APP_META[normalized];
  const label = appName?.trim() || customApp?.name || meta?.name || appId;

  if (!meta && !customApp) {
    return {
      ok: false,
      platform: "web",
      message: `ไม่พบโปรแกรม ${label} ในรายการที่อนุญาตให้เปิดค่ะ`
    };
  }

  const desktop = getDesktopBridge();
  if (desktop?.launchApp) {
    try {
      const result = customApp
        ? await desktop.launchApp(customApp.id, customApp.path)
        : await desktop.launchApp(normalized);
      return {
        ok: result.ok,
        platform: "desktop",
        message: result.message || (result.ok ? `เปิด ${label} บนคอมพิวเตอร์ให้แล้วค่ะ` : `ไม่สามารถเปิด ${label} ได้ค่ะ`)
      };
    } catch {
      return {
        ok: false,
        platform: "desktop",
        message: `เกิดข้อผิดพลาดขณะเปิด ${label} บนคอมพิวเตอร์ค่ะ`
      };
    }
  }

  if (customApp) {
    return {
      ok: false,
      platform: Capacitor.isNativePlatform() ? "mobile" : "web",
      message: `โปรแกรมเฉพาะทาง ${label} เปิดได้เฉพาะบนแอปลูน่าบนคอมพิวเตอร์ (Electron) ค่ะ`
    };
  }

  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    const scheme = platform === "ios" ? meta.mobile.iosScheme : meta.mobile.androidScheme;
    const targetUrl = scheme ?? meta.mobile.webUrl;
    if (!targetUrl) {
      return {
        ok: false,
        platform: "mobile",
        message: `${label} เป็นโปรแกรมสำหรับคอมพิวเตอร์ ยังไม่รองรับการเปิดบนอุปกรณ์เคลื่อนที่ค่ะ`
      };
    }
    try {
      window.location.href = targetUrl;
      return {
        ok: true,
        platform: "mobile",
        message: `กำลังเปิดแอป ${label} บนอุปกรณ์เคลื่อนที่ให้ค่ะ`
      };
    } catch {
      return {
        ok: false,
        platform: "mobile",
        message: `ไม่สามารถเปิดแอป ${label} บนอุปกรณ์นี้ได้ค่ะ`
      };
    }
  }

  if (meta.mobile.webUrl && typeof window !== "undefined") {
    const popup = window.open(meta.mobile.webUrl, "_blank", "noopener,noreferrer");
    return {
      ok: Boolean(popup),
      platform: "web",
      message: popup
        ? `เปิด ${label} เวอร์ชันเว็บให้ในแท็บใหม่แล้วค่ะ`
        : `เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาตป๊อปอัปเพื่อเปิด ${label} ค่ะ`
    };
  }

  return {
    ok: false,
    platform: "web",
    message: `การเปิดโปรแกรม ${label} ในเครื่อง ต้องใช้งานผ่านแอปลูน่าบนคอมพิวเตอร์ (Electron) ค่ะ`
  };
}
