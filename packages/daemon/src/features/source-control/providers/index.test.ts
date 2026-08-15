import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { findProviderCli } = vi.hoisted(() => ({
  findProviderCli: vi.fn(async () => null),
}));

vi.mock("./provider-cli", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./provider-cli")>()),
  findProviderCli,
}));

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

  it.each([
    ["gitlab", "https://gitlab.com/acme/widgets.git"],
    ["azure-devops", "https://dev.azure.com/acme/widgets/_git/widget-api"],
  ])("registers %s for zero-config project activation", async (provider, url) => {
    const root = await mkdtemp(path.join(os.tmpdir(), `${provider}-provider-`));
    roots.push(root);
    await executeGit(root, ["init", "--initial-branch=main"]);
    await executeGit(root, ["remote", "add", "origin", url]);

    const result = await createSourceControlRegistry().activate({
      projectPath: root,
    });

    expect(result).toMatchObject({
      activation: {
        authentication: "unavailable",
        provider: { id: provider },
        unavailableReason: { kind: "cli-missing" },
      },
      status: "active",
    });
    expect(findProviderCli).toHaveBeenCalledWith(
      provider === "gitlab" ? "glab" : "az",
    );
  });

  it("keeps the GitHub provider entry point narrow", async () => {
    expect(Object.keys(await import("./github"))).toEqual(["githubPlugin"]);
  });

  it("reports GitHub and GitLab remotes as ambiguous instead of preferring GitHub", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mixed-providers-"));
    roots.push(root);
    await executeGit(root, ["init", "--initial-branch=main"]);
    await executeGit(root, [
      "remote",
      "add",
      "github",
      "https://github.com/acme/widgets.git",
    ]);
    await executeGit(root, [
      "remote",
      "add",
      "gitlab",
      "https://gitlab.com/acme/widgets.git",
    ]);

    const result = await createSourceControlRegistry().activate({
      projectPath: root,
    });

    expect(result).toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({ providerId: "github" }),
        expect.objectContaining({ providerId: "gitlab" }),
      ]),
      status: "ambiguous",
    });
  });
});
