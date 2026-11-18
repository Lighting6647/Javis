import { describe, expect, it, vi } from "vitest";
import { runProjectAction } from "./projectRunner.js";
import type { ProjectSummary } from "./projects.js";

const BASE_PROJECT: ProjectSummary = {
  id: "tamsang",
  name: "Tamsang",
  category: "POS",
  folderName: "Tamsang",
  localPresent: true,
  githubRepo: "Lighting6647/Tamsang-POS",
  vercelProject: null,
  webUrl: null,
  scripts: ["build", "test"],
  availableActions: ["build", "test", "cloud-status"],
  git: null
};

describe("runProjectAction", () => {
  it("blocks local build/test when running in cloud mode", async () => {
    const result = await runProjectAction(BASE_PROJECT, "build", { rootDir: null });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("Local/Desktop");
  });

  it("refuses scripts not declared in project package.json", async () => {
    const result = await runProjectAction(BASE_PROJECT, "lint", { rootDir: "d:\\AI\\Light" });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("lint");
  });

  it("runs allowlisted local script via injected runner cleanly", async () => {
    const scriptRunner = vi.fn().mockResolvedValue({ code: 0, output: "✓ built in 1.2s" });
    const result = await runProjectAction(BASE_PROJECT, "build", { rootDir: "d:\\AI\\Light", scriptRunner });
    expect(scriptRunner).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("built in 1.2s");
  });
});
