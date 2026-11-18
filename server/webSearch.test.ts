import { describe, expect, it } from "vitest";
import { createSearchCache, fetchSearchUsage, resolveWebSearchProvider, SEARCH_CACHE_TTL_MS, searchWeb, type WebSearchProvider } from "./webSearch.js";

// ค่าทดสอบเท่านั้น ไม่ใช่กุญแจจริงของบริการใด
const TAVILY_KEY = "tvly-test-only-not-a-real-key";
const quiet = () => undefined;

describe("resolveWebSearchProvider", () => {
  it("ไม่ได้ตั้งกุญแจ: ไม่มีบริการค้นเว็บภายนอก", () => {
    expect(resolveWebSearchProvider({}, quiet)).toBeNull();
    expect(resolveWebSearchProvider({ TAVILY_API_KEY: "   " }, quiet)).toBeNull();
  });

  it("ตั้งกุญแจของ Tavily: ใช้ Tavily ที่ที่อยู่ทางการ", () => {
    expect(resolveWebSearchProvider({ TAVILY_API_KEY: ` ${TAVILY_KEY} ` }, quiet)).toEqual({
      name: "tavily",
      label: "Tavily",
      apiKey: TAVILY_KEY,
      baseUrl: "https://api.tavily.com"
    });
  });

  it("เปลี่ยนที่อยู่ได้ ส่วนที่อยู่ที่ไม่ถูกต้องถูกแทนด้วยค่าเริ่มต้น พร้อมคำเตือนที่ไม่แสดงกุญแจ", () => {
    expect(resolveWebSearchProvider({ TAVILY_API_KEY: TAVILY_KEY, TAVILY_BASE_URL: "http://127.0.0.1:8796/" }, quiet)?.baseUrl).toBe("http://127.0.0.1:8796");

    const warnings: string[] = [];
    const provider = resolveWebSearchProvider({ TAVILY_API_KEY: TAVILY_KEY, TAVILY_BASE_URL: "ftp://example.com" }, (message) => warnings.push(message));
    expect(provider?.baseUrl).toBe("https://api.tavily.com");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("TAVILY_BASE_URL");
    expect(warnings[0]).not.toContain(TAVILY_KEY);
  });
});

