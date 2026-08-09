import {
  access,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Cause, Effect, Exit } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { DaemonError } from "../../platform/errors";
import {
  buildUntrackedPatch,
  gitOutput,
  parseAheadBehindCounts,
  parseGitStatusOutput,
} from "./git";
import {
  workspaceGitDiff,
  workspaceGitPush,
  workspaceWriteFile,
} from "./service";

const tempRoots: string[] = [];

// Each git-backed case shells out a dozen times; the 5s default is too tight
// on a loaded machine.
const gitTestTimeoutMs = 60_000;

async function runWorkspaceWriteFile(
  root: string,
  treePath: string,
  content: string,
) {
  const exit = await Effect.runPromiseExit(
    workspaceWriteFile(root, treePath, content),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

async function makeTempDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "workspace-tools-"));
  tempRoots.push(directory);
  return directory;
}

async function runEffect<A>(effect: Effect.Effect<A, DaemonError>) {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

async function runEffectFailure<A>(effect: Effect.Effect<A, DaemonError>) {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    throw new Error("Expected the effect to fail.");
  }
  const failure = Cause.squash(exit.cause);
  if (!(failure instanceof DaemonError)) throw failure;
  return failure;
}

async function configureGitIdentity(root: string) {
  await gitOutput(root, ["config", "user.email", "workspace@example.test"]);
  await gitOutput(root, ["config", "user.name", "Workspace Test"]);
  await gitOutput(root, ["config", "commit.gpgsign", "false"]);
}

async function commitFile(root: string, name: string, content: string) {
  await writeFile(path.join(root, name), content);
  await gitOutput(root, ["add", "--", name]);
  await gitOutput(root, ["commit", "-m", `add ${name}`]);
}

/** A workspace with a local bare `origin`, so push tests need no network. */
async function makeRepositoryWithRemote({ push = true } = {}) {
  const remote = await makeTempDir();
  await gitOutput(remote, ["init", "--bare", "--initial-branch=main"]);
  const workspace = await makeTempDir();
  await gitOutput(workspace, ["init", "--initial-branch=main"]);
  await configureGitIdentity(workspace);
  await gitOutput(workspace, ["remote", "add", "origin", remote]);
  await commitFile(workspace, "a.txt", "a");
  if (push) {
    await gitOutput(workspace, ["push", "--set-upstream", "origin", "main"]);
  }
  return { remote, workspace };
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map(async (directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
  );
});

describe("workspaceWriteFile", () => {
  it("writes a new file inside the workspace", async () => {
    const workspace = await makeTempDir();

    await runWorkspaceWriteFile(workspace, "nested/file.txt", "x");

    await expect(
      readFile(path.join(workspace, "nested/file.txt"), "utf8"),
    ).resolves.toBe("x");
  });

  it("rejects a new file under a symlinked parent outside the workspace", async () => {
    const workspace = await makeTempDir();
    const outside = await makeTempDir();
    const escapedPath = path.join(outside, "escape.txt");
    await symlink(outside, path.join(workspace, "link"));

    await expect(
      runWorkspaceWriteFile(workspace, "link/escape.txt", "x"),
    ).rejects.toThrow(
      "Workspace file path must stay inside the workspace root.",
    );
    await expect(access(escapedPath)).rejects.toThrow();
  });
});

describe("buildUntrackedPatch", () => {
  it("returns binary files as preview-specific skipped files", async () => {
    const workspace = await makeTempDir();
    await writeFile(path.join(workspace, "image.png"), Buffer.from([0, 1, 2]));

    const result = await buildUntrackedPatch(workspace, [
      {
        conflicted: false,
        path: "image.png",
        staged: false,
        status: "untracked",
        unstaged: true,
      },
    ]);

    expect(result.patch).toBe("");
    expect(result.warnings).toEqual([]);
    expect(result.skippedFiles).toEqual([
      {
        path: "image.png",
        reason: "binary",
        size: 3,
      },
    ]);
  });
});

describe("parseGitStatusOutput", () => {
  it("marks unmerged entries as conflicted", () => {
    const entries = parseGitStatusOutput(
      ["UU both.ts", "AA added.ts", " M plain.ts"].join("\0"),
    );

    expect(
      entries.map((entry) => [entry.path, entry.conflicted]),
    ).toStrictEqual([
      ["both.ts", true],
      ["added.ts", true],
      ["plain.ts", false],
    ]);
  });
});

describe("parseAheadBehindCounts", () => {
  it("reads the left/right counts and tolerates empty output", () => {
    expect(parseAheadBehindCounts("2\t3")).toStrictEqual({
      ahead: 2,
      behind: 3,
    });
    expect(parseAheadBehindCounts("")).toStrictEqual({ ahead: 0, behind: 0 });
  });
});

