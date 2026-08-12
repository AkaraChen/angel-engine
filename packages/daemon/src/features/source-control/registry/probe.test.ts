import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { executeGit } from "../local-git/backend";
import { collectProbeContext, parseGitConfigRemotes } from "./probe";

const roots: string[] = [];

async function git(root: string, args: readonly string[]) {
  return (await executeGit(root, args)).stdout.trim();
}

async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "source-control-probe-"));
  roots.push(root);
  await git(root, ["init", "--initial-branch=main"]);
  await git(root, ["config", "user.name", "Probe Test"]);
  await git(root, ["config", "user.email", "probe@example.com"]);
  await git(root, ["commit", "--allow-empty", "-m", "initial"]);
  await git(root, [
    "remote",
    "add",
    "origin",
    "https://github.com/acme/app.git",
  ]);
  await git(root, [
    "remote",
    "add",
    "mirror",
    "ssh://git@gitlab.example/acme/app.git",
  ]);
  await git(root, [
    "config",
    "remote.mirror.pushurl",
    "ssh://push@gitlab.example/acme/app.git",
  ]);
  await git(root, ["config", "branch.main.remote", "mirror"]);
  await git(root, ["config", "branch.main.merge", "refs/heads/main"]);
  await git(root, ["update-ref", "refs/remotes/mirror/main", "HEAD"]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("source-control probe", () => {
  it("parses fetch and push URLs from git config", () => {
    const remotes = parseGitConfigRemotes(`
      [remote "origin"]
        url = https://example.com/acme/app.git
        pushurl = ssh://git@example.com/acme/app.git
    `);
    expect(remotes.get("origin")).toEqual({
      fetchUrl: "https://example.com/acme/app.git",
      pushUrl: "ssh://git@example.com/acme/app.git",
    });
  });

  it("collects remotes, upstream, explicit config, and host mappings without mutation", async () => {
    const root = await repository();
    const configPath = path.join(root, ".git", "config");
    const configBefore = await readFile(configPath, "utf8");
    const statusBefore = await git(root, ["status", "--porcelain"]);

    const result = await collectProbeContext({
      hostMappings: [{ host: "gitlab.example", providerId: "gitlab" }],
      projectPath: root,
      providerConfig: { providerId: "gitlab", remote: "mirror" },
    });

    expect(result).toMatchObject({
      defaultRemote: null,
      explicitProviderId: "gitlab",
      explicitRemote: "mirror",
      hostMappings: { "gitlab.example": "gitlab" },
      upstreamRemote: "mirror",
    });
    expect(result.remotes).toHaveLength(2);
    expect(
      result.remotes.find((remote) => remote.name === "mirror"),
    ).toMatchObject({
      fetchUrl: "ssh://git@gitlab.example/acme/app.git",
      pushUrl: "ssh://push@gitlab.example/acme/app.git",
    });
    expect(await readFile(configPath, "utf8")).toBe(configBefore);
    expect(await git(root, ["status", "--porcelain"])).toBe(statusBefore);
  });
});