describe("searchWeb", () => {
  const provider: WebSearchProvider = { name: "tavily", label: "Tavily", apiKey: TAVILY_KEY, baseUrl: "https://tavily.invalid" };

  interface SentRequest {
    url: string;
    method: string | undefined;
    headers: Headers;
    body: unknown;
  }

  /** ต้นทางจำลองของ Tavily: จดคำขอที่ได้รับ แล้วตอบตามที่กำหนด */
  function fakeTavily(respond: () => Response | Promise<Response>) {
    const sent: SentRequest[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      sent.push({
        url: String(input),
        method: init?.method,
        headers: new Headers(init?.headers),
        body: JSON.parse(typeof init?.body === "string" ? init.body : "null") as unknown
      });
      return respond();
    };
    return { sent, fetchImpl };
  }

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const BASE_BODY = { search_depth: "basic", topic: "general", max_results: 5, include_answer: false, include_published_date: true };
  const GOLD_PAGE = { title: "ราคาทองคำวันนี้", url: "https://www.goldtraders.or.th/", content: "ทองคำแท่ง ขายออก 62,350 บาท", published_date: "2026-11-18" };

  it("ส่งคำค้นไปยัง Tavily ด้วยกุญแจในหัวคำขอ ขอการค้นแบบพื้นฐานที่ใช้เครดิตเดียว และขอวันที่เผยแพร่ของแต่ละหน้า", async () => {
    const upstream = fakeTavily(() => json({ query: "ราคาทองคำวันนี้", results: [] }));
    await searchWeb(provider, "ราคาทองคำวันนี้", { fetchImpl: upstream.fetchImpl });

    expect(upstream.sent).toHaveLength(1);
    const [request] = upstream.sent;
    expect(request?.url).toBe("https://tavily.invalid/search");
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("authorization")).toBe(`Bearer ${TAVILY_KEY}`);
    expect(request?.headers.get("content-type")).toBe("application/json");
    // ไม่ได้ขอช่วงเวลา: ไม่จำกัด เพราะข้อเท็จจริงที่ไม่ขึ้นกับเวลาต้องหาเจอแม้หน้าจะเก่า
    expect(request?.body).toEqual({ query: "ราคาทองคำวันนี้", ...BASE_BODY });
  });

  describe("จำผลค้นไว้ชั่วคราว", () => {
    /** นาฬิกาที่เลื่อนเองได้ */
    function clock() {
      let time = 1_000_000;
      return { now: () => time, advance: (ms: number) => void (time += ms) };
    }

    it("ถามคำค้นเดิมซ้ำภายใน 10 นาที: ใช้ผลที่จำไว้ ไม่ค้นใหม่ และบอกว่าผลมาจากที่จำไว้", async () => {
      const time = clock();
      const cache = createSearchCache({ now: time.now });
      const upstream = fakeTavily(() => json({ results: [GOLD_PAGE] }));

      const first = await searchWeb(provider, "ราคาทองคำวันนี้", { recency: "day", cache, fetchImpl: upstream.fetchImpl });
      time.advance(SEARCH_CACHE_TTL_MS - 1);
      const second = await searchWeb(provider, "ราคาทองคำวันนี้", { recency: "day", cache, fetchImpl: upstream.fetchImpl });

      expect(upstream.sent).toHaveLength(1);
      expect(first).not.toHaveProperty("cached");
      expect(second).toEqual({ ...first, cached: true });
    });

    it("ครบ 10 นาที: ค้นใหม่ แล้วจำผลชุดใหม่แทน", async () => {
      const time = clock();
      const cache = createSearchCache({ now: time.now });
      const upstream = fakeTavily(() => json({ results: [GOLD_PAGE] }));

      await searchWeb(provider, "ราคาทองคำวันนี้", { cache, fetchImpl: upstream.fetchImpl });
      time.advance(SEARCH_CACHE_TTL_MS);
      await searchWeb(provider, "ราคาทองคำวันนี้", { cache, fetchImpl: upstream.fetchImpl });
      await searchWeb(provider, "ราคาทองคำวันนี้", { cache, fetchImpl: upstream.fetchImpl });

      expect(upstream.sent).toHaveLength(2);
    });

    it("คำค้นที่ต่างแค่ตัวพิมพ์หรือช่องว่างคือคำค้นเดียวกัน ส่วนช่วงเวลาที่ต่างกันแยกกันจำ", async () => {
      const cache = createSearchCache();
      const upstream = fakeTavily(() => json({ results: [GOLD_PAGE] }));
      const search = (query: string, recency: "day" | "week" | null) => searchWeb(provider, query, { recency, cache, fetchImpl: upstream.fetchImpl });

      await search("Gold price  today", "day");
      await search("  gold PRICE today ", "day");
      expect(upstream.sent).toHaveLength(1);

      await search("gold price today", "week");
      await search("gold price today", null);
      expect(upstream.sent).toHaveLength(3);
    });

    it("ไม่จำผลที่ว่างหรือค้นไม่สำเร็จ: คำถามถัดไปได้ค้นใหม่", async () => {
      const cache = createSearchCache();
      const empty = fakeTavily(() => json({ results: [] }));
      await searchWeb(provider, "เรื่องที่ไม่มีใครเขียน", { cache, fetchImpl: empty.fetchImpl });
      await searchWeb(provider, "เรื่องที่ไม่มีใครเขียน", { cache, fetchImpl: empty.fetchImpl });
      expect(empty.sent).toHaveLength(2);

      const failing = fakeTavily(() => json({ detail: { error: "Internal Server Error" } }, 500));
      await searchWeb(provider, "ราคาทองคำวันนี้", { cache, fetchImpl: failing.fetchImpl });
      await searchWeb(provider, "ราคาทองคำวันนี้", { cache, fetchImpl: failing.fetchImpl });
      expect(failing.sent).toHaveLength(2);
      expect(cache.size).toBe(0);
    });

    it("จำผลที่ได้จากการค้นซ้ำแบบไม่จำกัด พร้อมบอกว่าผลชุดนั้นอาจเก่าเหมือนเดิม", async () => {
      const cache = createSearchCache();
      const upstream = fakeTavily(() => json({ results: upstream.sent.length === 1 ? [] : [GOLD_PAGE] }));

      await searchWeb(provider, "ราคาทองคำวันนี้", { recency: "day", cache, fetchImpl: upstream.fetchImpl });
      const again = await searchWeb(provider, "ราคาทองคำวันนี้", { recency: "day", cache, fetchImpl: upstream.fetchImpl });

      expect(upstream.sent).toHaveLength(2);
      expect(again).toMatchObject({ ok: true, cached: true, widenedFrom: "day" });
    });

    it("นับว่าใช้ผลที่จำไว้กี่ครั้ง และต้องค้นใหม่กี่ครั้ง ตั้งแต่เริ่มทำงาน", async () => {
      const time = clock();
      const cache = createSearchCache({ now: time.now });
      const upstream = fakeTavily(() => json({ results: [GOLD_PAGE] }));
      const search = (query: string) => searchWeb(provider, query, { cache, fetchImpl: upstream.fetchImpl });

      expect(cache.stats()).toEqual({ hits: 0, misses: 0, since: 1_000_000 });
      await search("ราคาทองคำวันนี้");
      await search("ราคาทองคำวันนี้");
      await search("ราคาทองคำวันนี้");
      await search("ข่าววันนี้");
      expect(cache.stats()).toEqual({ hits: 2, misses: 2, since: 1_000_000 });
      // ค่าที่คืนเป็นสำเนา แก้แล้วไม่กระทบตัวนับ
      cache.stats().hits = 99;
      expect(cache.stats().hits).toBe(2);
    });

    it("จำได้ไม่เกินจำนวนที่กำหนด เมื่อเต็มจะลบรายการที่จำไว้นานที่สุดออกก่อน", async () => {
      const cache = createSearchCache({ maxEntries: 2 });
      const upstream = fakeTavily(() => json({ results: [GOLD_PAGE] }));
      const search = (query: string) => searchWeb(provider, query, { cache, fetchImpl: upstream.fetchImpl });

      await search("หนึ่ง");
      await search("สอง");
      await search("สาม");
      expect(cache.size).toBe(2);
      expect(upstream.sent).toHaveLength(3);

      // "สอง" กับ "สาม" ยังจำอยู่ ส่วน "หนึ่ง" ถูกลบไปแล้ว
      await search("สาม");
      await search("สอง");
      expect(upstream.sent).toHaveLength(3);
      await search("หนึ่ง");
      expect(upstream.sent).toHaveLength(4);
    });
  });

  describe("ช่วงเวลาของข้อมูล", () => {
    it("ขอช่วงเวลา: จำกัดผลค้นเฉพาะหน้าที่เผยแพร่ในช่วงนั้น และบอกว่าผลชุดนี้จำกัดช่วงไว้", async () => {
      const upstream = fakeTavily(() => json({ results: [GOLD_PAGE] }));
      const outcome = await searchWeb(provider, "ราคาทองคำแท่ง 18 พฤศจิกายน 2569", { recency: "day", fetchImpl: upstream.fetchImpl });

      expect(upstream.sent.map((request) => request.body)).toEqual([{ query: "ราคาทองคำแท่ง 18 พฤศจิกายน 2569", ...BASE_BODY, time_range: "day" }]);
      expect(outcome).toEqual({
        ok: true,
        recency: "day",
        results: [{ title: "ราคาทองคำวันนี้", url: "https://www.goldtraders.or.th/", content: "ทองคำแท่ง ขายออก 62,350 บาท", publishedDate: "2026-11-18" }]
      });
    });

    it("จำกัดช่วงแล้วไม่พบอะไร: ค้นซ้ำหนึ่งครั้งแบบไม่จำกัด และบอกว่าผลชุดนี้อาจเป็นข้อมูลเก่า", async () => {
      // หน้าที่อัปเดตทุกวันแต่เก็บวันที่เผยแพร่ครั้งแรกไว้ หลุดจากการกรองตามช่วงเวลา
      const upstream = fakeTavily(() => json({ results: upstream.sent.length === 1 ? [] : [GOLD_PAGE] }));
      const outcome = await searchWeb(provider, "ราคาทองคำวันนี้", { recency: "week", fetchImpl: upstream.fetchImpl });

      expect(upstream.sent.map((request) => request.body)).toEqual([
        { query: "ราคาทองคำวันนี้", ...BASE_BODY, time_range: "week" },
        { query: "ราคาทองคำวันนี้", ...BASE_BODY }
      ]);
      expect(outcome).toMatchObject({ ok: true, widenedFrom: "week", results: [{ url: "https://www.goldtraders.or.th/" }] });
      expect(outcome).not.toHaveProperty("recency");
    });

    it("ค้นซ้ำแบบไม่จำกัดแล้วยังไม่พบ: คืนผลว่าง ไม่ค้นต่ออีก", async () => {
      const upstream = fakeTavily(() => json({ results: [] }));
      const outcome = await searchWeb(provider, "เรื่องที่ไม่มีใครเขียน", { recency: "month", fetchImpl: upstream.fetchImpl });

      expect(upstream.sent).toHaveLength(2);
      expect(outcome).toEqual({ ok: true, results: [], widenedFrom: "month" });
    });

    it("ไม่จำกัดช่วงแล้วไม่พบ หรือจำกัดช่วงแล้วค้นไม่สำเร็จ: ไม่ค้นซ้ำ เพื่อไม่ใช้เครดิตเกินจำเป็น", async () => {
      const empty = fakeTavily(() => json({ results: [] }));
      await searchWeb(provider, "เรื่องทั่วไป", { recency: null, fetchImpl: empty.fetchImpl });
      expect(empty.sent).toHaveLength(1);

      const exhausted = fakeTavily(() => json({ detail: { error: "This request exceeds your plan's set usage limit." } }, 432));
      const outcome = await searchWeb(provider, "ราคาทองคำวันนี้", { recency: "day", fetchImpl: exhausted.fetchImpl });
      expect(exhausted.sent).toHaveLength(1);
      expect(outcome).toMatchObject({ ok: false, status: 432, reason: "quota" });
    });

    it("ค้นซ้ำแบบไม่จำกัดแล้วค้นไม่สำเร็จ: รายงานความล้มเหลวนั้น เพื่อให้ระบบพักหรือปิดการค้นได้ถูกต้อง", async () => {
      const upstream = fakeTavily(() =>
        upstream.sent.length === 1 ? json({ results: [] }) : json({ detail: { error: "This request exceeds your plan's set usage limit." } }, 432)
      );
      const outcome = await searchWeb(provider, "ราคาทองคำวันนี้", { recency: "day", fetchImpl: upstream.fetchImpl });

      expect(upstream.sent).toHaveLength(2);
      expect(outcome).toMatchObject({ ok: false, status: 432, reason: "quota" });
    });
  });

  it("คืนผลค้นที่ใช้ต่อได้: ชื่อ ลิงก์ เนื้อหาย่อ และวันที่เผยแพร่ถ้ามี", async () => {
    const upstream = fakeTavily(() =>
      json({
        query: "ราคาทองคำวันนี้",
        response_time: 1.2,
        results: [
          {
            title: "ราคาทองคำวันนี้ | สมาคมค้าทองคำ",
            url: "https://www.goldtraders.or.th/",
            content: "ทองคำแท่ง  ขายออก 62,350 บาท\nรับซื้อ 62,250 บาท",
            score: 0.93,
            published_date: "2026-11-12"
          }
        ]
      })
    );

    expect(await searchWeb(provider, "ราคาทองคำวันนี้", { fetchImpl: upstream.fetchImpl })).toEqual({
      ok: true,
      results: [
        {
          title: "ราคาทองคำวันนี้ | สมาคมค้าทองคำ",
          url: "https://www.goldtraders.or.th/",
          content: "ทองคำแท่ง ขายออก 62,350 บาท รับซื้อ 62,250 บาท",
          publishedDate: "2026-11-12"
        }
      ]
    });
  });

  it("ทิ้งรายการที่ลิงก์ไม่ปลอดภัย ซ้ำกัน หรือไม่มีเนื้อหา ตัดข้อความที่ยาวเกิน และจำกัดไม่เกินห้ารายการ", async () => {
    const page = (path: string, extra: Record<string, unknown> = {}) => ({ title: `หน้า ${path}`, url: `https://example.com/${path}`, content: `เนื้อหาของ ${path}`, ...extra });
    const upstream = fakeTavily(() =>
      json({
        results: [
          page("1"),
          { title: "ลิงก์สคริปต์", url: "javascript:alert(1)", content: "อันตราย" },
          { title: "ลิงก์มีรหัสผ่าน", url: "https://user:secret@example.com/", content: "อันตราย" },
          page("1", { content: "รายการซ้ำ" }),
          page("ว่าง", { content: "   " }),
          page("2", { title: "", content: "ก".repeat(2000) }),
          "ไม่ใช่วัตถุ",
          page("3"),
          page("4"),
          page("5"),
          page("6")
        ]
      })
    );

    const outcome = await searchWeb(provider, "ทดสอบ", { fetchImpl: upstream.fetchImpl });
    if (!outcome.ok) throw new Error("expected results");

    expect(outcome.results.map((result) => result.url)).toEqual([
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
      "https://example.com/5"
    ]);
    // ไม่มีชื่อหน้า: ใช้ชื่อเว็บแทน และเนื้อหายาวถูกตัดให้พอส่งต่อให้ AI
    expect(outcome.results[1]).toEqual({ title: "example.com", url: "https://example.com/2", content: "ก".repeat(700) });
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "busy"],
    [432, "quota"],
    [433, "quota"],
    [500, "unknown"]
  ] as const)("Tavily ตอบ %i: จัดเป็นสาเหตุ %s พร้อมข้อความของต้นทางสำหรับ log", async (status, reason) => {
    const upstream = fakeTavily(() => json({ detail: { error: "This request exceeds your plan's set usage limit." } }, status));

    expect(await searchWeb(provider, "ทดสอบ", { fetchImpl: upstream.fetchImpl })).toEqual({
      ok: false,
      status,
      reason,
      logDetail: "This request exceeds your plan's set usage limit."
    });
  });

  it("ข้อความสำหรับ log ไม่มีกุญแจ แม้ต้นทางจะส่งกุญแจกลับมาในข้อความ", async () => {
    const upstream = fakeTavily(() => json({ detail: { error: `Unauthorized: invalid API key ${TAVILY_KEY}.` } }, 401));
    const outcome = await searchWeb(provider, "ทดสอบ", { fetchImpl: upstream.fetchImpl });

    expect(outcome).toMatchObject({ ok: false, reason: "auth" });
    expect(JSON.stringify(outcome)).not.toContain(TAVILY_KEY);
    expect(JSON.stringify(outcome)).toContain("Unauthorized: invalid API key");
  });

  it("เชื่อมต่อไม่ได้ หรือคำตอบอ่านไม่ได้: รายงานว่าค้นไม่สำเร็จแทนการทำให้คำตอบของผู้ใช้ล้ม", async () => {
    const offline: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await searchWeb(provider, "ทดสอบ", { fetchImpl: offline })).toEqual({ ok: false, status: 0, reason: "unknown", logDetail: "fetch failed" });

    const garbled = fakeTavily(() => new Response("<html>bad gateway</html>", { status: 200 }));
    expect(await searchWeb(provider, "ทดสอบ", { fetchImpl: garbled.fetchImpl })).toMatchObject({ ok: false, status: 200, reason: "unknown" });

    const noList = fakeTavily(() => json({ answer: "ไม่มีรายการ" }));
    expect(await searchWeb(provider, "ทดสอบ", { fetchImpl: noList.fetchImpl })).toEqual({ ok: true, results: [] });
  });
});

