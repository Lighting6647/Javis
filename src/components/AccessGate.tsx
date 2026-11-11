import { KeyRound, LogIn } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { AuthError } from "../services/authApi";

interface AccessGateProps {
  onSignIn: (code: string) => Promise<void>;
}

export function AccessGate({ onSignIn }: AccessGateProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  const errorId = useId();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (!value || busy) return;

    setBusy(true);
    setError("");
    try {
      // สำเร็จแล้วหน้านี้จะถูกแทนที่ด้วยหน้าสนทนา จึงไม่ต้องคืนสถานะปุ่ม
      await onSignIn(value);
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <div className="panel-icon"><KeyRound size={24} aria-hidden /></div>
      <h1>เข้าสู่ระบบเพื่อเริ่มใช้งาน</h1>
      <p>กรอกรหัสเข้าใช้งานที่ได้รับจากผู้ดูแลระบบ</p>

      <div className="field">
        <label htmlFor={inputId}>รหัสเข้าใช้งาน</label>
        <input
          id={inputId}
          type="password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && <p className="field-error" id={errorId} role="alert">{error}</p>}
      </div>

      <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>
        <LogIn size={18} aria-hidden />
        {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
