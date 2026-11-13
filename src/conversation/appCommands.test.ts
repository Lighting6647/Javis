import { describe, expect, it, vi } from "vitest";
import { createCommandRelay } from "./appCommands";

describe("createCommandRelay", () => {
  it("ยังไม่มีคำสั่งลงทะเบียน: ไม่รับอะไร ทุกข้อความจึงไปถาม AI ตามปกติ", () => {
    expect(createCommandRelay().handle("เริ่มโหมดประชุม")).toBe(false);
  });

  it("ข้อความตรงกับคำสั่งที่ลงทะเบียน: ทำคำสั่งนั้นหนึ่งครั้ง และบอกว่ารับไปทำแล้ว", () => {
    const relay = createCommandRelay();
    const run = vi.fn();
    relay.register({ matches: (text) => text === "เริ่มโหมดประชุม", run });

    expect(relay.handle("เริ่มโหมดประชุม")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ข้อความไม่ตรงกับคำสั่งใด: ไม่ทำอะไร", () => {
    const relay = createCommandRelay();
    const run = vi.fn();
    relay.register({ matches: (text) => text === "เริ่มโหมดประชุม", run });

    expect(relay.handle("พรุ่งนี้มีประชุมกี่โมง")).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("ถอนคำสั่งแล้ว: ไม่รับคำสั่งนั้นอีก", () => {
    const relay = createCommandRelay();
    const run = vi.fn();
    const unregister = relay.register({ matches: () => true, run });

    unregister();

    expect(relay.handle("เริ่มโหมดประชุม")).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("ข้อความตรงกับหลายคำสั่ง: ทำเฉพาะคำสั่งที่ลงทะเบียนก่อน", () => {
    const relay = createCommandRelay();
    const first = vi.fn();
    const second = vi.fn();
    relay.register({ matches: () => true, run: first });
    relay.register({ matches: () => true, run: second });

    expect(relay.handle("เริ่มโหมดประชุม")).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
