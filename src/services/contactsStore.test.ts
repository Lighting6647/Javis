import { describe, expect, it } from "vitest";
import { contactsStore, resolveContactFromList } from "./contactsStore";

describe("contactsStore", () => {
  it("validates, stores, resolves by alias, and removes contacts", () => {
    contactsStore.resetForTests();

    const bad = contactsStore.add({ name: "ทดสอบ", phone: "abc" });
    expect(bad.ok).toBe(false);

    const added = contactsStore.add({
      name: "คุณแม่",
      aliases: "แม่, หม่าม้า",
      phone: "081-234-5678",
      email: "mom@example.com"
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(contactsStore.resolve("แม่")?.id).toBe(added.contact.id);
    expect(resolveContactFromList("หม่าม้า", contactsStore.get())?.phone).toBe("0812345678");

    contactsStore.remove(added.contact.id);
    expect(contactsStore.get()).toHaveLength(0);
  });
});
