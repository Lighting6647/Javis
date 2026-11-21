import { createFlagStore } from "./flagStore";

const STORAGE_KEY = "javis.thinkHard";

/**
 * สถานะโหมด "คิดลึก" (Think Hard): สั่งให้ AI ใช้ reasoning ระดับสูงในการวิเคราะห์คำตอบ
 */
export const thinkHardStore = createFlagStore(STORAGE_KEY);
