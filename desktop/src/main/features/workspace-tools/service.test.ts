import { access, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { workspaceWriteFile } from "./service";

const tempRoots: string[] = [];

async function makeTempDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "workspace-tools-"));
  tempRoots.push(directory);
  return directory;
}

describe("workspaceWriteFile", () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it("writes a new file inside the workspace", async () => {
    const workspace = await makeTempDir();

    await workspaceWriteFile(workspace, "nested/file.txt", "x");

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
      workspaceWriteFile(workspace, "link/escape.txt", "x"),
    ).rejects.toThrow(
      "Workspace file path must stay inside the workspace root.",
    );
    await expect(access(escapedPath)).rejects.toThrow();
  });
});
