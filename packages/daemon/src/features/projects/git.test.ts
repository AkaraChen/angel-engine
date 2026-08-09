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
  discardCreatedWorktree,
  projectGitStatus,
  removeManagedWorktree,
} from "./git";

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

  it("runs 2code setup_script before returning the worktree", async () => {
    await writeConfig(["echo ready > setup.marker"]);

    createdWorktree = await createApprovedWorktree();

    await expect(
      fs.readFile(path.join(createdWorktree.cwd, "setup.marker"), "utf8"),
    ).resolves.toContain("ready");
  });

  it("retains the worktree and branch when setup fails", async () => {
    await writeConfig(["exit 7"]);

    await expect(createApprovedWorktree()).rejects.toThrow(
      "2code.json setup_script failed",
    );

    const entries = await directoryEntriesOrEmpty(worktreeParent);
    expect(entries).toHaveLength(1);
    const branch = await git(projectRoot, ["branch", "--list", "angel/*"]);
    expect(branch).toContain("angel/");
    createdWorktree = {
      branch: branch.replace(/^\*?\s*/, ""),
      cwd: path.join(worktreeParent, entries[0] ?? "missing"),
    };
    await expect(
      fs.readFile(
        path.join(createdWorktree.cwd, ".angel", "lifecycle.json"),
        "utf8",
      ),
    ).resolves.toContain('"status": "failed"');
  });

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
  });

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
  });

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
