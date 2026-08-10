import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadProjectLifecycleConfig } from "./config";
import {
  type LifecycleProcessAdapter,
  type LifecycleProcessSession,
  ProjectLifecycleConflictError,
  ProjectLifecycleExecutionError,
  ProjectLifecycleRuntime,
} from "./lifecycle";

const execFileAsync = promisify(execFile);

describe("project lifecycle runtime", () => {
  let root: string;
  let storageRoot: string;
  let runtime: ProjectLifecycleRuntime;

  beforeEach(async () => {
    root = await fs.mkdtemp(
      path.join(os.tmpdir(), "angel-lifecycle-worktree-"),
    );
    storageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "angel-lifecycle-state-"),
    );
    runtime = new ProjectLifecycleRuntime({ storageRoot });
  });

  afterEach(async () => {
    await runtime.shutdown();
    await Promise.all(
      [root, storageRoot].map((directory) =>
        fs.rm(directory, { force: true, recursive: true }),
      ),
    );
    vi.unstubAllEnvs();
  });

  it("stores artifacts outside an untrusted worktree and keeps git status clean", async () => {
    const victim = path.join(storageRoot, "victim");
    await fs.mkdir(victim);
    await fs.symlink(victim, path.join(root, ".angel"));
    const digest = await writeConfig({ setup_script: ["echo safe-log"] });
    await git(["init"]);
    await git(["add", "."]);
    await git([
      "-c",
      "user.name=Angel Test",
      "-c",
      "user.email=angel@example.com",
      "commit",
      "-m",
      "fixture",
    ]);

    await runtime.execute("setup", lifecycleOptions(digest));

    await expect(fs.readdir(victim)).resolves.toEqual([]);
    await expect(git(["status", "--porcelain"])).resolves.toBe("");
    expect(runtime.artifactDirectory(root).startsWith(storageRoot)).toBe(true);
    await expect(runtime.log(root, "setup")).resolves.toContain("safe-log");
  });

  it("requires reapproval when any 2code.json content changes", async () => {
    const digest = await writeConfig({ setup_script: ["echo first"] });
    await fs.writeFile(
      path.join(root, "2code.json"),
      JSON.stringify({ setup_script: ["echo changed"] }),
    );

    await expect(
      runtime.execute("setup", lifecycleOptions(digest)),
    ).rejects.toThrow("approval is required again");
  });

  it("serializes cross-track state updates without losing either track", async () => {
    await writeDelayScript();
    const digest = await writeConfig({
      setup_script: ["node delay.cjs setup"],
      teardown_script: ["node delay.cjs teardown"],
    });

    await Promise.all([
      runtime.execute("setup", lifecycleOptions(digest)),
      runtime.execute("teardown", lifecycleOptions(digest)),
    ]);

    await expect(runtime.snapshot(root)).resolves.toMatchObject({
      setup: { status: "ready" },
      teardown: { status: "done" },
    });
    await expect(runtime.log(root, "setup")).resolves.toContain("setup");
    await expect(runtime.log(root, "teardown")).resolves.toContain("teardown");
  });

  it("rejects a duplicate lifecycle on the same track", async () => {
    await writeDelayScript();
    const digest = await writeConfig({
      setup_script: ["node delay.cjs setup"],
    });
    const first = runtime.execute("setup", lifecycleOptions(digest));
    await waitFor(
      () => runtime.snapshot(root),
      (snapshot) => snapshot.setup.status === "running",
    );

    await expect(
      runtime.execute("setup", lifecycleOptions(digest)),
    ).rejects.toBeInstanceOf(ProjectLifecycleConflictError);
    await first;
  });

  it("owns run handles and supports stop plus duplicate-start conflicts", async () => {
    const marker = path.join(root, "run-descendant.marker");
    await writeParentScript("run-parent.cjs", marker);
    const digest = await writeConfig({ run_script: "node run-parent.cjs" });

    const started = await runtime.startRun({
      ...lifecycleOptions(digest),
      killGraceMs: 50,
      port: 43124,
    });
    expect(started.snapshot.run).toMatchObject({
      port: 43124,
      status: "running",
    });
    await expect(
      runtime.startRun({ ...lifecycleOptions(digest), port: 43125 }),
    ).rejects.toBeInstanceOf(ProjectLifecycleConflictError);

    await runtime.stopRun(root);
    await new Promise((resolve) => setTimeout(resolve, 700));

    await expect(fs.access(marker)).rejects.toThrow();
    await expect(runtime.snapshot(root)).resolves.toMatchObject({
      run: { status: "stopped" },
    });
  });

  it("stops and awaits a run while its process session is still starting", async () => {
    const adapter = new PendingProcessAdapter();
    runtime = new ProjectLifecycleRuntime({
      runProcessAdapter: adapter,
      storageRoot,
    });
    const digest = await writeConfig({ run_script: "dev-server" });
    const startResult = runtime
      .startRun({ ...lifecycleOptions(digest), port: 43128 })
      .catch((cause: unknown) => cause);

    await adapter.entered.promise;
    await expect(runtime.snapshot(root)).resolves.toMatchObject({
      run: { port: 43128, status: "starting" },
    });
    let stopSettled = false;
    const stopping = runtime.stopRun(root).then((snapshot) => {
      stopSettled = true;
      return snapshot;
    });
    await adapter.cancellationObserved.promise;
    await Promise.resolve();
    expect(stopSettled).toBe(false);
    adapter.releaseCancellation.resolve();
    await stopping;

    await expect(startResult).resolves.toMatchObject({
      failure: { reason: "cancelled" },
    });
    expect(adapter.cancelled).toBe(true);
    await expect(runtime.snapshot(root)).resolves.toMatchObject({
      run: { status: "stopped" },
    });
  });

  it("shuts down and awaits a run while its process session is still starting", async () => {
    const adapter = new PendingProcessAdapter();
    runtime = new ProjectLifecycleRuntime({
      runProcessAdapter: adapter,
      storageRoot,
    });
    const digest = await writeConfig({ run_script: "dev-server" });
    const startResult = runtime
      .startRun({ ...lifecycleOptions(digest), port: 43129 })
      .catch((cause: unknown) => cause);

    await adapter.entered.promise;
    await expect(runtime.snapshot(root)).resolves.toMatchObject({
      run: { port: 43129, status: "starting" },
    });
    let shutdownSettled = false;
    const shutdown = runtime.shutdown().then(() => {
      shutdownSettled = true;
    });
    await adapter.cancellationObserved.promise;
    await Promise.resolve();
    expect(shutdownSettled).toBe(false);
    adapter.releaseCancellation.resolve();
    await shutdown;

    await expect(startResult).resolves.toMatchObject({
      failure: { reason: "cancelled" },
    });
    expect(adapter.cancelled).toBe(true);
    await expect(runtime.snapshot(root)).resolves.toMatchObject({
      run: { status: "stopped" },
    });
  });

  it("shutdown terminates every registered run", async () => {
    const secondRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "angel-lifecycle-worktree-"),
    );
    try {
      const digest = await writeConfig({ run_script: "node run-parent.cjs" });
      await writeParentScript(
        "run-parent.cjs",
        path.join(root, "first.marker"),
      );
      await fs.copyFile(
        path.join(root, "run-parent.cjs"),
        path.join(secondRoot, "run-parent.cjs"),
      );
      await Promise.all([
        runtime.startRun({ ...lifecycleOptions(digest), port: 43126 }),
        runtime.startRun({
          ...lifecycleOptions(digest),
          port: 43127,
          worktreePath: secondRoot,
        }),
      ]);

      await runtime.shutdown();

      await expect(runtime.snapshot(root)).resolves.toMatchObject({
        run: { status: "stopped" },
      });
      await expect(runtime.snapshot(secondRoot)).resolves.toMatchObject({
        run: { status: "stopped" },
      });
    } finally {
      await fs.rm(secondRoot, { force: true, recursive: true });
    }
  });

  it("cleans inherited internals before injecting owned run variables", async () => {
    const digest = await writeConfig({ run_script: "node write-env.cjs" });
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

    await runtime.startRun({ ...lifecycleOptions(digest), port: 43123 });
    await waitFor(
      () => runtime.snapshot(root),
      (snapshot) => snapshot.run.status === "exited",
    );

    await expect(readJson(path.join(root, "env.json"))).resolves.toEqual({
      angelPort: "43123",
      port: "43123",
    });
  });

  it("persists structured exit failures", async () => {
    const digest = await writeConfig({ setup_script: ["exit 7"] });

    const error = await runtime
      .execute("setup", lifecycleOptions(digest))
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ProjectLifecycleExecutionError);
    expect((error as ProjectLifecycleExecutionError).failure).toEqual({
      exitCode: 7,
      message: expect.stringContaining("code 7"),
      reason: "exit",
      signal: null,
    });
    await expect(runtime.snapshot(root)).resolves.toMatchObject({
      setup: {
        failure: { exitCode: 7, reason: "exit", signal: null },
        status: "failed",
      },
    });
  });

  it("terminates descendants on timeout and persists its structured reason", async () => {
    const marker = path.join(root, "timeout-descendant.marker");
    await writeParentScript("timeout-parent.cjs", marker);
    const digest = await writeConfig({
      setup_script: ["node timeout-parent.cjs"],
    });

    await expect(
      runtime.execute("setup", {
        ...lifecycleOptions(digest),
        killGraceMs: 50,
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ failure: { reason: "timeout" } });
    await new Promise((resolve) => setTimeout(resolve, 700));

    await expect(fs.access(marker)).rejects.toThrow();
    await expect(runtime.snapshot(root)).resolves.toMatchObject({
      setup: { failure: { reason: "timeout" }, status: "failed" },
    });
  });

  it("restores valid persisted state after a runtime restart", async () => {
    const digest = await writeConfig({ setup_script: ["echo restored-log"] });
    await runtime.execute("setup", lifecycleOptions(digest));

    const restored = new ProjectLifecycleRuntime({ storageRoot });

    await expect(restored.snapshot(root)).resolves.toMatchObject({
      setup: { status: "ready" },
    });
    await expect(restored.log(root, "setup")).resolves.toContain(
      "restored-log",
    );
  });

  it.each([
    ["malformed JSON", "not-json"],
    ["an unsupported version", JSON.stringify({ version: 2 })],
    [
      "an invalid state shape",
      JSON.stringify({
        run: { status: "running" },
        setup: { status: "idle" },
        teardown: { status: "idle" },
        updatedAt: new Date().toISOString(),
        version: 1,
      }),
    ],
  ])("quarantines %s instead of trusting the snapshot", async (_label, content) => {
    const artifactDirectory = runtime.artifactDirectory(root);
    await fs.mkdir(artifactDirectory, { recursive: true });
    await fs.writeFile(path.join(artifactDirectory, "lifecycle.json"), content);

    const restored = new ProjectLifecycleRuntime({ storageRoot });
    await expect(restored.snapshot(root)).resolves.toMatchObject({
      run: { status: "stopped" },
      setup: { status: "idle" },
      teardown: { status: "idle" },
      version: 1,
    });
    expect(
      (await fs.readdir(artifactDirectory)).some((file) =>
        file.startsWith("lifecycle.json.corrupt-"),
      ),
    ).toBe(true);
  });

  function lifecycleOptions(approvedDigest: string) {
    return { approvedDigest, projectRoot: root, worktreePath: root };
  }

  async function writeConfig(config: Record<string, unknown>) {
    await fs.writeFile(path.join(root, "2code.json"), JSON.stringify(config));
    const loaded = await loadProjectLifecycleConfig(root);
    if (loaded === undefined) throw new Error("Expected lifecycle config.");
    return loaded.digest;
  }

  async function writeDelayScript() {
    await fs.writeFile(
      path.join(root, "delay.cjs"),
      "setTimeout(() => console.log(process.argv[2]), 150);\n",
    );
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

  async function git(args: string[]) {
    const result = await execFileAsync("git", ["-C", root, ...args]);
    return result.stdout.trim();
  }
});

async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for lifecycle state.");
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, "utf8")) as unknown;
}

class PendingProcessAdapter implements LifecycleProcessAdapter {
  cancelled = false;
  readonly cancellationObserved = testDeferred<void>();
  readonly entered = testDeferred<void>();
  readonly releaseCancellation = testDeferred<void>();

  async start(
    options: Parameters<LifecycleProcessAdapter["start"]>[0],
  ): Promise<LifecycleProcessSession> {
    this.entered.resolve();
    await new Promise<void>((resolve) => {
      const cancel = () => {
        this.cancelled = true;
        this.cancellationObserved.resolve();
        resolve();
      };
      options.signal?.addEventListener("abort", cancel, { once: true });
      if (options.signal?.aborted) cancel();
    });
    await this.releaseCancellation.promise;
    throw new Error("pending process session cancelled");
  }
}

function testDeferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
