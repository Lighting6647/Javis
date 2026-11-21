import { useEffect, useRef } from "react";
import type { AssistantIdentity, Phase } from "../conversation/types";
import { findDueCalendarReminders } from "../services/calendarReminder";
import { fetchUpcomingCalendarEvents } from "../services/workspaceApi";

const POLL_INTERVAL_MS = 60_000;
const SESSION_KEY = "javis.remindedCalendarIds";

function loadRemindedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((item): item is string => typeof item === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveRemindedIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    // ข้ามได้หาก sessionStorage ไม่พร้อมใช้งาน
  }
}

interface UseCalendarReminderOptions {
  enabled: boolean;
  phase: Phase;
  identity: AssistantIdentity;
  onReminder: (spokenText: string, title?: string) => void;
}

/**
 * ตรวจนัดหมาย Google Calendar อัตโนมัติทุก 1 นาทีเมื่อเปิดแอปค้างไว้
 * แจ้งเตือนด้วยเสียงล่วงหน้า 10 นาที และหยุดเงียบอัตโนมัติหากยังไม่ได้เชื่อมต่อ Google OAuth
 */
export function useCalendarReminder({ enabled, phase, identity, onReminder }: UseCalendarReminderOptions): void {
  const remindedRef = useRef<Set<string>>(loadRemindedIds());
  const stateRef = useRef({ phase, identity, onReminder });

  useEffect(() => {
    stateRef.current = { phase, identity, onReminder };
  }, [phase, identity, onReminder]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let calendarDisabled = false;

    const checkOnce = async () => {
      if (cancelled || calendarDisabled) return;
      const isDesktop = typeof window !== "undefined" && Boolean((window as unknown as { javisDesktop?: { isDesktop?: boolean } }).javisDesktop?.isDesktop);
      // บนแอป Desktop ย่อลง System Tray ได้ จึงยังคงเช็กนัดหมายเบื้องหลังต่อ
      if (!isDesktop && typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const { phase: currentPhase, identity: currentIdentity, onReminder: notify } = stateRef.current;
      if (currentPhase === "thinking" || currentPhase === "speaking") return;

      try {
        const res = await fetchUpcomingCalendarEvents(1);
        if (cancelled) return;
        if (res.configured === false) {
          calendarDisabled = true;
          return;
        }
        if (!res.ok || res.events.length === 0) return;

        const due = findDueCalendarReminders(res.events, Date.now(), remindedRef.current, currentIdentity);
        for (const item of due) {
          remindedRef.current.add(item.eventId);
          saveRemindedIds(remindedRef.current);
          notify(item.spokenText, item.title);
        }
      } catch {
        // เครือข่ายสะดุดชั่วคราว: รอรอบถัดไปโดยไม่รบกวนผู้ใช้
      }
    };

    const initialTimer = window.setTimeout(() => void checkOnce(), 5_000);
    const interval = window.setInterval(() => void checkOnce(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [enabled]);
}
