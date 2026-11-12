import { describe, expect, it } from "vitest";
import { resolveWebSearchProvider, searchWeb, type WebSearchProvider } from "./webSearch.js";

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

  it("ส่งคำค้นไปยัง Tavily ด้วยกุญแจในหัวคำขอ และขอการค้นแบบพื้นฐานที่ใช้เครดิตเดียว", async () => {
    const upstream = fakeTavily(() => json({ query: "ราคาทองคำวันนี้", results: [] }));
    await searchWeb(provider, "ราคาทองคำวันนี้", { fetchImpl: upstream.fetchImpl });

    expect(upstream.sent).toHaveLength(1);
    const [request] = upstream.sent;
    expect(request?.url).toBe("https://tavily.invalid/search");
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("authorization")).toBe(`Bearer ${TAVILY_KEY}`);
    expect(request?.headers.get("content-type")).toBe("application/json");
    expect(request?.body).toEqual({ query: "ราคาทองคำวันนี้", search_depth: "basic", topic: "general", max_results: 5, include_answer: false });
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
