import { contactsStore } from "./contactsStore";
import { customAppsStore } from "./customAppsStore";
import { fetchWorkspacePreferences, saveWorkspacePreferences } from "./workspaceApi";

/**
 * ซิงก์สมุดรายชื่อ (Voice Contacts) และรายการโปรแกรมเฉพาะทาง (Custom Desktop Apps)
 * ระหว่างอุปกรณ์กับ Postgres (/api/workspace/preferences)
 * คืนฟังก์ชันหยุดซิงก์เมื่อออกจากระบบ
 */
export function startWorkspacePreferencesSync(): () => void {
  let disposed = false;
  let syncingRemote = false;
  let saveTimer: number | null = null;

  const pushLocalToServer = async () => {
    if (disposed || syncingRemote) return;
    try {
      await saveWorkspacePreferences({
        contacts: contactsStore.get(),
        customApps: customAppsStore.get()
      });
    } catch {
      // เครือข่ายไม่พร้อม: ข้อมูลยังอยู่ใน localStorage ของเครื่องและจะซิงก์รอบถัดไป
    }
  };

  const schedulePush = () => {
    if (disposed || syncingRemote) return;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void pushLocalToServer();
    }, 600);
  };

  const unsubContacts = contactsStore.subscribe(schedulePush);
  const unsubApps = customAppsStore.subscribe(schedulePush);

  void (async () => {
    try {
      const remote = await fetchWorkspacePreferences();
      if (disposed) return;

      syncingRemote = true;
      contactsStore.mergeFromServer(remote.contacts ?? []);
      customAppsStore.mergeFromServer(remote.customApps ?? []);
      syncingRemote = false;

      // ถ้าในเครื่องมีข้อมูลที่เซิร์ฟเวอร์ยังไม่มี ให้ส่งกลับขึ้น Postgres ทันที
      const localContacts = contactsStore.get();
      const localApps = customAppsStore.get();
      if (localContacts.length > (remote.contacts?.length ?? 0) || localApps.length > (remote.customApps?.length ?? 0)) {
        await pushLocalToServer();
      }
    } catch {
      syncingRemote = false;
    }
  })();

  return () => {
    disposed = true;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    unsubContacts();
    unsubApps();
  };
}
