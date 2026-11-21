// แอปเดสก์ท็อปของ Javis: หน้าต่างของตัวเอง + เบราว์เซอร์ในตัวสำหรับเปิดเว็บและกรอกฟอร์มตามสั่ง
// ตัวแอปเป็นเพียงเปลือก หน้าจอและ AI ทั้งหมดมาจากเซิร์ฟเวอร์ Javis ที่ JAVIS_URL
// จึงไม่มี API key หรือความลับใดอยู่ในแอปนี้
const { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, session, shell, Tray } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SERVER_URL = "http://localhost:8787";
/** ที่เก็บคุกกี้ของเว็บที่ผู้ใช้เปิด แยกจากตัวแอป Javis โดยสิ้นเชิง */
const BROWSER_PARTITION = "persist:javis-browser";

function readServerUrl() {
  const raw = (process.env.JAVIS_URL || DEFAULT_SERVER_URL).trim();
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url;
  } catch {
    // ตกไปใช้ค่าเริ่มต้นด้านล่าง
  }
  console.warn(`JAVIS_URL ไม่ถูกต้อง ใช้ ${DEFAULT_SERVER_URL} แทน`);
  return new URL(DEFAULT_SERVER_URL);
}

const serverUrl = readServerUrl();
const offlinePage = path.join(__dirname, "offline.html");

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isAppUrl(value) {
  try {
    return new URL(value).origin === serverUrl.origin;
  } catch {
    return false;
  }
}

function isOfflinePage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "file:" && path.normalize(decodeURIComponent(url.pathname)).endsWith("offline.html");
  } catch {
    return false;
  }
}

function showOffline(window) {
  void window.loadFile(offlinePage, { query: { target: serverUrl.href } });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 400,
    minHeight: 560,
    title: "Javis",
    backgroundColor: "#020b14",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // ใช้แสดงหน้าเว็บภายนอกในตัวแอป หน้าเว็บนั้นรันแยกโปรเซสและไม่มีสิทธิ์ของตัวแอป
      webviewTag: true
    }
  });

  window.once("ready-to-show", () => window.show());

  // หน้าต่างหลักแสดงได้เฉพาะ Javis เท่านั้น ลิงก์อื่นส่งไปเปิดในเบราว์เซอร์ของระบบ
  window.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url) || isOfflinePage(url)) return;
    event.preventDefault();
    if (isHttpUrl(url)) void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("did-fail-load", (_event, _code, _description, url, isMainFrame) => {
    if (isMainFrame && isAppUrl(url)) showOffline(window);
  });

  // ล็อกการตั้งค่าของเบราว์เซอร์ในตัว ไม่ให้หน้าเว็บ Javis (หรือโค้ดที่แทรกเข้ามา) ยกระดับสิทธิ์ของหน้าเว็บภายนอกได้
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    params.partition = BROWSER_PARTITION;
    params.allowpopups = false;
    if (params.src && !isHttpUrl(params.src)) event.preventDefault();
  });

  void window.loadURL(serverUrl.href).catch(() => showOffline(window));
  return window;
}

