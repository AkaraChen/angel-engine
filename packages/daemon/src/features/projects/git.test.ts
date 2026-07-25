import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Db } from "../../platform/db";
import { createProjectWorktree, removeManagedWorktree } from "./git";

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

    createdWorktree = await Effect.runPromise(
      createProjectWorktree({ projectId: "project-1" }).pipe(
        Effect.provide(testDbLayer),
      ),
    );

    await expect(
      fs.readFile(path.join(createdWorktree.cwd, "setup.marker"), "utf8"),
    ).resolves.toContain("ready");
  });

  it("rolls back the worktree and branch when setup fails", async () => {
    await writeConfig(["exit 7"]);

    await expect(
      Effect.runPromise(
        createProjectWorktree({ projectId: "project-1" }).pipe(
          Effect.provide(testDbLayer),
        ),
      ),
    ).rejects.toThrow("2code.json setup_script failed");

    await expect(fs.readdir(worktreeParent)).resolves.toEqual([]);
    await expect(
      git(projectRoot, ["branch", "--list", "angel/*"]),
    ).resolves.toBe("");
  });

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
