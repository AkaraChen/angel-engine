import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Db } from "../../platform/db";
import {
  createProjectWorktree,
  discardManagedCreatedWorktree,
  discardCreatedWorktree,
  projectGitStatus,
  removeManagedWorktree,
} from "./git";
import { projectSetupLifecycle } from "./setup-lifecycle";

const execFileAsync = promisify(execFile);
const getProjectMock = vi.hoisted(() => vi.fn());

vi.mock("./repository", () => ({
  getProject: (id: string) => getProjectMock(id),
}));

const testDbLayer = Layer.succeed(
  Db,
  new Db({ database: Effect.die("Database is not used in this test.") }),
);

describe("project worktree setup", () => {
  let projectRoot: string;
  let worktreeParent: string;
  let createdWorktree: { branch: string; cwd: string } | undefined;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "angel-worktree-test-"),
    );
    worktreeParent = path.join(
      os.homedir(),
      ".angel-engine",
      "worktrees",
      path.basename(projectRoot),
    );
    await git(projectRoot, ["init"]);
    await fs.writeFile(path.join(projectRoot, "README.md"), "test\n");
    await git(projectRoot, ["add", "."]);
    await git(projectRoot, [
      "-c",
      "user.name=Angel Test",
      "-c",
      "user.email=angel@example.com",
      "commit",
      "-m",
      "initial",
    ]);
    getProjectMock.mockReturnValue(
      Effect.succeed({ id: "project-1", path: projectRoot }),
    );
  });

  afterEach(async () => {
    if (createdWorktree) {
      await Effect.runPromise(removeManagedWorktree(createdWorktree.cwd));
      await git(projectRoot, ["branch", "-D", createdWorktree.branch]).catch(
        () => undefined,
      );
    }
    await fs.rm(worktreeParent, { force: true, recursive: true });
    await fs.rm(projectRoot, { force: true, recursive: true });
    getProjectMock.mockReset();
  });

  it("C1 returns immediately and completes setup in the background", async () => {
    await writeConfig(["echo ready > setup.marker"]);

    createdWorktree = await createApprovedWorktree();
    await projectSetupLifecycle.waitUntilReady(createdWorktree.cwd);

    await expect(
      fs.readFile(path.join(createdWorktree.cwd, "setup.marker"), "utf8"),
    ).resolves.toContain("ready");
  }, 15_000);

  it("C2 keeps a failed setup worktree reachable", async () => {
    await writeConfig(["exit 7"]);

    createdWorktree = await createApprovedWorktree();
    await waitForSetupStatus(createdWorktree.cwd, "failed");

    await expect(directoryEntriesOrEmpty(worktreeParent)).resolves.toHaveLength(
      1,
    );
    await expect(
      git(projectRoot, ["branch", "--list", "angel/*"]),
    ).resolves.toContain(createdWorktree.branch);
  }, 15_000);

  it("C4 explicitly discards the retained directory and branch", async () => {
    await writeConfig(["exit 7"]);
    createdWorktree = await createApprovedWorktree();
    await waitForSetupStatus(createdWorktree.cwd, "failed");

    await projectSetupLifecycle.discard(createdWorktree.cwd);
    await discardManagedCreatedWorktree(projectRoot, createdWorktree.cwd);

    await expect(directoryEntriesOrEmpty(worktreeParent)).resolves.toEqual([]);
    await expect(
      git(projectRoot, ["branch", "--list", createdWorktree.branch]),
    ).resolves.toBe("");
    createdWorktree = undefined;
  }, 15_000);

  it("reports phases and removes the worktree when creation is cancelled", async () => {
    await writeConfig(["echo should-not-run"]);
    const status = await getGitStatus();
    const controller = new AbortController();
    const progress: string[] = [];

    await expect(
      Effect.runPromise(
        createProjectWorktree(
          {
            projectId: "project-1",
            setupApproval: status.worktreeSetup?.digest,
          },
          controller.signal,
          (stage, percent) => {
            progress.push(`${stage}:${percent}`);
            if (stage === "setup") controller.abort();
          },
        ).pipe(Effect.provide(testDbLayer)),
      ),
    ).rejects.toThrow();

    expect(progress).toEqual(["fetching:10", "worktree:45", "setup:75"]);
    await expect(directoryEntriesOrEmpty(worktreeParent)).resolves.toEqual([]);
    await expect(
      git(projectRoot, ["branch", "--list", "angel/*"]),
    ).resolves.toBe("");
  }, 15_000);

  it("requires approval for the exact 2code.json contents", async () => {
    await writeConfig(["echo ready"]);

    await expect(
      Effect.runPromise(
        createProjectWorktree({ projectId: "project-1" }).pipe(
          Effect.provide(testDbLayer),
        ),
      ),
    ).rejects.toThrow("requires approval");

    const status = await getGitStatus();
    await fs.writeFile(
      path.join(projectRoot, "2code.json"),
      JSON.stringify({ setup_script: ["echo changed"] }),
    );
    await expect(
      Effect.runPromise(
        createProjectWorktree({
          projectId: "project-1",
          setupApproval: status.worktreeSetup?.digest,
        }).pipe(Effect.provide(testDbLayer)),
      ),
    ).rejects.toThrow("requires approval");

    await expect(directoryEntriesOrEmpty(worktreeParent)).resolves.toEqual([]);
    await expect(
      git(projectRoot, ["branch", "--list", "angel/*"]),
    ).resolves.toBe("");
  });

  it("prunes metadata and deletes the branch only on explicit discard", async () => {
    await writeConfig(["echo ready"]);
    createdWorktree = await createApprovedWorktree();
    await projectSetupLifecycle.waitUntilReady(createdWorktree.cwd);
    await fs.rm(path.join(createdWorktree.cwd, ".git"), { force: true });

    await discardCreatedWorktree(
      projectRoot,
      createdWorktree.cwd,
      createdWorktree.branch,
    );

    await expect(directoryEntriesOrEmpty(worktreeParent)).resolves.toEqual([]);
    await expect(
      git(projectRoot, ["worktree", "list", "--porcelain"]),
    ).resolves.not.toContain(worktreeParent);
    await expect(
      git(projectRoot, ["branch", "--list", "angel/*"]),
    ).resolves.toBe("");
    createdWorktree = undefined;
  }, 15_000);

  async function createApprovedWorktree() {
    const status = await getGitStatus();
    return Effect.runPromise(
      createProjectWorktree({
        projectId: "project-1",
        setupApproval: status.worktreeSetup?.digest,
      }).pipe(Effect.provide(testDbLayer)),
    );
  }

  function getGitStatus() {
    return Effect.runPromise(
      projectGitStatus({ projectId: "project-1" }).pipe(
        Effect.provide(testDbLayer),
      ),
    );
  }

  async function writeConfig(setupScripts: string[]) {
    await fs.writeFile(
      path.join(projectRoot, "2code.json"),
      JSON.stringify({ setup_script: setupScripts }),
    );
    await git(projectRoot, ["add", "2code.json"]);
    await git(projectRoot, [
      "-c",
      "user.name=Angel Test",
      "-c",
      "user.email=angel@example.com",
      "commit",
      "-m",
      "add setup",
    ]);
  }
});

async function git(cwd: string, args: string[]) {
  const result = await execFileAsync("git", ["-C", cwd, ...args]);
  return result.stdout.trim();
}

async function directoryEntriesOrEmpty(directory: string) {
  try {
    return await fs.readdir(directory);
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      cause.code === "ENOENT"
    ) {
      return [];
    }
    throw cause;
  }
}

async function waitForSetupStatus(cwd: string, status: "failed" | "ready") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const view = await projectSetupLifecycle.view(cwd);
    if (view.snapshot.setup.status === status) return view;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Setup did not reach ${status}.`);
}
