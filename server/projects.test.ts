import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findProject, listProjects, parseGitHubRepo, resolveLocalRootDir, resolveSafeProjectDir } from "./projects.js";

const tempDirs: string[] = [];

function makeTempRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "javis-projects-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("parseGitHubRepo", () => {
  it("strips credentials from HTTPS remote URLs and extracts owner/repo", () => {
    expect(parseGitHubRepo("https://Lighting6647:secret-token@github.com/Lighting6647/Javis.git")).toBe("Lighting6647/Javis");
    expect(parseGitHubRepo("https://github.com/fernclinicit-bit/CEO.git")).toBe("fernclinicit-bit/CEO");
    expect(parseGitHubRepo("git@github.com:Lighting6647/Tamsang-POS.git")).toBe("Lighting6647/Tamsang-POS");
  });

  it("rejects non-GitHub or malformed URLs", () => {
    expect(parseGitHubRepo("https://evil.example.com/owner/repo.git")).toBeNull();
    expect(parseGitHubRepo("not-a-url")).toBeNull();
  });
});

describe("resolveSafeProjectDir", () => {
  it("allows valid single-segment project directory inside root", () => {
    const root = "d:\\AI\\Light";
    expect(resolveSafeProjectDir(root, "Tamsang")).toBe(path.resolve(root, "Tamsang"));
  });

  it("blocks path traversal attempts", () => {
    const root = "d:\\AI\\Light";
    expect(resolveSafeProjectDir(root, "../Windows")).toBeNull();
    expect(resolveSafeProjectDir(root, "sub/dir")).toBeNull();
    expect(resolveSafeProjectDir(root, "..\\secret")).toBeNull();
  });
});

describe("resolveLocalRootDir & listProjects", () => {
  it("switches cleanly to cloud mode when VERCEL=1 is set", async () => {
    expect(resolveLocalRootDir({ VERCEL: "1" })).toBeNull();
    const listing = await listProjects({ env: { VERCEL: "1" } });
    expect(listing.mode).toBe("cloud");
    expect(listing.projects.some((p) => p.id === "javis")).toBe(true);
    expect(listing.projects.every((p) => !p.localPresent)).toBe(true);
  });

  it("scans local workspace folders and reads allowed package scripts", async () => {
    const root = makeTempRoot();
    const projDir = path.join(root, "Tamsang");
    mkdirSync(projDir);
    writeFileSync(path.join(projDir, "package.json"), JSON.stringify({ scripts: { dev: "vite", build: "vite build", test: "vitest" } }));
    mkdirSync(path.join(root, "CustomApp"));
    writeFileSync(path.join(root, "CustomApp", "package.json"), JSON.stringify({ scripts: { lint: "eslint ." } }));

    const listing = await listProjects({ rootDir: root, includeGit: false });
    expect(listing.mode).toBe("local");

    const tamsang = findProject("tamsang", listing.projects);
    expect(tamsang?.localPresent).toBe(true);
    expect(tamsang?.scripts).toEqual(["build", "test"]);

    const custom = findProject("CustomApp", listing.projects);
    expect(custom?.localPresent).toBe(true);
    expect(custom?.scripts).toEqual(["lint"]);

    expect(findProject("inventory", listing.projects)?.id).toBe("inventory-ai-light");
    expect(findProject("บัญชี", listing.projects)?.id).toBe("accounting-light");
  });
});
