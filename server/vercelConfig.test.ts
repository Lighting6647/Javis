import type { Request, Response } from "express";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { permissionsPolicy, securityHeaders } from "./security.js";

/**
 * บน Vercel ไฟล์หน้าเว็บถูกเสิร์ฟโดย Vercel เอง ไม่ผ่านเซิร์ฟเวอร์ของเรา
 * หัวข้อความปลอดภัยของหน้าเว็บจึงต้องเขียนซ้ำไว้ใน vercel.json ชุดทดสอบนี้กันสองที่ไม่ตรงกัน
 */
interface VercelConfig {
  functions: Record<string, { maxDuration?: number }>;
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as VercelConfig;

/** หัวข้อที่เซิร์ฟเวอร์ของเราใส่ให้ทุกคำตอบ */
function serverHeaders(): Map<string, string> {
  const headers = new Map<string, string>();
  const response = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), String(value)),
    removeHeader: (name: string) => headers.delete(name.toLowerCase()),
    getHeader: (name: string) => headers.get(name.toLowerCase())
  } as unknown as Response;
  const request = { headers: {}, method: "GET", url: "/" } as unknown as Request;

  securityHeaders(request, response, () => undefined);
  permissionsPolicy(request, response, () => undefined);
  return headers;
}

/** แยกนโยบายเป็นรายข้อ ไม่สนลำดับ และไม่นับข้อที่มีเฉพาะโหมด production */
function directives(policy: string | undefined): string[] {
  return (policy ?? "")
    .split(";")
    .map((directive) => directive.trim())
    .filter((directive) => directive && directive !== "upgrade-insecure-requests")
    .sort();
}

/** แปลง source ของ vercel.json เป็นนิพจน์ที่ใช้ทดสอบเส้นทางได้ */
const matches = (source: string, path: string) => new RegExp(`^${source}$`).test(path);

describe("vercel.json", () => {
  const pageHeaders = new Map(vercel.headers[0]?.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  const server = serverHeaders();

  it("หน้าเว็บได้ Content-Security-Policy เดียวกับที่เซิร์ฟเวอร์ใส่ให้", () => {
    expect(directives(pageHeaders.get("content-security-policy"))).toEqual(directives(server.get("content-security-policy")));
    expect(directives(pageHeaders.get("content-security-policy")).length).toBeGreaterThan(8);
  });

  it("หน้าเว็บบน HTTPS บังคับให้ทุกคำขอเป็น HTTPS", () => {
    expect(pageHeaders.get("content-security-policy")).toContain("upgrade-insecure-requests");
  });

  it.each(["permissions-policy", "referrer-policy", "x-content-type-options", "x-frame-options", "cross-origin-opener-policy", "cross-origin-resource-policy"])(
    "หัวข้อ %s ตรงกับของเซิร์ฟเวอร์",
    (name) => {
      expect(pageHeaders.get(name)).toBe(server.get(name));
    }
  );

  it("หัวข้อของหน้าเว็บไม่ถูกใส่ซ้ำให้คำตอบของ API ซึ่งเซิร์ฟเวอร์ใส่เองอยู่แล้ว", () => {
    const source = vercel.headers[0]?.source ?? "";
    expect(matches(source, "/")).toBe(true);
    expect(matches(source, "/assets/index-abc.js")).toBe(true);
    expect(matches(source, "/api/chat")).toBe(false);
    expect(matches(source, "/health")).toBe(false);
  });

  it("ส่งคำขอ API และ /health ทั้งหมดไปที่ฟังก์ชันเดียว", () => {
    const toFunction = vercel.rewrites.filter((rule) => rule.destination === "/api");
    for (const path of ["/api/chat", "/api/auth/login", "/api/status", "/api/transcribe", "/health"]) {
      expect(toFunction.some((rule) => matches(rule.source, path))).toBe(true);
    }
    expect(Object.keys(vercel.functions)).toEqual(["api/index.ts"]);
  });

  it("เส้นทางของหน้าเว็บได้ index.html ส่วนไฟล์ที่หาไม่เจอและ API ไม่ถูกตอบเป็นหน้าเว็บ", () => {
    const fallback = vercel.rewrites.find((rule) => rule.destination === "/index.html");
    expect(fallback).toBeDefined();
    const source = fallback?.source ?? "";
    expect(matches(source, "/settings")).toBe(true);
    expect(matches(source, "/a/b")).toBe(true);
    expect(matches(source, "/assets/old-chunk.js")).toBe(false);
    expect(matches(source, "/api/unknown")).toBe(false);
    expect(matches(source, "/health")).toBe(false);
  });

  it("ฟังก์ชันมีเวลาพอสำหรับคำตอบที่ช้าที่สุดที่เซิร์ฟเวอร์ยอมรอ (90 วินาที)", () => {
    expect(vercel.functions["api/index.ts"]?.maxDuration).toBeGreaterThanOrEqual(100);
  });
});
