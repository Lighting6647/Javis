import { describe, expect, it } from "vitest";
import { loadCases, promptFor, readBaseline, runEvals } from "../evals/runEvals.js";
import type { FeedbackRecord } from "../server/userStore.js";
import { clusterFeedback, proposedCases, proposedPatch, renderProposals, repeatedClusters, rulesFor } from "./learning.js";

const down = (note: string, reply = ""): FeedbackRecord => ({ user: "light", rating: "down", note, reply, createdAt: 1 });

/** คำติชม 👎 จริงแบบที่ผู้ใช้มักเขียน */
const FEEDBACK: FeedbackRecord[] = [
  down("ตอบยาวไป ฟังแล้วเหนื่อย", "ข้อแรกคือพักผ่อนให้พอค่ะ ข้อสองคือดื่มน้ำค่ะ ข้อสามคือออกกำลังกายค่ะ ข้อสี่คือกินผักค่ะ ข้อห้าคือนอนเร็วค่ะ"),
  down("ยาวเกิน อยากได้สั้น ๆ", "เรื่องนี้มีหลายมุมค่ะ มุมแรกคือราคาค่ะ มุมที่สองคือคุณภาพค่ะ มุมที่สามคือบริการค่ะ มุมที่สี่คือการรับประกันค่ะ"),
  down("ทำไมลงท้ายครับ", "ได้เลยครับ เดี๋ยวช่วยดูให้ครับ"),
  down("", "สวัสดีครับ มีอะไรให้ช่วยไหมครับ"),
  down("เสียงอ่านชื่อยี่ห้อผิด"),
  down("อ่านชื่อยี่ห้อผิดอีกแล้ว"),
  down("แอปค้างตอนกดไมค์"),
  { user: "light", rating: "up", note: "", reply: "ดีมากค่ะ", createdAt: 1 }
];

describe("rulesFor", () => {
  it("ใช้คำในหมายเหตุก่อน", () => {
    expect(rulesFor(down("ยาวไป")).map((rule) => rule.id)).toEqual(["short"]);
  });
  it("ไม่มีหมายเหตุ: ดูจากคำตอบที่ถูกติ", () => {
    expect(rulesFor(down("", "## หัวข้อ\n- ข้อหนึ่งครับ 😊")).map((rule) => rule.id)).toEqual(["female-polite", "no-markdown", "no-emoji"]);
  });
});

describe("clusterFeedback", () => {
  const clusters = clusterFeedback(FEEDBACK);
  const repeated = repeatedClusters(clusters);

  it("จัดกลุ่มปัญหาที่ซ้ำ: ยาวเกิน ลงท้ายครับ และหมายเหตุที่คล้ายกัน ส่วนปัญหาที่เกิดครั้งเดียวไม่นับ", () => {
    expect(repeated.map((cluster) => [cluster.id, cluster.items.length])).toEqual([
      ["short", 2],
      ["female-polite", 2],
      ["other-1", 2]
    ]);
    expect(repeated[2]?.keywords).toEqual(expect.arrayContaining(["ชื่อ", "ยี่ห้อ"]));
    expect(clusters.find((cluster) => cluster.items.some((item) => item.note.includes("ไมค์")))?.items).toHaveLength(1);
  });

  it("ข้อเสนอ prompt มาจากกฎของกลุ่มที่ซ้ำ ไม่รวมกลุ่มที่ไม่ตรงกฎ", () => {
    expect(proposedPatch(repeated).split("\n")).toEqual([
      "ตอบให้จบภายในไม่เกินสามประโยค ตัดรายละเอียดที่ผู้ใช้ไม่ได้ถามออก",
      "ใช้สรรพนามและคำลงท้ายสุภาพแบบผู้หญิง (เช่น ค่ะ, นะคะ) ทุกประโยค ห้ามใช้ ครับ"
    ]);
  });

  it("คำถามทดสอบใหม่ใช้คำตอบจริงที่ถูกติ และผ่านเมื่อใช้ prompt + ข้อเสนอ", () => {
    const cases = proposedCases(repeated, "2026-11-19");
    expect(cases.map((item) => item.id)).toEqual([
      "learned-2026-11-19-short-1",
      "learned-2026-11-19-short-2",
      "learned-2026-11-19-female-polite-1",
      "learned-2026-11-19-female-polite-2"
    ]);
    const withPatch = runEvals({ cases, patch: proposedPatch(repeated) });
    expect(withPatch.failures).toEqual([]);
    expect(withPatch.score).toBeGreaterThanOrEqual(runEvals({ cases }).score);
  });

  it("prompt + ข้อเสนอ ได้คะแนนชุดหลักไม่ต่ำกว่าเกณฑ์", () => {
    const score = runEvals({ cases: loadCases(), patch: proposedPatch(repeated) }).score;
    expect(score).toBeGreaterThanOrEqual(readBaseline()?.score ?? 1);
  });

  it("รายงานบอกว่ารออนุมัติ มีตัวอย่าง คำสั่งที่เสนอ และขั้นตอนหลังอนุมัติ", () => {
    const patch = proposedPatch(repeated);
    const markdown = renderProposals({
      date: "2026-11-19",
      days: 7,
      total: FEEDBACK.length,
      downCount: 7,
      clusters,
      repeated,
      patch,
      patchFile: "learning/proposals-2026-11-19.patch.txt",
      casesFile: "evals/proposed/learned-2026-11-19.json",
      caseCount: 4,
      currentPrompt: promptFor({ id: "p", category: "x", question: "", checks: {} }).instructions,
      evals: null
    });
    expect(markdown).toContain("รออนุมัติจากคุณไลท์");
    expect(markdown).toContain("prompt ปัจจุบันมีกฎนี้อยู่แล้ว");
    expect(markdown).toContain("อ่านชื่อยี่ห้อผิด");
    expect(markdown).toContain(patch.split("\n")[0]);
    expect(markdown).toContain("server/chat/instructions.ts");
  });
});
