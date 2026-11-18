import { describe, expect, it } from "vitest";
import { createSearchUsageReader, searchServiceOf, USAGE_REFRESH_AFTER_SEARCH_MS, USAGE_REFRESH_MS } from "./searchUsage.js";
import { createSearchCache, searchWeb, type WebSearchProvider } from "./webSearch.js";

// ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริง
const TAVILY: WebSearchProvider = { name: "tavily", label: "Tavily", apiKey: "tvly-test-only-not-a-real-key", baseUrl: "https://tavily.invalid" };
const GEMINI = { apiStyle: "chat" as const, webSearch: true };

describe("searchServiceOf", () => {
  it("บอกวิธีค้นเว็บตามการตั้งค่า: Tavily เฉพาะกับ Gemini ที่ตั้งกุญแจไว้ ที่เหลือใช้ของผู้ให้บริการ AI หรือไม่ค้น", () => {
    expect(searchServiceOf(GEMINI, TAVILY)).toBe("tavily");
    expect(searchServiceOf(GEMINI, null)).toBe("provider");
    expect(searchServiceOf({ apiStyle: "responses", webSearch: true }, TAVILY)).toBe("provider");
    expect(searchServiceOf({ apiStyle: "claude", webSearch: true }, TAVILY)).toBe("provider");
    expect(searchServiceOf({ apiStyle: "chat", webSearch: false }, TAVILY)).toBe("off");
  });
});

describe("createSearchUsageReader", () => {
  /** Tavily จำลอง: นับว่าถูกถามยอดกี่ครั้ง */
  function fakeUsage(respond: () => Response) {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return respond();
    };
    return { fetchImpl, calls: () => calls };
  }
  const usage = (planUsage: number) => () => new Response(JSON.stringify({ account: { current_plan: "Researcher", plan_usage: planUsage, plan_limit: 1000 } }), { status: 200 });

  it("ใช้ Tavily: ได้ยอดของเดือนนี้ และการใช้ผลค้นที่จำไว้พร้อมเวลาที่เริ่มนับ", async () => {
    const cache = createSearchCache({ now: () => Date.UTC(2026, 10, 18, 6, 0, 0) });
    const tavily = fakeUsage(usage(123));
    const search = (query: string) =>
      searchWeb(TAVILY, query, {
        cache,
        fetchImpl: async () => new Response(JSON.stringify({ results: [{ title: "ราคาทอง", url: "https://gold.example/", content: "ขายออก 61,100 บาท" }] }), { status: 200 })
      });
    await search("ราคาทองวันนี้");
    await search("ราคาทองวันนี้");

    const read = createSearchUsageReader({ ai: GEMINI, external: TAVILY, cache, fetchImpl: tavily.fetchImpl });
    expect(await read()).toEqual({
      service: "tavily",
      month: { used: 123, limit: 1000, plan: "Researcher" },
      cache: { hits: 1, misses: 1, since: "2026-11-18T06:00:00.000Z" }
    });
  });

  it("ถามยอดจาก Tavily ไม่บ่อยกว่าทุก 5 นาที แม้ผู้ใช้หลายคนเปิดแผงพร้อมกัน", async () => {
    let time = 0;
    let planUsage = 10;
    const tavily = fakeUsage(() => usage(planUsage)());
    const read = createSearchUsageReader({ ai: GEMINI, external: TAVILY, cache: createSearchCache(), fetchImpl: tavily.fetchImpl, now: () => time });

    await Promise.all([read(), read(), read()]);
    expect(tavily.calls()).toBe(1);

    planUsage = 11;
    time += USAGE_REFRESH_MS - 1;
    expect((await read()).month?.used).toBe(10);
    expect(tavily.calls()).toBe(1);

    time += 1;
    expect((await read()).month?.used).toBe(11);
    expect(tavily.calls()).toBe(2);
  });

  it("เซิร์ฟเวอร์ตัวนี้ค้นใหม่หลังถามยอดครั้งก่อน: ตัวเลขขยับทันที แล้วถามยอดจริงใหม่เมื่อผ่านไป 15 วินาที", async () => {
    let time = 0;
    let planUsage = 0;
    const cache = createSearchCache({ now: () => time });
    const tavily = fakeUsage(() => usage(planUsage)());
    const read = createSearchUsageReader({ ai: GEMINI, external: TAVILY, cache, fetchImpl: tavily.fetchImpl, now: () => time });

    expect((await read()).month?.used).toBe(0);
    // ผู้ใช้ถามคำถามที่ต้องค้น: ไม่มีผลที่จำไว้ จึงค้นใหม่และใช้หนึ่งเครดิต (ที่ Tavily ใช้ไปสองเครดิตเพราะผู้ใช้อีกคน)
    expect(cache.get("ราคาทองวันนี้", "day")).toBeNull();
    planUsage = 2;

    // ยังไม่ถาม Tavily: ประมาณจากการค้นของเซิร์ฟเวอร์ตัวนี้
    time += USAGE_REFRESH_AFTER_SEARCH_MS - 1;
    expect((await read()).month?.used).toBe(1);
    expect(tavily.calls()).toBe(1);
    // ครบเวลา: ถามยอดจริง
    time += 1;
    expect((await read()).month?.used).toBe(2);
    expect(tavily.calls()).toBe(2);

    // ไม่มีการค้นใหม่อีก: กลับไปถามทุก 5 นาทีตามเดิม
    time += USAGE_REFRESH_AFTER_SEARCH_MS;
    await read();
    expect(tavily.calls()).toBe(2);
  });

  it("ถาม Tavily ไม่สำเร็จ: แสดงยอดล่าสุดที่เคยได้ ถ้าไม่เคยได้เลยคือ null และลองถามใหม่ครั้งถัดไป", async () => {
    let time = 0;
    let failing = true;
    const tavily = fakeUsage(() => (failing ? new Response("{}", { status: 500 }) : usage(42)()));
    const read = createSearchUsageReader({ ai: GEMINI, external: TAVILY, cache: createSearchCache(), fetchImpl: tavily.fetchImpl, now: () => time });

    expect((await read()).month).toBeNull();
    failing = false;
    expect((await read()).month?.used).toBe(42);

    failing = true;
    time += USAGE_REFRESH_MS;
    expect((await read()).month?.used).toBe(42);
    expect(tavily.calls()).toBe(3);
  });

  it("ไม่ได้ใช้ Tavily: ไม่ถามยอด และไม่มีตัวเลขของความจำผลค้น", async () => {
    const tavily = fakeUsage(usage(1));
    for (const ai of [{ apiStyle: "responses" as const, webSearch: true }, { apiStyle: "chat" as const, webSearch: false }]) {
      const read = createSearchUsageReader({ ai, external: TAVILY, cache: createSearchCache(), fetchImpl: tavily.fetchImpl });
      expect((await read()).cache).toBeNull();
      expect((await read()).month).toBeNull();
    }
    expect(tavily.calls()).toBe(0);
  });
});
