import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadProjectLifecycleConfig } from "./config";
import {
  executeProjectLifecycle,
  readProjectLifecycleLog,
  readProjectLifecycleSnapshot,
} from "./lifecycle";

describe("project lifecycle runtime", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "angel-lifecycle-"));
  });

  afterEach(async () => {
    await fs.rm(root, { force: true, recursive: true });
    vi.unstubAllEnvs();
  });

  it("executes setup sequentially and persists ready state and logs", async () => {
    const digest = await writeConfig({
      setup_script: [
        "echo first > order.txt",
        "echo second >> order.txt && echo setup-log",
      ],
    });

    await executeProjectLifecycle("setup", lifecycleOptions(digest));

    await expect(
      fs.readFile(path.join(root, "order.txt"), "utf8"),
    ).resolves.toMatch(/first\s+second/);
    await expect(readProjectLifecycleLog(root, "setup")).resolves.toContain(
      "setup-log",
    );
    await expect(readProjectLifecycleSnapshot(root)).resolves.toMatchObject({
      approvedDigest: digest,
      setup: { status: "ready" },
    });
  });

  it("requires reapproval when any 2code.json content changes", async () => {
    const digest = await writeConfig({ setup_script: ["echo first"] });
    await fs.writeFile(
      path.join(root, "2code.json"),
      JSON.stringify({ setup_script: ["echo changed"] }),
    );

    await expect(
      executeProjectLifecycle("setup", lifecycleOptions(digest)),
    ).rejects.toThrow("approval is required again");
    await expect(fs.access(path.join(root, "order.txt"))).rejects.toThrow();
  });

  it("cleans inherited internal variables before injecting owned run variables", async () => {
    const digest = await writeConfig({
      run_script: "node write-env.cjs",
    });
    await fs.writeFile(
      path.join(root, "write-env.cjs"),
      [
        'const fs = require("node:fs");',
        'fs.writeFileSync("env.json", JSON.stringify({',
        "  angelPort: process.env.ANGEL_WORKSPACE_PORT,",
        "  inheritedAngel: process.env.ANGEL_MOBILE_PASSWORD,",
        "  inheritedElectron: process.env.ELECTRON_RUN_AS_NODE,",
        "  port: process.env.PORT,",
        "}));",
      ].join("\n"),
    );
    vi.stubEnv("ANGEL_MOBILE_PASSWORD", "daemon-secret");
    vi.stubEnv("ANGEL_WORKSPACE_PORT", "wrong");
    vi.stubEnv("ELECTRON_RUN_AS_NODE", "1");
    vi.stubEnv("PORT", "wrong");

    await executeProjectLifecycle("run", {
      ...lifecycleOptions(digest),
      port: 43123,
    });

    await expect(readJson(path.join(root, "env.json"))).resolves.toEqual({
      angelPort: "43123",
      port: "43123",
    });
    await expect(readProjectLifecycleSnapshot(root)).resolves.toMatchObject({
      run: { code: 0, status: "exited" },
    });
  });

  it("terminates the whole process group on timeout", async () => {
    const marker = path.join(root, "descendant.marker");
    await writeParentScript("timeout-parent.cjs", marker);
    const digest = await writeConfig({
      setup_script: ["node timeout-parent.cjs"],
    });

    await expect(
      executeProjectLifecycle("setup", {
        ...lifecycleOptions(digest),
        killGraceMs: 50,
        timeoutMs: 100,
      }),
    ).rejects.toThrow("timed out");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(fs.access(marker)).rejects.toThrow();
    await expect(readProjectLifecycleSnapshot(root)).resolves.toMatchObject({
      setup: { status: "failed" },
    });
  });

  it("terminates the whole process group when cancelled", async () => {
    const marker = path.join(root, "cancelled-descendant.marker");
    await writeParentScript("cancel-parent.cjs", marker);
    const digest = await writeConfig({
      setup_script: ["node cancel-parent.cjs"],
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    await expect(
      executeProjectLifecycle("setup", {
        ...lifecycleOptions(digest),
        killGraceMs: 50,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(fs.access(marker)).rejects.toThrow();
  });

  it("records a cancelled run as stopped after terminating descendants", async () => {
    const marker = path.join(root, "run-descendant.marker");
    await writeParentScript("run-parent.cjs", marker);
    const digest = await writeConfig({ run_script: "node run-parent.cjs" });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    await expect(
      executeProjectLifecycle("run", {
        ...lifecycleOptions(digest),
        killGraceMs: 50,
        port: 43124,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(fs.access(marker)).rejects.toThrow();
    await expect(readProjectLifecycleSnapshot(root)).resolves.toMatchObject({
      run: { status: "stopped" },
    });
  });

  it("restores persisted state and log tails after a module restart", async () => {
    const digest = await writeConfig({ setup_script: ["echo restored-log"] });
    await executeProjectLifecycle("setup", lifecycleOptions(digest));

    vi.resetModules();
    const restored = await import("./lifecycle");

    await expect(
      restored.readProjectLifecycleSnapshot(root),
    ).resolves.toMatchObject({
      setup: { status: "ready" },
    });
    await expect(
      restored.readProjectLifecycleLog(root, "setup"),
    ).resolves.toContain("restored-log");
  });

  function lifecycleOptions(approvedDigest: string) {
    return {
      approvedDigest,
      projectRoot: root,
      worktreePath: root,
    };
  }

  async function writeConfig(config: Record<string, unknown>) {
    await fs.writeFile(path.join(root, "2code.json"), JSON.stringify(config));
    const loaded = await loadProjectLifecycleConfig(root);
    if (loaded === undefined) throw new Error("Expected lifecycle config.");
    return loaded.digest;
  }

  async function writeParentScript(file: string, marker: string) {
    await fs.writeFile(
      path.join(root, file),
      [
        'const { spawn } = require("node:child_process");',
        "spawn(process.execPath, [",
        '  "-e",',
        `  ${JSON.stringify(`setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "alive"), 500);`)},`,
        '], { stdio: "ignore" });',
        "setInterval(() => undefined, 1_000);",
      ].join("\n"),
    );
  }
});

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, "utf8")) as unknown;
}
