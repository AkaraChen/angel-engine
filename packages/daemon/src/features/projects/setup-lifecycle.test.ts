import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProjectLifecycleConfig } from "./config";
import { ProjectSetupLifecycleCoordinator } from "./setup-lifecycle";

describe("project setup lifecycle coordinator", () => {
  let projectRoot: string;
  let worktreePath: string;
  let coordinator: ProjectSetupLifecycleCoordinator;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "angel-setup-root-"));
    worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "angel-setup-wt-"));
    coordinator = new ProjectSetupLifecycleCoordinator();
  });

  afterEach(async () => {
    await coordinator.discard(worktreePath);
    await fs.rm(projectRoot, { force: true, recursive: true });
    await fs.rm(worktreePath, { force: true, recursive: true });
  });

  it("C1 queues work until setup becomes ready", async () => {
    await start(["sleep 0.05", "echo ready"]);
    let released = false;
    const queued = coordinator.waitUntilReady(worktreePath).then(() => {
      released = true;
    });

    expect(released).toBe(false);
    await queued;
    expect((await coordinator.view(worktreePath)).snapshot.setup.status).toBe(
      "ready",
    );
  });

  it("C3 reapproves a changed digest and retries in the same workspace", async () => {
    await start(["exit 7"]);
    await waitForStatus("failed");
    const queued = coordinator.waitUntilReady(worktreePath);
    await fs.writeFile(
      path.join(projectRoot, "2code.json"),
      JSON.stringify({ setup_script: ["echo fixed > retry.ok"] }),
    );
    const changed = await loadProjectLifecycleConfig(projectRoot);
    if (changed === undefined) throw new Error("Expected changed config.");

    coordinator.retry(worktreePath, {
      approvedDigest: changed.digest,
      projectRoot,
    });

    await queued;
    await expect(
      fs.readFile(path.join(worktreePath, "retry.ok"), "utf8"),
    ).resolves.toContain("fixed");
    expect((await coordinator.view(worktreePath)).snapshot.setup.status).toBe(
      "ready",
    );
  });

  it("Continue anyway releases queued work after failure", async () => {
    await start(["exit 9"]);
    await waitForStatus("failed");
    const queued = coordinator.waitUntilReady(worktreePath);

    coordinator.continue(worktreePath);

    await expect(queued).resolves.toBeUndefined();
  });

  async function start(commands: string[]) {
    await fs.writeFile(
      path.join(projectRoot, "2code.json"),
      JSON.stringify({ setup_script: commands }),
    );
    const config = await loadProjectLifecycleConfig(projectRoot);
    if (config === undefined) throw new Error("Expected lifecycle config.");
    coordinator.start({
      approvedDigest: config.digest,
      projectRoot,
      worktreePath,
    });
  }

  async function waitForStatus(status: "failed" | "ready") {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const view = await coordinator.view(worktreePath);
      if (view.snapshot.setup.status === status) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Setup did not reach ${status}.`);
  }
});
