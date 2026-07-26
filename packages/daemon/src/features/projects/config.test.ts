import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeProjectSetupScripts, loadProjectSetupConfig } from "./config";

describe("2code project config", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "angel-2code-"));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { force: true, recursive: true });
  });

  it("returns no setup config when 2code.json is missing", async () => {
    await expect(loadProjectSetupConfig(projectRoot)).resolves.toBeUndefined();
  });

  it("reads setup_script, hashes the config, and ignores other fields", async () => {
    await fs.writeFile(
      path.join(projectRoot, "2code.json"),
      JSON.stringify({
        setup_script: ["echo first", "echo second"],
        teardown_script: ["echo teardown"],
        terminal_templates: [{ commands: ["bun dev"], name: "Start" }],
      }),
    );

    await expect(loadProjectSetupConfig(projectRoot)).resolves.toEqual({
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      scripts: ["echo first", "echo second"],
    });
  });

  it("defaults a missing setup_script to an empty list", async () => {
    await fs.writeFile(path.join(projectRoot, "2code.json"), "{}");

    await expect(loadProjectSetupConfig(projectRoot)).resolves.toEqual({
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      scripts: [],
    });
  });

  it.each([
    ["invalid JSON", "not json"],
    ["a non-object config", "[]"],
    ["a non-string setup command", '{"setup_script":[42]}'],
  ])("rejects %s", async (_label, content) => {
    await fs.writeFile(path.join(projectRoot, "2code.json"), content);

    await expect(loadProjectSetupConfig(projectRoot)).rejects.toThrow(
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

  it("allows successful scripts to produce more than 1 MiB of output", async () => {
    await fs.writeFile(
      path.join(projectRoot, "large-output.cjs"),
      'process.stdout.write("x".repeat(1_200_000));\n',
    );

    await expect(
      executeProjectSetupScripts(["node large-output.cjs"], projectRoot),
    ).resolves.toBeUndefined();
  });

  it("does not expose daemon-internal environment variables", async () => {
    await fs.writeFile(
      path.join(projectRoot, "read-secret.cjs"),
      [
        'const fs = require("node:fs");',
        'fs.writeFileSync("secret.txt", process.env.ANGEL_MOBILE_PASSWORD ?? "missing");',
      ].join("\n"),
    );
    const previousSecret = process.env.ANGEL_MOBILE_PASSWORD;
    process.env.ANGEL_MOBILE_PASSWORD = "daemon-secret";

    try {
      await executeProjectSetupScripts(["node read-secret.cjs"], projectRoot);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.ANGEL_MOBILE_PASSWORD;
      } else {
        process.env.ANGEL_MOBILE_PASSWORD = previousSecret;
      }
    }

    await expect(
      fs.readFile(path.join(projectRoot, "secret.txt"), "utf8"),
    ).resolves.toBe("missing");
  });

  it("terminates setup descendants on timeout", async () => {
    const marker = path.join(projectRoot, "descendant.marker");
    await fs.writeFile(
      path.join(projectRoot, "timeout-parent.cjs"),
      [
        'const { spawn } = require("node:child_process");',
        "spawn(process.execPath, [",
        '  "-e",',
        `  ${JSON.stringify(`setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "alive"), 500);`)},`,
        '], { stdio: "ignore" });',
        "setInterval(() => undefined, 1_000);",
      ].join("\n"),
    );

    await expect(
      executeProjectSetupScripts(["node timeout-parent.cjs"], projectRoot, {
        killGraceMs: 50,
        timeoutMs: 100,
      }),
    ).rejects.toThrow("timed out");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(fs.access(marker)).rejects.toThrow();
  });

  it("terminates setup descendants when cancelled", async () => {
    const marker = path.join(projectRoot, "cancelled-descendant.marker");
    await fs.writeFile(
      path.join(projectRoot, "cancel-parent.cjs"),
      [
        'const { spawn } = require("node:child_process");',
        "spawn(process.execPath, [",
        '  "-e",',
        `  ${JSON.stringify(`setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "alive"), 500);`)},`,
        '], { stdio: "ignore" });',
        "setInterval(() => undefined, 1_000);",
      ].join("\n"),
    );
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    await expect(
      executeProjectSetupScripts(["node cancel-parent.cjs"], projectRoot, {
        killGraceMs: 50,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(fs.access(marker)).rejects.toThrow();
  });
});
