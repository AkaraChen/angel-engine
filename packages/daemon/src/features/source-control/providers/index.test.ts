import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { executeGit } from "../local-git/backend";
import { createSourceControlRegistry } from "./index";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("built-in source-control providers", () => {
  it("registers GitHub for zero-config project activation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "github-provider-"));
    roots.push(root);
    await executeGit(root, ["init", "--initial-branch=main"]);
    await executeGit(root, [
      "remote",
      "add",
      "origin",
      "https://github.com/acme/widgets.git",
    ]);

    const result = await createSourceControlRegistry().activate({
      projectPath: root,
    });

    expect(result).toMatchObject({
      activation: {
        provider: { id: "github" },
        remote: { name: "origin" },
      },
      status: "active",
    });
  });

  it("keeps the GitHub provider entry point narrow", async () => {
    expect(Object.keys(await import("./github"))).toEqual(["githubPlugin"]);
  });
});