describe("fetchSearchUsage", () => {
  const provider: WebSearchProvider = { name: "tavily", label: "Tavily", apiKey: TAVILY_KEY, baseUrl: "https://tavily.invalid" };
  const reply = (body: unknown, status = 200): typeof fetch => async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("ถามยอดของรอบบิลจาก Tavily ด้วยกุญแจในหัวคำขอ และใช้ยอดของแผนซึ่งตรงกับโควตาฟรีรายเดือน", async () => {
    const sent: Array<{ url: string; method?: string; authorization: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      sent.push({ url: String(input), method: init?.method, authorization: new Headers(init?.headers).get("authorization") });
      return new Response(
        JSON.stringify({
          key: { usage: 40, limit: null, search_usage: 40 },
          account: { current_plan: "Researcher", plan_usage: 123, plan_limit: 1000, paygo_usage: 0, paygo_limit: 0 }
        }),
        { status: 200 }
      );
    };

    expect(await fetchSearchUsage(provider, { fetchImpl })).toEqual({ used: 123, limit: 1000, plan: "Researcher" });
    expect(sent).toEqual([{ url: "https://tavily.invalid/usage", method: "GET", authorization: `Bearer ${TAVILY_KEY}` }]);
  });

  it("ไม่มียอดของแผน: ใช้ยอดของกุญแจนี้แทน เพดานที่ไม่จำกัดคือ null", async () => {
    expect(await fetchSearchUsage(provider, { fetchImpl: reply({ key: { usage: 7, limit: null } }) })).toEqual({ used: 7, limit: null, plan: null });
    expect(await fetchSearchUsage(provider, { fetchImpl: reply({ key: { usage: 7, limit: 500 }, account: {} }) })).toEqual({ used: 7, limit: 500, plan: null });
  });

  it("ถามไม่สำเร็จหรือคำตอบอ่านไม่ได้: คืน null แทนการทำให้แผงสถานะล้ม", async () => {
    expect(await fetchSearchUsage(provider, { fetchImpl: reply({ detail: { error: "Unauthorized" } }, 401) })).toBeNull();
    expect(await fetchSearchUsage(provider, { fetchImpl: reply({ key: { usage: "many" } }) })).toBeNull();
    expect(await fetchSearchUsage(provider, { fetchImpl: reply("not json object") })).toBeNull();
    const offline: typeof fetch = () => Promise.reject(new Error("offline"));
    expect(await fetchSearchUsage(provider, { fetchImpl: offline })).toBeNull();
  });
});