/** กฎของหน้าเว็บภายนอกที่เปิดในเบราว์เซอร์ในตัว */
function guardGuestContents(contents) {
  // เปิดได้เฉพาะ http/https และลิงก์ที่ขอเปิดหน้าต่างใหม่ให้เปิดในหน้าเดิมแทน
  contents.on("will-navigate", (event, url) => {
    if (!isHttpUrl(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void contents.loadURL(url);
    return { action: "deny" };
  });
}

/**
 * รายการโปรแกรมที่อนุญาตให้เปิดผ่านแอปเดสก์ท็อป (Allowlist เท่านั้น — ห้ามรันคำสั่ง OS อิสระ)
 */
const DESKTOP_APP_ALLOWLIST = {
  chrome: {
    win32: { cmd: "cmd.exe", args: ["/c", "start", "", "chrome"] },
    darwin: { cmd: "open", args: ["-a", "Google Chrome"] },
    linux: { cmd: "google-chrome", args: [] }
  },
  edge: {
    win32: { cmd: "cmd.exe", args: ["/c", "start", "", "msedge"] },
    darwin: { cmd: "open", args: ["-a", "Microsoft Edge"] },
    linux: { cmd: "microsoft-edge", args: [] }
  },
  vscode: {
    win32: { cmd: "cmd.exe", args: ["/c", "start", "", "code"] },
    darwin: { cmd: "open", args: ["-a", "Visual Studio Code"] },
    linux: { cmd: "code", args: [] }
  },
  notepad: {
    win32: { cmd: "notepad.exe", args: [] },
    darwin: { cmd: "open", args: ["-a", "TextEdit"] },
    linux: { cmd: "gedit", args: [] }
  },
  calculator: {
    win32: { cmd: "calc.exe", args: [] },
    darwin: { cmd: "open", args: ["-a", "Calculator"] },
    linux: { cmd: "gnome-calculator", args: [] }
  },
  explorer: {
    win32: { cmd: "explorer.exe", args: [] },
    darwin: { cmd: "open", args: ["."] },
    linux: { cmd: "xdg-open", args: ["."] }
  },
  terminal: {
    win32: { cmd: "cmd.exe", args: ["/c", "start", "", "powershell.exe"] },
    darwin: { cmd: "open", args: ["-a", "Terminal"] },
    linux: { cmd: "x-terminal-emulator", args: [] }
  },
  excel: {
    win32: { cmd: "cmd.exe", args: ["/c", "start", "", "excel"] },
    darwin: { cmd: "open", args: ["-a", "Microsoft Excel"] }
  },
  word: {
    win32: { cmd: "cmd.exe", args: ["/c", "start", "", "winword"] },
    darwin: { cmd: "open", args: ["-a", "Microsoft Word"] }
  },
  line: {
    win32: { externalUrl: "line://" },
    darwin: { cmd: "open", args: ["-a", "LINE"] }
  },
  spotify: {
    win32: { externalUrl: "spotify:" },
    darwin: { cmd: "open", args: ["-a", "Spotify"] },
    linux: { cmd: "spotify", args: [] }
  },
  gmail: { externalUrl: "https://mail.google.com" },
  calendar: { externalUrl: "https://calendar.google.com" },
  maps: { externalUrl: "https://maps.google.com" },
  youtube: { externalUrl: "https://www.youtube.com" },
  settings: {
    win32: { externalUrl: "ms-settings:" },
    darwin: { cmd: "open", args: ["-a", "System Settings"] }
  }
};

const SAFE_CUSTOM_EXT = /\.(exe|lnk|bat|cmd|app|sh)$/i;
const UNSAFE_PATH_CHARS = /[;&|<>`$]/;

async function launchCustomDesktopPath(rawPath) {
  const targetPath = typeof rawPath === "string" ? rawPath.trim() : "";
  if (!targetPath || !path.isAbsolute(targetPath) || UNSAFE_PATH_CHARS.test(targetPath) || !SAFE_CUSTOM_EXT.test(targetPath)) {
    return { ok: false, message: "พาธโปรแกรมที่กำหนดเองไม่ถูกต้องหรือนามสกุลไฟล์ไม่ได้รับอนุญาตค่ะ" };
  }
  if (!fs.existsSync(targetPath)) {
    return { ok: false, message: `ไม่พบไฟล์โปรแกรมที่ระบุ (${path.basename(targetPath)}) ค่ะ` };
  }
  try {
    if (/\.(lnk|app)$/i.test(targetPath)) {
      const errorText = await shell.openPath(targetPath);
      if (errorText) return { ok: false, message: `เปิดโปรแกรม ${path.basename(targetPath)} ไม่สำเร็จค่ะ` };
      return { ok: true, message: `เปิดโปรแกรม ${path.basename(targetPath)} ให้แล้วค่ะ` };
    }
    const child = spawn(targetPath, [], {
      detached: true,
      stdio: "ignore",
      shell: false,
      windowsHide: /\.(bat|cmd)$/i.test(targetPath)
    });
    child.unref();
    return { ok: true, message: `เปิดโปรแกรม ${path.basename(targetPath)} ให้แล้วค่ะ` };
  } catch {
    return { ok: false, message: `เกิดข้อผิดพลาดขณะเปิด ${path.basename(targetPath)} ค่ะ` };
  }
}

async function launchDesktopApp(rawAppId, customPath) {
  if (typeof customPath === "string" && customPath.trim()) {
    return launchCustomDesktopPath(customPath);
  }
  const appId = typeof rawAppId === "string" ? rawAppId.trim().toLowerCase() : "";
  const entry = DESKTOP_APP_ALLOWLIST[appId];
  if (!entry) {
    return { ok: false, message: `ไม่อนุญาตให้เปิดโปรแกรม ${appId || "(ไม่ระบุ)"} ค่ะ` };
  }

  const target = entry.externalUrl ? entry : entry[process.platform];
  if (!target) {
    return { ok: false, message: `โปรแกรม ${appId} ยังไม่รองรับบนระบบปฏิบัติการนี้ค่ะ` };
  }

  try {
    if (target.externalUrl) {
      await shell.openExternal(target.externalUrl);
      return { ok: true, message: `เปิด ${appId} ให้เรียบร้อยแล้วค่ะ` };
    }
    const child = spawn(target.cmd, target.args, {
      detached: true,
      stdio: "ignore",
      shell: false,
      windowsHide: target.cmd === "cmd.exe"
    });
    child.unref();
    return { ok: true, message: `เปิด ${appId} บนคอมพิวเตอร์ให้แล้วค่ะ` };
  } catch {
    return { ok: false, message: `ไม่พบหรือเปิดโปรแกรม ${appId} ไม่สำเร็จค่ะ` };
  }
}

function configureIpcHandlers() {
  ipcMain.handle("javis:launch-app", async (event, appId, customPath) => {
    const senderUrl = event.senderFrame?.url ?? "";
    if (!isAppUrl(senderUrl)) {
      return { ok: false, message: "คำขอเปิดโปรแกรมไม่ได้มาจากแอปเดลลูน่าที่ได้รับอนุญาตค่ะ" };
    }
    return launchDesktopApp(appId, customPath);
  });

  ipcMain.handle("javis:pick-app-file", async (event) => {
    const senderUrl = event.senderFrame?.url ?? "";
    if (!isAppUrl(senderUrl)) {
      return { canceled: true };
    }
    const result = await dialog.showOpenDialog({
      title: "เลือกไฟล์โปรแกรม (.exe / .lnk / .bat)",
      properties: ["openFile"],
      filters: [
        { name: "Programs & Scripts", extensions: ["exe", "lnk", "bat", "cmd", "app", "sh"] }
      ]
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true };
    }
    const selectedPath = result.filePaths[0];
    const baseName = path.basename(selectedPath, path.extname(selectedPath));
    return { canceled: false, path: selectedPath, name: baseName };
  });

  ipcMain.handle("javis:notify", (event, rawTitle, rawBody) => {
    const senderUrl = event.senderFrame?.url ?? "";
    if (!isAppUrl(senderUrl) || !Notification.isSupported()) {
      return { ok: false };
    }
    const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim().slice(0, 100) : "เดลลูน่า (DelLuna)";
    const body = typeof rawBody === "string" ? rawBody.trim().slice(0, 300) : "";
    const notice = new Notification({ title, body });
    notice.on("click", () => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        if (mainWindowRef.isMinimized()) mainWindowRef.restore();
        mainWindowRef.show();
        mainWindowRef.focus();
      }
    });
    notice.show();
    return { ok: true };
  });
}

function configurePermissions() {
  // ตัวแอป Javis ขอได้อย่างเดียวคือไมโครโฟน และต้องมาจากเซิร์ฟเวอร์ Javis เท่านั้น
  const appSession = session.defaultSession;
  const allowApp = (permission, origin) => permission === "media" && isAppUrl(origin);
  appSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowApp(permission, details.requestingUrl || contents.getURL()));
  });
  appSession.setPermissionCheckHandler((_contents, permission, origin) => allowApp(permission, origin));
  if (typeof appSession.setDisplayMediaRequestHandler === "function") {
    appSession.setDisplayMediaRequestHandler((_request, callback) => {
      void desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => callback(sources[0] ? { video: sources[0] } : {}))
        .catch(() => callback({}));
    });
  }

  // หน้าเว็บภายนอกขอสิทธิ์ใดไม่ได้เลย (กล้อง ไมโครโฟน ตำแหน่ง การแจ้งเตือน ฯลฯ)
  const browserSession = session.fromPartition(BROWSER_PARTITION);
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
}

// ไอคอน SVG ขนาดเล็กสำหรับ System Tray (ไม่ต้องพึ่งไฟล์รูปภายนอก)
const TRAY_ICON_DATA_URL =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="8" fill="#020b14"/>' +
      '<circle cx="16" cy="16" r="10" fill="none" stroke="#38bdf8" stroke-width="2.5"/>' +
      '<circle cx="16" cy="16" r="4" fill="#38bdf8"/>' +
      "</svg>"
  ).toString("base64");

let mainWindowRef = null;
let trayRef = null;
let isQuitting = false;

function createAppTray() {
  if (trayRef) return trayRef;
  try {
    const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
    const tray = new Tray(icon);
    tray.setToolTip("เดลลูน่า (DelLuna) — ทำงานเบื้องหลัง");

    const showMainWindow = () => {
      if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
      if (mainWindowRef.isMinimized()) mainWindowRef.restore();
      mainWindowRef.show();
      mainWindowRef.focus();
    };

    const contextMenu = Menu.buildFromTemplate([
      { label: "เปิดหน้าต่างเดลลูน่า", click: showMainWindow },
      { type: "separator" },
      {
        label: "ออกจากโปรแกรมทั้งหมด",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on("click", showMainWindow);
    tray.on("double-click", showMainWindow);
    trayRef = tray;
    return tray;
  } catch {
    return null;
  }
}

// เปิดได้ทีละหน้าต่างเดียว เปิดซ้ำให้ดึงหน้าต่างเดิมขึ้นมา
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() === "webview") guardGuestContents(contents);
  });

  app.whenReady().then(() => {
    configurePermissions();
    configureIpcHandlers();
    mainWindow = createWindow();
    mainWindowRef = mainWindow;
    const tray = createAppTray();

    const triggerHotkeyListen = () => {
      if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
      if (mainWindowRef.isMinimized()) mainWindowRef.restore();
      mainWindowRef.show();
      mainWindowRef.focus();
      mainWindowRef.webContents.send("javis:hotkey-listen");
    };

    try {
      globalShortcut.register("Alt+L", triggerHotkeyListen);
      globalShortcut.register("CommandOrControl+Shift+L", triggerHotkeyListen);
    } catch {
      // ข้ามได้หากระบบปฏิบัติการไม่รองรับหรือคีย์ถูกโปรแกรมอื่นจองไว้
    }

    mainWindow.on("close", (event) => {
      if (!isQuitting && tray) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
      mainWindowRef = null;
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        mainWindowRef = mainWindow;
      } else if (mainWindow) {
        mainWindow.show();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && isQuitting) app.quit();
  });
}
