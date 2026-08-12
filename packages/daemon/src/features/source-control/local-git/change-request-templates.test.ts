import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { discoverPullRequestTemplates } from "./change-request-templates";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "angel-pr-template-"));
  tempDirs.push(dir);
  return dir;
}

describe("discoverPullRequestTemplates", () => {
  it("returns empty when no templates exist", async () => {
    const cwd = tempRepo();
    const result = await Effect.runPromise(
      discoverPullRequestTemplates({ cwd, providerId: "github" }),
    );
    expect(result).toEqual({ body: "", templates: [] });
  });

  it("discovers .github/PULL_REQUEST_TEMPLATE.md", async () => {
    const cwd = tempRepo();
    fs.mkdirSync(path.join(cwd, ".github"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".github", "PULL_REQUEST_TEMPLATE.md"),
      "## Summary\n\n- Change\n",
      "utf8",
    );

    const result = await Effect.runPromise(
      discoverPullRequestTemplates({ cwd, providerId: "github" }),
    );

    expect(result.body).toContain("## Summary");
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0]?.relativePath).toBe(
      ".github/PULL_REQUEST_TEMPLATE.md",
    );
    expect(result.templates[0]?.name).toBe("PULL_REQUEST_TEMPLATE");
  });

  it("lists multiple templates from the template directory", async () => {
    const cwd = tempRepo();
    const dir = path.join(cwd, ".github", "PULL_REQUEST_TEMPLATE");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "bugfix.md"), "Bug body", "utf8");
    fs.writeFileSync(path.join(dir, "feature.md"), "Feature body", "utf8");

    const result = await Effect.runPromise(
      discoverPullRequestTemplates({ cwd, providerId: "github" }),
    );

    expect(result.templates.map((template) => template.name).sort()).toEqual([
      "bugfix",
      "feature",
    ]);
    expect(result.body).toBe("Bug body");
  });
});
