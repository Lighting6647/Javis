import { lazyWithPreload } from "./lazyWithPreload";

/*
 * ส่วนหน้าจอที่ไม่ได้ใช้ตอนเปิดแอป แยกเป็นไฟล์ของตัวเองให้หน้าแรกโหลดเร็วขึ้น
 * แล้วค่อยโหลดล่วงหน้าตอนเครื่องว่าง (preloadViews) ผู้ใช้จึงไม่ต้องรอตอนกดเปิดจริง
 */
export const MeetingPanel = lazyWithPreload(() => import("../MeetingPanel").then((module) => module.MeetingPanel), "MeetingPanel");
export const ProjectsPanel = lazyWithPreload(() => import("../ProjectsPanel").then((module) => module.ProjectsPanel), "ProjectsPanel");
export const RouterPanel = lazyWithPreload(() => import("../RouterPanel").then((module) => module.RouterPanel), "RouterPanel");
export const VoiceSettingsDialog = lazyWithPreload(
  () => import("../VoiceSettingsDialog").then((module) => module.VoiceSettingsDialog),
  "VoiceSettingsDialog"
);
export const VoiceRecorderDialog = lazyWithPreload(
  () => import("../VoiceRecorderDialog").then((module) => module.VoiceRecorderDialog),
  "VoiceRecorderDialog"
);
/** เบราว์เซอร์ในตัวของแอปเดสก์ท็อปเท่านั้น ผู้ใช้เว็บและมือถือไม่ต้องโหลดเลย */
export const BrowserView = lazyWithPreload(() => import("../BrowserView").then((module) => module.BrowserView), "BrowserView");
export const FrameView = lazyWithPreload(() => import("../FrameView").then((module) => module.FrameView), "FrameView");

/** โครงร่างระหว่างโหลดส่วนที่กินพื้นที่หลักของจอ (แผงการประชุม หน้าเว็บ) */
export function MainViewSkeleton({ label }: { label: string }) {
  return (
    <div className="panel" role="status" aria-label={`กำลังเปิด${label}`}>
      <div className="skeleton skeleton-line wide" />
      <div className="skeleton skeleton-row lazy-skeleton-row" />
      <div className="skeleton skeleton-line" />
    </div>
  );
}

interface PreloadOptions {
  desktop: boolean;
  meeting: boolean;
}

const whenIdle = (task: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 1500);
  return () => window.clearTimeout(id);
};

/**
 * โหลดส่วนที่ผู้ใช้น่าจะเปิดล่วงหน้าตอนเครื่องว่าง คืนฟังก์ชันยกเลิกถ้ายังไม่ได้เริ่ม
 * โหลดไม่สำเร็จตอนนี้ไม่เป็นไร จะลองใหม่ตอนผู้ใช้เปิดจริง
 */
export function preloadViews({ desktop, meeting }: PreloadOptions): () => void {
  return whenIdle(() => {
    const views = [VoiceSettingsDialog, VoiceRecorderDialog, ProjectsPanel, RouterPanel, desktop ? BrowserView : FrameView, ...(meeting ? [MeetingPanel] : [])];
    for (const view of views) void view.preload().catch(() => undefined);
  });
}
