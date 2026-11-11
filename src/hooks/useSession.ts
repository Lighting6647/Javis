import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { fetchSessionStatus, login } from "../services/authApi";
import { sessionStore } from "../services/sessionStore";

/**
 * checking: กำลังถามเซิร์ฟเวอร์ · unreachable: ติดต่อเซิร์ฟเวอร์ไม่ได้ · signed-out: ต้องเข้าสู่ระบบ
 * signed-in: เข้าสู่ระบบแล้ว · open: เซิร์ฟเวอร์ไม่บังคับเข้าสู่ระบบ
 */
export type SessionPhase = "checking" | "unreachable" | "signed-out" | "signed-in" | "open";

type CheckState = "checking" | "unreachable" | "done";

export function useSession() {
  const stored = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
  const [check, setCheck] = useState<CheckState>("checking");
  const [authRequired, setAuthRequired] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();

    fetchSessionStatus(abort.signal)
      .then((status) => {
        setAuthRequired(status.authRequired);
        // โทเค็นที่เก็บไว้หมดอายุหรือถูกเพิกถอนแล้ว
        if (status.authRequired && !status.authenticated) sessionStore.clear();
        setCheck("done");
      })
      .catch(() => {
        if (!abort.signal.aborted) setCheck("unreachable");
      });

    return () => abort.abort();
  }, [attempt]);

  const signIn = useCallback(async (code: string) => {
    sessionStore.set(await login(code));
  }, []);
  const retry = useCallback(() => {
    setCheck("checking");
    setAttempt((count) => count + 1);
  }, []);

  let phase: SessionPhase;
  if (check !== "done") phase = check;
  else if (!authRequired) phase = "open";
  else phase = stored ? "signed-in" : "signed-out";

  return {
    phase,
    userName: phase === "signed-in" ? (stored?.name ?? null) : null,
    signIn,
    signOut: sessionStore.clear,
    retry
  };
}
