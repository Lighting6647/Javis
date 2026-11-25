import { afterEach, describe, expect, it, vi } from "vitest";
import { decidePcAction } from "./pcActions";

describe("decidePcAction", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown) => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("ส่งรหัส การตัดสินใจ และช่องทาง แล้วคืนผลพร้อมข้อความที่คำสั่งพิมพ์ออกมา", async () => {
    const fetchMock = respond(200, { ok: true, summary: "รันคำสั่งเสร็จแล้วค่ะ", output: "v26" });
    expect(await decidePcAction("a/b", "confirm", "button")).toEqual({ ok: true, summary: "รันคำสั่งเสร็จแล้วค่ะ", output: "v26" });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/pc/actions/a%2Fb");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ decision: "confirm", via: "button" });
  });

  it("เซิร์ฟเวอร์ปฏิเสธ: ไม่ถือว่าสำเร็จแม้เนื้อหาบอกว่าสำเร็จ และมีข้อความสำรอง", async () => {
    respond(403, { ok: true });
    expect(await decidePcAction("1", "confirm", "voice")).toEqual({ ok: false, summary: "ทำรายการนี้ไม่สำเร็จค่ะ" });
  });
});
