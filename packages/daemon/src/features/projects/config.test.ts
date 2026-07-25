import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeProjectSetupScripts, loadProjectSetupScripts } from "./config";

describe("2code project config", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "angel-2code-"));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { force: true, recursive: true });
  });

  it("returns no setup scripts when 2code.json is missing", async () => {
    await expect(loadProjectSetupScripts(projectRoot)).resolves.toEqual([]);
  });

  it("reads setup_script and ignores other 2code fields", async () => {
    await fs.writeFile(
      path.join(projectRoot, "2code.json"),
      JSON.stringify({
        setup_script: ["echo first", "echo second"],
        teardown_script: ["echo teardown"],
        terminal_templates: [{ commands: ["bun dev"], name: "Start" }],
      }),
    );

    await expect(loadProjectSetupScripts(projectRoot)).resolves.toEqual([
      "echo first",
      "echo second",
    ]);
  });

  it("defaults a missing setup_script to an empty list", async () => {
    await fs.writeFile(path.join(projectRoot, "2code.json"), "{}");

    await expect(loadProjectSetupScripts(projectRoot)).resolves.toEqual([]);
  });

  it.each([
    ["invalid JSON", "not json"],
    ["a non-object config", "[]"],
    ["a non-string setup command", '{"setup_script":[42]}'],
  ])("rejects %s", async (_label, content) => {
    await fs.writeFile(path.join(projectRoot, "2code.json"), content);

    await expect(loadProjectSetupScripts(projectRoot)).rejects.toThrow(
      "2code.json",
    );
  });

  it("executes setup scripts sequentially in the worktree", async () => {
    await executeProjectSetupScripts(
      ["echo first > order.txt", "echo second >> order.txt"],
      projectRoot,
    );

    await expect(
      fs.readFile(path.join(projectRoot, "order.txt"), "utf8"),
    ).resolves.toMatch(/first\s+second/);
  });

  it("stops after the first failed setup script", async () => {
    await expect(
      executeProjectSetupScripts(
        ["exit 7", "echo unexpected > marker.txt"],
        projectRoot,
      ),
    ).rejects.toThrow("setup_script failed");
    await expect(
      fs.access(path.join(projectRoot, "marker.txt")),
    ).rejects.toThrow();
  });
});
