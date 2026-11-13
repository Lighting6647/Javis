import { describe, expect, it, vi } from "vitest";
import { allowsFraming, canEmbedPage, decideFraming, frameFriendlyUrl, isPublicAddress, type FrameCheckDeps, type FrameResponse } from "./frameCheck.js";

const HTML = { "content-type": "text/html; charset=utf-8" };

describe("allowsFraming", () => {
  it("หน้า HTML ที่ไม่ได้ห้ามไว้: แสดงในกรอบได้", () => {
    expect(allowsFraming({ status: 200, headers: HTML })).toBe(true);
  });

  it.each([["DENY"], ["SAMEORIGIN"], ["sameorigin"], ["ALLOW-FROM https://partner.example"], ["ALLOWALL"]])(
    "เจ้าของเว็บส่ง X-Frame-Options: %s มา: ไม่แสดงในกรอบ",
    (value) => {
      expect(allowsFraming({ status: 200, headers: { ...HTML, "x-frame-options": value } })).toBe(false);
    }
  );

  it.each([
    ["frame-ancestors 'none'"],
    ["frame-ancestors 'self'"],
    ["default-src 'self'; frame-ancestors 'self' https://partner.example"],
    ["FRAME-ANCESTORS 'self'"],
    ["script-src 'self', frame-ancestors 'none'"]
  ])("นโยบาย %s: ไม่แสดงในกรอบ", (policy) => {
    expect(allowsFraming({ status: 200, headers: { ...HTML, "content-security-policy": policy } })).toBe(false);
  });

  it.each([["frame-ancestors *"], ["frame-ancestors https:"], ["default-src 'self'; frame-ancestors 'self' https:"], ["default-src 'self'; script-src 'self'"]])(
    "นโยบาย %s: ยอมให้เว็บ https ใดก็ได้แสดง จึงแสดงในกรอบได้",
    (policy) => {
      expect(allowsFraming({ status: 200, headers: { ...HTML, "content-security-policy": policy } })).toBe(true);
    }
  );

  it("มีนโยบายหลายบรรทัด และบรรทัดหนึ่งห้ามไว้: ไม่แสดงในกรอบ", () => {
    const headers = { ...HTML, "content-security-policy": ["frame-ancestors *", "frame-ancestors 'none'"] };

    expect(allowsFraming({ status: 200, headers })).toBe(false);
  });

  it("นโยบายแบบรายงานอย่างเดียวไม่ได้ห้ามจริง: แสดงในกรอบได้", () => {
    const headers = { ...HTML, "content-security-policy-report-only": "frame-ancestors 'none'" };

    expect(allowsFraming({ status: 200, headers })).toBe(true);
  });

  it.each([[404], [403], [500], [204]])("หน้าตอบสถานะ %i: ไม่แสดงในกรอบ", (status) => {
    expect(allowsFraming({ status, headers: HTML })).toBe(false);
  });

  it.each([["application/pdf"], ["image/png"], ["application/octet-stream"], [undefined]])("เนื้อหาไม่ใช่หน้าเว็บ (%s): ไม่แสดงในกรอบ", (type) => {
    expect(allowsFraming({ status: 200, headers: type ? { "content-type": type } : {} })).toBe(false);
  });
});

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "203.150.4.10", "104.18.32.7", "2606:4700:4700::1111", "2404:6800:4001:80e::200e"])("%s: ที่อยู่สาธารณะ", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.9.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "2001:db8::1",
    "not-an-address",
    ""
  ])("%s: ไม่ใช่ที่อยู่สาธารณะ จึงห้ามเซิร์ฟเวอร์ไปขอ", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe("frameFriendlyUrl", () => {
  it("หน้าผลค้นของ Google ซึ่งห้ามแสดงในกรอบ: เปลี่ยนเป็นหน้าผลค้นที่แสดงในกรอบได้ ด้วยคำค้นเดิม", () => {
    expect(frameFriendlyUrl("https://www.google.com/search?q=%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%E0%B8%97%E0%B8%AD%E0%B8%87&hl=th")).toBe(
      "https://www.bing.com/search?q=%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%E0%B8%97%E0%B8%AD%E0%B8%87"
    );
    expect(frameFriendlyUrl("https://google.co.th/search?q=pantip+news")).toBe("https://www.bing.com/search?q=pantip+news");
  });

  it.each([
    ["หน้าแรกของ Google", "https://www.google.com/"],
    ["หน้าผลค้นที่ไม่มีคำค้น", "https://www.google.com/search?q="],
    ["บริการอื่นของ Google", "https://maps.google.com/search?q=cafe"],
    ["เว็บอื่นที่ชื่อคล้าย", "https://www.google.com.evil.example/search?q=x"],
    ["เว็บทั่วไป", "https://pantip.com/topic/1"],
    ["ลิงก์ที่อ่านไม่ได้", "not a url"]
  ])("%s: ไม่เปลี่ยน", (_name, url) => {
    expect(frameFriendlyUrl(url)).toBeNull();
  });
});

describe("decideFraming", () => {
  const open = (url: string, auto = true) => ({ type: "open" as const, url, title: "หน้าเว็บ", auto });

  it("หน้าที่ผู้ใช้สั่งเปิดและเจ้าของเว็บยอม: ให้แสดงในกรอบ", async () => {
    const check = vi.fn(async () => true);

    expect(await decideFraming(open("https://pantip.com/"), check)).toEqual({ type: "open", url: "https://pantip.com/", title: "หน้าเว็บ", auto: true, embed: true });
    expect(check).toHaveBeenCalledWith("https://pantip.com/");
  });

  it("เจ้าของเว็บไม่ยอม: ไม่แสดงในกรอบ ลิงก์คงเดิม", async () => {
    expect(await decideFraming(open("https://www.youtube.com/"), async () => false)).toMatchObject({ url: "https://www.youtube.com/", embed: false });
  });

  it("ลิงก์ที่ต้องให้ผู้ใช้กดเอง: ไม่ตรวจ และไม่แสดงในกรอบ", async () => {
    const check = vi.fn(async () => true);

    expect(await decideFraming(open("https://news.example.com/", false), check)).toMatchObject({ auto: false, embed: false });
    expect(check).not.toHaveBeenCalled();
  });

  it("หน้าผลค้นของ Google: เปลี่ยนเป็นหน้าผลค้นที่แสดงในกรอบได้ ด้วยคำค้นเดิม", async () => {
    const check = vi.fn(async () => true);

    expect(await decideFraming(open("https://www.google.com/search?q=pantip"), check)).toMatchObject({ url: "https://www.bing.com/search?q=pantip", embed: true });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith("https://www.bing.com/search?q=pantip");
  });

  it("หน้าผลค้นอีกเจ้าแสดงในกรอบไม่ได้ในตอนนั้น: คงหน้าผลค้นของ Google ไว้ และเปิดแบบเดิม", async () => {
    const check = vi.fn(async () => false);

    expect(await decideFraming(open("https://www.google.com/search?q=pantip"), check)).toMatchObject({ url: "https://www.google.com/search?q=pantip", embed: false });
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe("canEmbedPage", () => {
  /** ตัวจำลองของเครือข่าย: กำหนดที่อยู่ของแต่ละโฮสต์ และคำตอบของแต่ละหน้า */
  function setup(options: { addresses?: Record<string, string[]>; responses?: Record<string, FrameResponse | Error> } = {}) {
    const addresses = options.addresses ?? {};
    const responses = options.responses ?? {};
    const requested: Array<{ url: string; address: string }> = [];
    const deps: FrameCheckDeps = {
      resolve: vi.fn(async (hostname: string) => addresses[hostname] ?? ["203.150.4.10"]),
      head: vi.fn(async ({ url, address }) => {
        requested.push({ url: url.href, address });
        const response = responses[url.href] ?? { status: 200, headers: HTML };
        if (response instanceof Error) throw response;
        return response;
      })
    };
    return { deps, requested };
  }

  it("หน้าเว็บสาธารณะที่ไม่ห้ามไว้: แสดงในกรอบได้ และขอไปยังที่อยู่ที่ตรวจแล้วเท่านั้น", async () => {
    const { deps, requested } = setup();

    expect(await canEmbedPage("https://pantip.com/forum", deps)).toBe(true);
    expect(requested).toEqual([{ url: "https://pantip.com/forum", address: "203.150.4.10" }]);
  });

  it("เจ้าของเว็บห้ามแสดงในกรอบ: ไม่ได้", async () => {
    const { deps } = setup({ responses: { "https://www.google.com/search?q=x": { status: 200, headers: { ...HTML, "x-frame-options": "SAMEORIGIN" } } } });

    expect(await canEmbedPage("https://www.google.com/search?q=x", deps)).toBe(false);
  });

  it.each([
    ["ไม่เข้ารหัส (หน้า https ใส่หน้า http ในกรอบไม่ได้)", "http://example.com/"],
    ["ไม่ใช่เว็บ", "ftp://example.com/file"],
    ["มีชื่อผู้ใช้ในลิงก์", "https://user:secret@example.com/"],
    ["ระบุพอร์ตอื่น", "https://example.com:8443/"],
    ["ใช้เลข IP แทนชื่อเว็บ", "https://203.150.4.10/"],
    ["ใช้เลข IPv6 แทนชื่อเว็บ", "https://[2606:4700:4700::1111]/"],
    ["ชื่อเครื่องภายใน", "https://localhost/"],
    ["อ่านเป็นลิงก์ไม่ได้", "not a url"]
  ])("%s: ไม่ขอเลย และไม่แสดงในกรอบ", async (_name, url) => {
    const { deps, requested } = setup();

    expect(await canEmbedPage(url, deps)).toBe(false);
    expect(requested).toEqual([]);
  });

  it.each([
    ["เครื่องของเซิร์ฟเวอร์เอง", ["127.0.0.1"]],
    ["เครือข่ายภายใน", ["10.0.0.8"]],
    ["บริการข้อมูลของผู้ให้บริการคลาวด์", ["169.254.169.254"]],
    ["มีทั้งที่อยู่สาธารณะและภายในปนกัน", ["203.150.4.10", "192.168.1.1"]],
    ["ไม่มีที่อยู่เลย", []]
  ])("ชื่อเว็บชี้ไปที่%s: ไม่ขอ เพื่อไม่ให้ใครใช้เซิร์ฟเวอร์ส่องเครือข่ายภายใน", async (_name, addresses) => {
    const { deps, requested } = setup({ addresses: { "intranet.example": addresses } });

    expect(await canEmbedPage("https://intranet.example/admin", deps)).toBe(false);
    expect(requested).toEqual([]);
  });

  it("หน้าพาไปต่อที่อื่น: ตามไปและตัดสินจากหน้าปลายทาง", async () => {
    const { deps, requested } = setup({
      responses: {
        "https://sanook.com/": { status: 301, headers: { location: "https://www.sanook.com/" } },
        "https://www.sanook.com/": { status: 302, headers: { location: "/home?from=root" } }
      }
    });

    expect(await canEmbedPage("https://sanook.com/", deps)).toBe(true);
    expect(requested.map((entry) => entry.url)).toEqual(["https://sanook.com/", "https://www.sanook.com/", "https://www.sanook.com/home?from=root"]);
  });

  it("หน้าปลายทางหลังพาไปต่อห้ามแสดงในกรอบ: ไม่ได้", async () => {
    const { deps } = setup({
      responses: {
        "https://short.example/x": { status: 302, headers: { location: "https://www.facebook.com/page" } },
        "https://www.facebook.com/page": { status: 200, headers: { ...HTML, "x-frame-options": "DENY" } }
      }
    });

    expect(await canEmbedPage("https://short.example/x", deps)).toBe(false);
  });

  it("พาไปต่อยังเครือข่ายภายใน: หยุด ไม่ขอต่อ", async () => {
    const { deps, requested } = setup({
      addresses: { "internal.example": ["10.1.2.3"] },
      responses: { "https://public.example/": { status: 302, headers: { location: "https://internal.example/secret" } } }
    });

    expect(await canEmbedPage("https://public.example/", deps)).toBe(false);
    expect(requested.map((entry) => entry.url)).toEqual(["https://public.example/"]);
  });

  it("พาไปต่อยังหน้าที่ไม่เข้ารหัส: ไม่ได้", async () => {
    const { deps } = setup({ responses: { "https://old.example/": { status: 301, headers: { location: "http://old.example/" } } } });

    expect(await canEmbedPage("https://old.example/", deps)).toBe(false);
  });

  it("พาไปต่อไม่รู้จบ: หยุดหลังจำนวนครั้งที่กำหนด", async () => {
    const { deps, requested } = setup({
      responses: Object.fromEntries(
        Array.from({ length: 10 }, (_unused, index) => [`https://loop.example/${index}`, { status: 302, headers: { location: `https://loop.example/${index + 1}` } }])
      )
    });

    expect(await canEmbedPage("https://loop.example/0", deps)).toBe(false);
    expect(requested.length).toBeLessThanOrEqual(4);
  });

  it("พาไปต่อโดยไม่บอกปลายทาง: ไม่ได้", async () => {
    const { deps } = setup({ responses: { "https://broken.example/": { status: 302, headers: {} } } });

    expect(await canEmbedPage("https://broken.example/", deps)).toBe(false);
  });

  it("ขอไม่สำเร็จหรือหาชื่อเว็บไม่เจอ: ไม่แสดงในกรอบ และไม่ล้ม", async () => {
    const failing = setup({ responses: { "https://down.example/": new Error("ECONNRESET") } });
    expect(await canEmbedPage("https://down.example/", failing.deps)).toBe(false);

    const unknown: FrameCheckDeps = { resolve: () => Promise.reject(new Error("ENOTFOUND")), head: vi.fn() };
    expect(await canEmbedPage("https://nowhere.example/", unknown)).toBe(false);
    expect(unknown.head).not.toHaveBeenCalled();
  });

  it("เว็บตอบช้าเกินเวลาที่ให้: เลิกรอ และไม่แสดงในกรอบ", async () => {
    let aborted = false;
    const slow: FrameCheckDeps = {
      resolve: async () => ["203.150.4.10"],
      head: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        })
    };

    expect(await canEmbedPage("https://slow.example/", slow, { timeoutMs: 20 })).toBe(false);
    expect(aborted).toBe(true);
  });
});
