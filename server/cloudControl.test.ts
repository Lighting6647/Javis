import { describe, expect, it, vi } from "vitest";
import { fetchProjectCloudStatus, triggerProjectRedeploy } from "./cloudControl.js";

describe("cloudControl", () => {
  it("reads latest GitHub commit, CI status, and Vercel deployment state", async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/commits")) {
        return new Response(
          JSON.stringify([{ html_url: "https://github.com/Lighting6647/Javis/commit/abc", commit: { message: "feat: vision\n\nbody", author: { date: "2026-11-18T10:00:00Z" } } }]),
          { status: 200 }
        );
      }
      if (url.includes("/actions/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [{ conclusion: "success" }] }), { status: 200 });
      }
      if (url.includes("api.vercel.com/v6/deployments")) {
        return new Response(JSON.stringify({ deployments: [{ readyState: "READY", url: "javis-bice.vercel.app", createdAt: 1794990000 }] }), {
          status: 200
        });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const status = await fetchProjectCloudStatus(
      { name: "Javis", githubRepo: "Lighting6647/Javis", vercelProject: "javis" },
      { githubToken: "ghp-test", vercelToken: "vrc-test", fetchImpl }
    );

    expect(status.github.reachable).toBe(true);
    expect(status.github.latestCommitMessage).toBe("feat: vision");
    expect(status.github.ciConclusion).toBe("success");
    expect(status.vercel.state).toBe("READY");
    expect(status.vercel.url).toBe("https://javis-bice.vercel.app");
  });

  it("refuses redeploy cleanly when VERCEL_TOKEN is missing", async () => {
    const result = await triggerProjectRedeploy({ name: "Javis", vercelProject: "javis" }, { vercelToken: "" });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("VERCEL_TOKEN");
  });

  it("triggers Vercel redeploy cleanly when token and prior deployment exist", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deployments: [{ uid: "dpl_123", name: "javis", target: "production" }] }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "javis-new.vercel.app", readyState: "BUILDING" }), { status: 200 })) as unknown as typeof fetch;

    const result = await triggerProjectRedeploy(
      { name: "Javis", vercelProject: "javis" },
      { vercelToken: "vrc-test", fetchImpl }
    );
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://javis-new.vercel.app");
  });
});
