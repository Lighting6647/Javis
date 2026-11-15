import { type ComponentType, lazy, useState } from "react";

export type PreloadableComponent<P extends object> = ComponentType<P> & {
  /** โหลดไฟล์ของส่วนนี้ (ล่วงหน้าหรือลองใหม่) เรียกซ้ำได้ ถ้าครั้งก่อนล้มเหลวจะโหลดใหม่ */
  preload: () => Promise<void>;
};

/**
 * React.lazy ที่สั่งโหลดล่วงหน้าได้
 * - โหลดเสร็จก่อนถูกแสดง: แสดงได้ทันทีโดยไม่ผ่าน Suspense จึงไม่มีโครงร่างกะพริบ
 * - โหลดไม่สำเร็จระหว่างแสดง: ข้อผิดพลาดส่งถึง LazyBoundary ตัวโหลดเดิมจำความล้มเหลวไว้
 *   จนกว่าจะมีคนเรียก preload (ปุ่มลองอีกครั้ง) จึงไม่วนโหลดใหม่เองไม่รู้จบ
 *   เพราะคอมโพเนนต์ที่ค้างตั้งแต่แสดงครั้งแรก React สร้างใหม่ทุกรอบ สถานะใน useState ไม่ถูกเก็บไว้
 */
export function lazyWithPreload<P extends object>(
  load: () => Promise<ComponentType<P>>,
  displayName: string
): PreloadableComponent<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  let deferredFailed = false;

  const fetchComponent = (): Promise<ComponentType<P>> => {
    pending ??= load().then(
      (component) => {
        loaded = component;
        return component;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      }
    );
    return pending;
  };

  const createDeferred = () =>
    lazy(() =>
      fetchComponent().then(
        (component) => ({ default: component }),
        (error: unknown) => {
          deferredFailed = true;
          throw error;
        }
      )
    );
  let Deferred = createDeferred();

  function Preloadable(props: P) {
    // เลือกครั้งเดียวต่อการแสดงหนึ่งครั้ง ถ้าสลับชนิดคอมโพเนนต์กลางทาง React จะสร้างใหม่และสถานะภายในหาย
    const [View] = useState<ComponentType<P>>(() => loaded ?? Deferred);
    return <View {...props} />;
  }
  Preloadable.displayName = displayName;

  const preload = () => {
    // ตัวโหลดที่ล้มเหลวไปแล้วใช้ซ้ำไม่ได้ (React.lazy จำความล้มเหลวไว้) การแสดงครั้งถัดไปจึงได้ตัวใหม่
    if (deferredFailed) {
      deferredFailed = false;
      Deferred = createDeferred();
    }
    return fetchComponent().then(() => undefined);
  };

  return Object.assign(Preloadable, { preload });
}
