import { RefreshCw, RotateCw, X } from "lucide-react";
import { Component, type ReactNode, Suspense } from "react";

interface LazyBoundaryProps {
  /** ชื่อส่วนที่แยกโหลด ใช้ในข้อความแจ้ง เช่น "หน้าตั้งค่า" */
  label: string;
  /** โหลดไฟล์ของส่วนนี้ใหม่ ก่อนลองแสดงอีกครั้ง */
  retry: () => Promise<void>;
  /** สิ่งที่แสดงระหว่างโหลด ค่าเริ่มต้นเป็นป้ายบอกสถานะมุมล่าง */
  fallback?: ReactNode;
  /** ปิดส่วนนี้ไปเลยเมื่อโหลดไม่สำเร็จ ถ้าไม่ให้มา ผู้ใช้เลือกได้แค่ลองอีกครั้งหรือโหลดหน้าใหม่ */
  onDismiss?: () => void;
  children: ReactNode;
}

interface LazyBoundaryState {
  failed: boolean;
  retrying: boolean;
}

/**
 * ครอบส่วนที่แยกไฟล์โหลด: ระหว่างโหลดแสดง fallback และถ้าโหลดหรือแสดงไม่สำเร็จ
 * (เน็ตหลุด หรือเว็บเพิ่ง deploy รุ่นใหม่จนไฟล์รุ่นเดิมหายไป) แสดงข้อความพร้อมทางแก้แทนหน้าว่างทั้งแอป
 */
export class LazyBoundary extends Component<LazyBoundaryProps, LazyBoundaryState> {
  state: LazyBoundaryState = { failed: false, retrying: false };
  /** ปุ่มที่ผู้ใช้กดเปิดส่วนนี้ ปุ่มในข้อความแจ้งหายไปหลังลองสำเร็จหรือปิด โฟกัสจึงต้องกลับไปที่นี่ */
  private returnFocus: HTMLElement | null = null;

  static getDerivedStateFromError(): Partial<LazyBoundaryState> {
    return { failed: true, retrying: false };
  }

  componentDidCatch(error: unknown) {
    console.warn(`แสดง${this.props.label}ไม่สำเร็จ`, error instanceof Error ? error.message : error);
    this.returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }

  private restoreFocus() {
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  }

  private retry = () => {
    this.setState({ retrying: true });
    this.props.retry().then(
      () => {
        // คืนโฟกัสก่อนแสดงส่วนนั้น <dialog> จะได้จำปุ่มเดิมไว้คืนโฟกัสตอนปิด
        this.restoreFocus();
        this.setState({ failed: false, retrying: false });
      },
      () => this.setState({ retrying: false })
    );
  };

  private dismiss = () => {
    this.restoreFocus();
    this.setState({ failed: false, retrying: false });
    this.props.onDismiss?.();
  };

  render() {
    const { label, fallback, onDismiss, children } = this.props;
    const { failed, retrying } = this.state;

    if (!failed) {
      return (
        <Suspense
          fallback={
            fallback ?? (
              <div className="toast info lazy-note" role="status">
                กำลังเปิด{label}…
              </div>
            )
          }
        >
          {children}
        </Suspense>
      );
    }

    return (
      <div className="toast error lazy-note" role="alert">
        <p>เปิด{label}ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง ถ้ายังไม่ได้ให้โหลดหน้าใหม่</p>
        <div className="lazy-note-actions">
          <button type="button" className="btn btn-primary" onClick={this.retry} disabled={retrying}>
            <RotateCw size={15} aria-hidden />
            {retrying ? "กำลังลอง…" : "ลองอีกครั้ง"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
            <RefreshCw size={15} aria-hidden />
            โหลดหน้าใหม่
          </button>
          {onDismiss && (
            <button type="button" className="btn btn-secondary" onClick={this.dismiss}>
              <X size={15} aria-hidden />
              ปิด
            </button>
          )}
        </div>
      </div>
    );
  }
}
