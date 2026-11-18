import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSearchUsage, parseSearchUsage } from "./searchUsage";

describe("parseSearchUsage", () => {
  it("อ่านยอดของเดือนนี้และการใช้ผลค้นที่จำไว้", () => {
    expect(
      parseSearchUsage({
        search: {
          service: "tavily",
          month: { used: 123, limit: 1000, plan: "Researcher" },
          cache: { hits: 5, misses: 20, since: "2026-11-18T06:00:00.000Z" }
        }
      })
    ).toEqual({ service: "tavily", month: { used: 123, limit: 1000 }, cache: { hits: 5, misses: 20, since: "2026-11-18T06:00:00.000Z" } });
  });

  it("ค่าที่ขาดหรือผิดรูปแบบกลายเป็น null ทีละส่วน ไม่ทิ้งทั้งก้อน", () => {
    expect(parseSearchUsage({ search: { service: "tavily", month: null, cache: null } })).toEqual({ service: "tavily", month: null, cache: null });
    expect(parseSearchUsage({ search: { service: "tavily", month: { used: "many" }, cache: { hits: 1, misses: 2, since: "not a date" } } })).toEqual({
      service: "tavily",
      month: null,
      cache: null
    });
    expect(parseSearchUsage({ search: { service: "tavily", month: { used: 7, limit: 0 } } })?.month).toEqual({ used: 7, limit: null });
    expect(parseSearchUsage({ search: { service: "provider", month: null, cache: null } })?.service).toBe("provider");
  });

  it("รูปแบบที่ไม่รู้จัก (เช่น เซิร์ฟเวอร์รุ่นเก่า): คืน null", () => {
    for (const payload of [null, "x", {}, { search: null }, { search: { service: "bing" } }]) {
      expect(parseSearchUsage(payload)).toBeNull();
    }
  });
});

describe("fetchSearchUsage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ถามเซิร์ฟเวอร์ที่ /api/search/usage", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ search: { service: "tavily", month: { used: 3, limit: 1000 }, cache: null } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchSearchUsage()).toEqual({ service: "tavily", month: { used: 3, limit: 1000 }, cache: null });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/\/api\/search\/usage$/);
  });

  it("เซิร์ฟเวอร์ตอบผิดพลาดหรือติดต่อไม่ได้: คืน null แผงสถานะจึงแสดงต่อได้", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("{}", { status: 401 })));
    expect(await fetchSearchUsage()).toBeNull();

    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => Promise.reject(new TypeError("offline"))));
    expect(await fetchSearchUsage()).toBeNull();
  });
});
