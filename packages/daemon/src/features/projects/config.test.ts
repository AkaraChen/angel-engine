import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadProjectLifecycleConfig } from "./config";

describe("2code project config", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "angel-2code-"));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { force: true, recursive: true });
  });

  it("returns no setup config when 2code.json is missing", async () => {
    await expect(
      loadProjectLifecycleConfig(projectRoot),
    ).resolves.toBeUndefined();
  });

  it("reads setup_script, hashes the config, and ignores other fields", async () => {
    await fs.writeFile(
      path.join(projectRoot, "2code.json"),
      JSON.stringify({
        setup_script: ["echo first", "echo second"],
        run_script: "bun dev",
        teardown_script: ["echo teardown"],
        terminal_templates: [{ commands: ["bun dev"], name: "Start" }],
      }),
    );

    await expect(loadProjectLifecycleConfig(projectRoot)).resolves.toEqual({
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      runScript: "bun dev",
      setupScript: ["echo first", "echo second"],
      teardownScript: ["echo teardown"],
    });
  });

  it("defaults a missing setup_script to an empty list", async () => {
    await fs.writeFile(path.join(projectRoot, "2code.json"), "{}");

    await expect(loadProjectLifecycleConfig(projectRoot)).resolves.toEqual({
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      runScript: "",
      setupScript: [],
      teardownScript: [],
    });
  });

  it.each([
    ["invalid JSON", "not json"],
    ["a non-object config", "[]"],
    ["a non-string setup command", '{"setup_script":[42]}'],
  ])("rejects %s", async (_label, content) => {
    await fs.writeFile(path.join(projectRoot, "2code.json"), content);

    await expect(loadProjectLifecycleConfig(projectRoot)).rejects.toThrow(
      "2code.json",
    );
  });
});
