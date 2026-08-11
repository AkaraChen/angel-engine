import type { Db } from "../../platform/db";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Cause, Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  root: "",
}));

vi.mock("./git", () => ({
  projectGitStatus: () =>
    Effect.succeed({
      isDirty: false,
      isGitRepository: true,
      path: mocks.root,
      projectId: "project-1",
      root: mocks.root,
    }),
}));

import { readProjectConfig, updateProjectConfig } from "./settings";

const tempRoots: string[] = [];

async function makeProjectRoot() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "project-settings-"));
  tempRoots.push(directory);
  mocks.root = directory;
  return directory;
}

function configPathOf(root: string) {
  return path.join(root, "2code.json");
}

/**
 * `projectGitStatus` is mocked away, so nothing in these effects touches the
 * database and the `Db` requirement can be dropped before running them.
 */
async function run<A, E>(effect: Effect.Effect<A, E, Db>) {
  const exit = await Effect.runPromiseExit(
    effect as unknown as Effect.Effect<A, E, never>,
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

function readConfig(projectId = "project-1") {
  return run(readProjectConfig({ projectId }));
}

async function readConfigFileOf(root: string): Promise<unknown> {
  return JSON.parse(await readFile(configPathOf(root), "utf8")) as unknown;
}

beforeEach(() => {
  mocks.root = "";
});

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map(async (directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
  );
});

describe("readProjectConfig", () => {
  it("reports an empty setup script when no config file exists", async () => {
    const root = await makeProjectRoot();

    const config = await readConfig();

    expect(config).toEqual({
      configPath: configPathOf(root),
      exists: false,
      legacyInitScript: [],
      projectId: "project-1",
      runScript: "",
      scriptShell: "auto",
      setupScript: [],
      teardownScript: [],
    });
  });

  it("reads the setup script from an existing config file", async () => {
    const root = await makeProjectRoot();
    await writeFile(
      configPathOf(root),
      JSON.stringify({ setup_script: ["bun install", "bun run build"] }),
      "utf8",
    );

    const config = await readConfig();

    expect(config.exists).toBe(true);
    expect(config.runScript).toBe("");
    expect(config.setupScript).toEqual(["bun install", "bun run build"]);
    expect(config.teardownScript).toEqual([]);
  });

  it("treats a missing setup_script key as an empty setup script", async () => {
    const root = await makeProjectRoot();
    await writeFile(
      configPathOf(root),
      JSON.stringify({ terminal_templates: [] }),
      "utf8",
    );

    const config = await readConfig();

    expect(config.exists).toBe(true);
    expect(config.setupScript).toEqual([]);
  });

  it("fails on invalid JSON instead of reporting empty settings", async () => {
    const root = await makeProjectRoot();
    await writeFile(configPathOf(root), "{ not json", "utf8");

    await expect(readConfig()).rejects.toMatchObject({
      code: "project-config-invalid",
    });
  });

  it("fails when setup_script is not an array of strings", async () => {
    const root = await makeProjectRoot();
    await writeFile(
      configPathOf(root),
      JSON.stringify({ setup_script: "bun install" }),
      "utf8",
    );

    await expect(readConfig()).rejects.toMatchObject({
      code: "project-config-invalid",
    });
  });
});

describe("updateProjectConfig", () => {
  it("creates the config file when it does not exist", async () => {
    const root = await makeProjectRoot();

    const result = await run(
      updateProjectConfig({
        projectId: "project-1",
        runScript: "",
        scriptShell: "auto",
        setupScript: ["bun install"],
        teardownScript: [],
      }),
    );

    expect(result.exists).toBe(true);
    await expect(readConfigFileOf(root)).resolves.toEqual({
      run_script: "",
      script_shell: "auto",
      setup_script: ["bun install"],
      teardown_script: [],
    });
  });

  it("preserves unknown keys when updating the setup script", async () => {
    const root = await makeProjectRoot();
    await writeFile(
      configPathOf(root),
      JSON.stringify({
        setup_script: ["old"],
        teardown_script: ["docker compose down"],
        terminal_templates: [{ commands: ["bun start"], name: "Start" }],
      }),
      "utf8",
    );

    await run(
      updateProjectConfig({
        projectId: "project-1",
        runScript: "bun dev",
        scriptShell: "auto",
        setupScript: ["bun install"],
        teardownScript: ["docker compose down"],
      }),
    );

    await expect(readConfigFileOf(root)).resolves.toEqual({
      run_script: "bun dev",
      script_shell: "auto",
      setup_script: ["bun install"],
      teardown_script: ["docker compose down"],
      terminal_templates: [{ commands: ["bun start"], name: "Start" }],
    });
  });

  it("trims commands and drops blank entries", async () => {
    const root = await makeProjectRoot();

    const result = await run(
      updateProjectConfig({
        projectId: "project-1",
        runScript: "  bun dev  ",
        scriptShell: "auto",
        setupScript: ["  bun install  ", "", "   ", "bun run build"],
        teardownScript: ["  docker compose down  ", ""],
      }),
    );

    expect(result.setupScript).toEqual(["bun install", "bun run build"]);
    expect(result.runScript).toBe("bun dev");
    expect(result.teardownScript).toEqual(["docker compose down"]);
    await expect(readConfigFileOf(root)).resolves.toEqual({
      run_script: "bun dev",
      script_shell: "auto",
      setup_script: ["bun install", "bun run build"],
      teardown_script: ["docker compose down"],
    });
  });

  it("migrates init_script only through an explicit config update", async () => {
    const root = await makeProjectRoot();
    await writeFile(
      configPathOf(root),
      JSON.stringify({ init_script: ["bun install"] }),
      "utf8",
    );
    expect((await readConfig()).legacyInitScript).toEqual(["bun install"]);

    await run(
      updateProjectConfig({
        projectId: "project-1",
        runScript: "",
        scriptShell: "auto",
        setupScript: ["bun install"],
        teardownScript: [],
      }),
    );

    await expect(readConfigFileOf(root)).resolves.toEqual({
      run_script: "",
      script_shell: "auto",
      setup_script: ["bun install"],
      teardown_script: [],
    });
  });

  it("refuses to overwrite a config file that is not valid JSON", async () => {
    const root = await makeProjectRoot();
    await writeFile(configPathOf(root), "{ not json", "utf8");

    await expect(
      run(
        updateProjectConfig({
          projectId: "project-1",
          runScript: "",
          scriptShell: "auto",
          setupScript: ["bun install"],
          teardownScript: [],
        }),
      ),
    ).rejects.toMatchObject({ code: "project-config-invalid" });
    await expect(readFile(configPathOf(root), "utf8")).resolves.toBe(
      "{ not json",
    );
  });

  it("saves a setup script the runner then loads back", async () => {
    await makeProjectRoot();

    await run(
      updateProjectConfig({
        projectId: "project-1",
        runScript: "",
        scriptShell: "auto",
        setupScript: ["bun install"],
        teardownScript: [],
      }),
    );

    const config = await readConfig();
    expect(config.setupScript).toEqual(["bun install"]);
  });
});
