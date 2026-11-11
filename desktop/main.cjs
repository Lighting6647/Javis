// แอปเดสก์ท็อปของ Javis: หน้าต่างของตัวเอง + เบราว์เซอร์ในตัวสำหรับเปิดเว็บและกรอกฟอร์มตามสั่ง
// ตัวแอปเป็นเพียงเปลือก หน้าจอและ AI ทั้งหมดมาจากเซิร์ฟเวอร์ Javis ที่ JAVIS_URL
// จึงไม่มี API key หรือความลับใดอยู่ในแอปนี้
const { app, BrowserWindow, session, shell } = require("electron");
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

function configurePermissions() {
  // ตัวแอป Javis ขอได้อย่างเดียวคือไมโครโฟน และต้องมาจากเซิร์ฟเวอร์ Javis เท่านั้น
  const appSession = session.defaultSession;
  const allowApp = (permission, origin) => permission === "media" && isAppUrl(origin);
  appSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowApp(permission, details.requestingUrl || contents.getURL()));
  });
  appSession.setPermissionCheckHandler((_contents, permission, origin) => allowApp(permission, origin));

  // หน้าเว็บภายนอกขอสิทธิ์ใดไม่ได้เลย (กล้อง ไมโครโฟน ตำแหน่ง การแจ้งเตือน ฯลฯ)
  const browserSession = session.fromPartition(BROWSER_PARTITION);
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
}

// เปิดได้ทีละหน้าต่างเดียว เปิดซ้ำให้ดึงหน้าต่างเดิมขึ้นมา
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() === "webview") guardGuestContents(contents);
  });

  app.whenReady().then(() => {
    configurePermissions();
    mainWindow = createWindow();
    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
