import { useEffect, useRef } from "react";
import { localDateKey, shouldAutoBrief, buildSpokenBriefing } from "../conversation/spokenBriefing";
import { autoBriefingStore, briefingWeatherStore } from "../services/briefingStore";
import { fetchMorningBriefing } from "../services/workspaceApi";

/** วันที่ที่สรุปเช้าไปแล้วครั้งล่าสุด เก็บในเครื่อง */
const LAST_BRIEFING_KEY = "luna.briefingDate";
/** รอตำแหน่งของอุปกรณ์นานสุดเท่านี้ ไม่ได้ก็สรุปโดยไม่มีอากาศ */
const LOCATION_TIMEOUT_MS = 4000;
/** รอให้หน้าแอปพร้อมก่อนเริ่มพูด (หลังหน้าบูต) */
const START_DELAY_MS = 1500;

function readLastDate(): string | null {
  try {
    return localStorage.getItem(LAST_BRIEFING_KEY);
  } catch {
    return null;
  }
}

function saveLastDate(date: string): void {
  try {
    localStorage.setItem(LAST_BRIEFING_KEY, date);
  } catch {
    // เก็บไม่ได้: อย่างแย่ที่สุดคือสรุปซ้ำเมื่อเปิดแอปใหม่ในวันเดียวกัน
  }
}

/**
 * ตำแหน่งคร่าว ๆ สำหรับดูอากาศ ใช้เฉพาะเมื่อผู้ใช้อนุญาตตำแหน่งให้เว็บนี้ไว้แล้ว
 * ไม่ทำให้เบราว์เซอร์ถามสิทธิ์เองตอนเปิดแอป (ผู้ใช้เปิดสิทธิ์ได้จากหน้าตั้งค่า)
 */
async function currentCoordinates(): Promise<{ lat: number; lon: number } | null> {
  if (!briefingWeatherStore.get() || typeof navigator === "undefined" || !navigator.geolocation) return null;
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (status && status.state !== "granted") return null;
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => resolve(null),
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: 60 * 60_000, enableHighAccuracy: false }
    );
  });
}

/**
 * สรุปเช้าอัตโนมัติ: เปิดแอปครั้งแรกของวันก่อนเที่ยง ลูน่าพูดนัดวันนี้ เมลสำคัญ และอากาศ
 * ปิดได้ที่หน้าตั้งค่า ถ้าดึงข้อมูลไม่สำเร็จจะเงียบไว้และลองใหม่เมื่อเปิดแอปครั้งถัดไป
 * @param announce ให้ลูน่าพูดและเพิ่มข้อความลงบทสนทนา
 */
export function useMorningBriefing({ ready, announce }: { ready: boolean; announce: (text: string) => void }): void {
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    if (!shouldAutoBrief({ enabled: autoBriefingStore.get(), now: new Date(), lastDate: readLastDate() })) return;
    started.current = true;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const coords = await currentCoordinates();
        const data = await fetchMorningBriefing(coords ?? undefined).catch(() => null);
        if (cancelled || !data) return;
        const now = new Date();
        saveLastDate(localDateKey(now));
        announce(buildSpokenBriefing(data, now));
      })();
    }, START_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [announce, ready]);
}
