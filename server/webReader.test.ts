import { describe, expect, it } from "vitest";
import { extractReadableText, readWebPage, type WebReaderDeps } from "./webReader.js";

describe("extractReadableText", () => {
  it("ตัด script/style และดึง title กับเนื้อหาที่อ่านได้", () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>ข่าวเทคโนโลยี &amp; AI</title>
          <style>.hidden { display: none; }</style>
        </head>
        <body>
          <script>alert("secret")</script>
          <h1>สรุปข่าววันนี้</h1>
          <p>ระบบใหม่รองรับภาษาไทย&nbsp;100%</p>
        </body>
      </html>
    `;
    const result = extractReadableText(html, "text/html; charset=utf-8");
    expect(result.title).toBe("ข่าวเทคโนโลยี & AI");
    expect(result.text).toContain("สรุปข่าววันนี้");
    expect(result.text).toContain("ระบบใหม่รองรับภาษาไทย 100%");
    expect(result.text).not.toContain("alert");
    expect(result.text).not.toContain("display: none");
  });
});

describe("readWebPage", () => {
  it("ปฏิเสธลิงก์ที่ไม่ใช่ https และที่อยู่เครือข่ายภายใน (SSRF)", async () => {
    const deps: WebReaderDeps = {
      resolve: async () => ["127.0.0.1"],
      get: async () => ({ status: 200, headers: { "content-type": "text/html" }, body: "<p>secret</p>" })
    };

    expect(await readWebPage("http://example.com", { deps })).toMatchObject({ ok: false, reason: "invalid_url" });
    expect(await readWebPage("https://internal.test/admin", { deps })).toMatchObject({ ok: false, reason: "blocked_host" });
  });

  it("ดึงเนื้อหาจากเว็บสาธารณะได้และบล็อกการ redirect ไปยัง IP ภายใน", async () => {
    const deps: WebReaderDeps = {
      resolve: async (host) => (host === "news.example.com" ? ["93.184.216.34"] : ["192.168.1.1"]),
      get: async ({ url }) =>
        url.pathname === "/redir"
          ? { status: 302, headers: { location: "https://router.local/secret" }, body: "" }
          : {
              status: 200,
              headers: { "content-type": "text/html" },
              body: "<title>หน้าข่าว</title><article><p>อัตราแลกเปลี่ยนวันนี้คงที่</p></article>"
            }
    };

    const ok = await readWebPage("https://news.example.com/article", { deps });
    expect(ok).toEqual({
      ok: true,
      url: "https://news.example.com/article",
      title: "หน้าข่าว",
      text: "อัตราแลกเปลี่ยนวันนี้คงที่"
    });

    const blockedRedirect = await readWebPage("https://news.example.com/redir", { deps });
    expect(blockedRedirect).toMatchObject({ ok: false, reason: "blocked_host" });
  });
});