describe("workspaceGitDiff branch status", () => {
  it(
    "reports the branch, upstream, and ahead/behind counts",
    async () => {
      const { workspace } = await makeRepositoryWithRemote();
      await commitFile(workspace, "b.txt", "b");

      const result = await runEffect(workspaceGitDiff(workspace));

      expect(result.branchStatus).toStrictEqual({
        ahead: 1,
        behind: 0,
        branch: "main",
        detached: false,
        unborn: false,
        upstream: "origin/main",
      });
      expect(result.conflictedPaths).toStrictEqual([]);
    },
    gitTestTimeoutMs,
  );

  it(
    "reports no upstream for a branch that was never pushed",
    async () => {
      const workspace = await makeTempDir();
      await gitOutput(workspace, ["init", "--initial-branch=main"]);
      await configureGitIdentity(workspace);
      await commitFile(workspace, "a.txt", "a");

      const result = await runEffect(workspaceGitDiff(workspace));

      expect(result.branchStatus).toStrictEqual({
        ahead: 0,
        behind: 0,
        branch: "main",
        detached: false,
        unborn: false,
      });
    },
    gitTestTimeoutMs,
  );
});

describe("workspaceGitDiff unborn branch status", () => {
  it(
    "reports a branch with no commits as unborn",
    async () => {
      const workspace = await makeTempDir();
      await gitOutput(workspace, ["init", "--initial-branch=main"]);

      const result = await runEffect(workspaceGitDiff(workspace));

      expect(result.branchStatus).toStrictEqual({
        ahead: 0,
        behind: 0,
        branch: "main",
        detached: false,
        unborn: true,
      });
    },
    gitTestTimeoutMs,
  );
});

describe("workspaceGitPush", () => {
  it(
    "publishes a branch that has no upstream yet",
    async () => {
      const { remote, workspace } = await makeRepositoryWithRemote({
        push: false,
      });

      const result = await runEffect(workspaceGitPush({ root: workspace }));

      expect(result.remote).toBe("origin");
      expect(result.branchStatus).toStrictEqual({
        ahead: 0,
        behind: 0,
        branch: "main",
        detached: false,
        unborn: false,
        upstream: "origin/main",
      });
      await expect(
        gitOutput(remote, ["rev-parse", "refs/heads/main"]),
      ).resolves.toBe(await gitOutput(workspace, ["rev-parse", "HEAD"]));
    },
    gitTestTimeoutMs,
  );

  it(
    "rejects publishing a branch with no commits",
    async () => {
      const workspace = await makeTempDir();
      await gitOutput(workspace, ["init", "--initial-branch=main"]);

      const error = await runEffectFailure(
        workspaceGitPush({ root: workspace }),
      );

      expect(error.code).toBe("workspace-git-no-commits");
    },
    gitTestTimeoutMs,
  );

  it(
    "pushes new commits once an upstream is tracked",
    async () => {
      const { remote, workspace } = await makeRepositoryWithRemote();
      await commitFile(workspace, "b.txt", "b");

      const result = await runEffect(workspaceGitPush({ root: workspace }));

      expect(result.branchStatus.ahead).toBe(0);
      await expect(
        gitOutput(remote, ["rev-parse", "refs/heads/main"]),
      ).resolves.toBe(await gitOutput(workspace, ["rev-parse", "HEAD"]));
    },
    gitTestTimeoutMs,
  );

  it(
    "fails with an actionable code when the repository has no remote",
    async () => {
      const workspace = await makeTempDir();
      await gitOutput(workspace, ["init", "--initial-branch=main"]);
      await configureGitIdentity(workspace);
      await commitFile(workspace, "a.txt", "a");

      const error = await runEffectFailure(
        workspaceGitPush({ root: workspace }),
      );

      expect(error.code).toBe("workspace-git-no-remote");
    },
    gitTestTimeoutMs,
  );

  it(
    "classifies a rejected push instead of leaking raw git output",
    async () => {
      const { remote, workspace } = await makeRepositoryWithRemote();
      const other = await makeTempDir();
      await gitOutput(other, ["clone", remote, "."]);
      await configureGitIdentity(other);
      await commitFile(other, "theirs.txt", "theirs");
      await gitOutput(other, ["push"]);
      await commitFile(workspace, "mine.txt", "mine");

      const error = await runEffectFailure(
        workspaceGitPush({ root: workspace }),
      );

      expect(error.code).toBe("workspace-git-push-rejected");
    },
    gitTestTimeoutMs,
  );
});
