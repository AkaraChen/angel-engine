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
    });

    await queued;
    await expect(
      fs.readFile(path.join(worktreePath, "retry.ok"), "utf8"),
    ).resolves.toContain("fixed");
    expect((await coordinator.view(worktreePath)).snapshot.setup.status).toBe(
      "ready",
    );
  });

  it("restores the complete environment context before retrying after restart", async () => {
    await start(["exit 7"]);
    await waitForStatus("failed");
    const failedSnapshot = (await coordinator.view(worktreePath)).snapshot;
    expect(failedSnapshot.setupContext).toEqual({
      baseRef: "HEAD",
      branch: "angel/test",
      projectId: "project-1",
      projectRoot,
    });
    if (
      failedSnapshot.approvedDigest === undefined ||
      failedSnapshot.setupContext === undefined
    ) {
      throw new Error("Expected persisted setup context.");
    }

    const restarted = new ProjectSetupLifecycleCoordinator();
    restarted.restore({
      approvedDigest: failedSnapshot.approvedDigest,
      context: failedSnapshot.setupContext,
      projectId: "fallback-project",
      projectRoot: path.join(projectRoot, "fallback-root"),
      worktreePath,
    });
    coordinator = restarted;

    await fs.writeFile(
      path.join(projectRoot, "2code.json"),
      JSON.stringify({
        setup_script: [
          `node -e "require('node:fs').writeFileSync('restored-env.json', JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('ANGEL_')))))"`,
        ],
      }),
    );
    const changed = await loadProjectLifecycleConfig(projectRoot);
    if (changed === undefined) throw new Error("Expected changed config.");

    coordinator.retry(worktreePath, { approvedDigest: changed.digest });
    await waitForStatus("ready");

    await expect(
      readJson(path.join(worktreePath, "restored-env.json")),
    ).resolves.toEqual({
      ANGEL_LIFECYCLE_KIND: "setup",
      ANGEL_PROJECT_ID: "project-1",
      ANGEL_SOURCE_WORKTREE_PATH: projectRoot,
      ANGEL_WORKTREE_BASE_REF: "HEAD",
      ANGEL_WORKTREE_BRANCH: "angel/test",
      ANGEL_WORKTREE_PATH: worktreePath,
    });
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
      baseRef: "HEAD",
      branch: "angel/test",
      projectId: "project-1",
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

  async function readJson(file: string): Promise<unknown> {
    return JSON.parse(await fs.readFile(file, "utf8")) as unknown;
  }
});
