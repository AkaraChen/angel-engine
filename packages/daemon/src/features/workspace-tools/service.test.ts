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

import { buildUntrackedPatch } from "./git";
import { workspaceWriteFile } from "./service";

const tempRoots: string[] = [];

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
