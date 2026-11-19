import { describeDbError, getDatabase, type Database } from "../db.js";
import { exportJevState, importJevState } from "./queueAndTelemetry.js";

const STATE_KEY = "jev-router";

/**
 * เก็บคิวรออนุมัติและ telemetry ของ JEV router ลง Postgres เมื่อมี DATABASE_URL
 * บน Vercel แต่ละ instance เริ่มจากศูนย์และถูกรีเซ็ตเองเป็นระยะ จึงต้องโหลดจากฐานข้อมูลก่อนอ่าน/แก้ และบันทึกหลังแก้
 * ไม่มีฐานข้อมูลหรือฐานข้อมูลล่ม: router ทำงานในหน่วยความจำต่อตามเดิม ไม่ทำให้คำขอล้ม
 */
export function createRouterPersistence(getDb: () => Database | null = () => getDatabase()) {
  let loaded = false;
  let warned = false;
  const warn = (action: string, error: unknown) => {
    if (warned) return;
    warned = true;
    console.warn(`JEV router ${action}ฐานข้อมูลไม่สำเร็จ ใช้ข้อมูลในหน่วยความจำแทน`, describeDbError(error));
  };

  /** โหลดสถานะล่าสุดจากฐานข้อมูล (always = โหลดใหม่ทุกครั้ง ใช้ก่อนแสดงผลให้เห็นข้อมูลของทุก instance) */
  const load = async (always = false): Promise<void> => {
    const db = getDb();
    if (!db || (loaded && !always)) return;
    try {
      const rows = await db.query("SELECT data FROM app_state WHERE key = $1", [STATE_KEY]);
      if (rows[0]) importJevState(rows[0].data);
      loaded = true;
      warned = false;
    } catch (error) {
      warn("อ่าน", error);
    }
  };

  const save = async (): Promise<void> => {
    const db = getDb();
    if (!db) return;
    try {
      await db.query(
        `INSERT INTO app_state (key, data, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [STATE_KEY, JSON.stringify(exportJevState())]
      );
      warned = false;
    } catch (error) {
      warn("บันทึก", error);
    }
  };

  return { load, save, enabled: () => getDb() !== null };
}

export const routerPersistence = createRouterPersistence();
