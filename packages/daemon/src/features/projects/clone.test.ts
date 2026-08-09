import type { ProjectCloneProgressEvent } from "@angel-engine/daemon-api/projects";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Db } from "../../platform/db";
import { cloneProject } from "./clone";

const execFileAsync = promisify(execFile);
const createProjectMock = vi.hoisted(() => vi.fn());
const listProjectsMock = vi.hoisted(() => vi.fn());

vi.mock("./repository", () => ({
  createProject: (input: { path: string }) => createProjectMock(input),
  listProjects: () => listProjectsMock(),
}));

const testDbLayer = Layer.succeed(
  Db,
  new Db({ database: Effect.die("Database is not used in this test.") }),
);

describe("cloneProject", () => {
  let home: string;
  let sourceRepo: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "angel-clone-home-"));
    sourceRepo = await fs.mkdtemp(path.join(os.tmpdir(), "angel-clone-src-"));
    vi.spyOn(os, "homedir").mockReturnValue(home);

    await git(sourceRepo, ["init"]);
    await fs.writeFile(path.join(sourceRepo, "README.md"), "clone me\n");
    await git(sourceRepo, ["add", "."]);
    await git(sourceRepo, [
      "-c",
      "user.name=Angel Test",
      "-c",
      "user.email=angel@example.com",
      "commit",
      "-m",
      "initial",
    ]);

    listProjectsMock.mockReturnValue(Effect.succeed([]));
    createProjectMock.mockImplementation((input: { path: string }) =>
      Effect.succeed({ id: "project-1", path: input.path }),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(home, { force: true, recursive: true });
    await fs.rm(sourceRepo, { force: true, recursive: true });
  });

  it("clones into the managed root and registers the checkout", async () => {
    const events: ProjectCloneProgressEvent[] = [];
    const result = await run(events);

    const target = path.join(
      home,
      "angel-engine",
      path.basename(path.dirname(sourceRepo)),
      path.basename(sourceRepo),
    );
    expect(result.project.path).toBe(target);
    expect(result.reusedExistingCheckout).toBe(false);
    await expect(
      fs.readFile(path.join(target, "README.md"), "utf8"),
    ).resolves.toBe("clone me\n");

    expect(events.map((event) => event.stage)).toContain("cloning");
    expect(events.at(-1)?.stage).toBe("completed");
    expect(events.every((event) => event.targetPath === target)).toBe(true);
  });

  it("adopts an existing checkout of the same remote instead of re-cloning", async () => {
    const first = await run();
    listProjectsMock.mockReturnValue(Effect.succeed([first.project]));
    createProjectMock.mockImplementation(() =>
      Effect.die("An adopted checkout must not be registered twice."),
    );

    const second = await run();

    expect(second.reusedExistingCheckout).toBe(true);
    expect(second.project).toEqual(first.project);
  });

  it("refuses a destination holding unrelated files", async () => {
    const target = path.join(
      home,
      "angel-engine",
      path.basename(path.dirname(sourceRepo)),
      path.basename(sourceRepo),
    );
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, "notes.txt"), "mine\n");

    await expect(run()).rejects.toThrow(/already exists/);
  });

  it("rejects a source that is not a git remote", async () => {
    await expect(
      Effect.runPromise(
        cloneProject({ url: "not a url" }, () => {}).pipe(
          Effect.provide(testDbLayer),
        ),
      ),
    ).rejects.toThrow();
  });

  async function run(events: ProjectCloneProgressEvent[] = []) {
    return Effect.runPromise(
      cloneProject({ url: `file://${sourceRepo}` }, (event) => {
        events.push(event);
      }).pipe(Effect.provide(testDbLayer)),
    );
  }
});

async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}
