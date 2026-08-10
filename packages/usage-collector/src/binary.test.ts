import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ccusageNativePackage, resolveCcusageBinary } from "./binary.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("ccusage binary resolution", () => {
  it("uses an explicit platform package map", () => {
    expect(ccusageNativePackage("darwin", "arm64")).toBe(
      "@ccusage/ccusage-darwin-arm64",
    );
    expect(ccusageNativePackage("linux", "x64")).toBe(
      "@ccusage/ccusage-linux-x64",
    );
    expect(ccusageNativePackage("aix", "x64")).toBeUndefined();
  });

  it("makes a resolved native binary executable without a package runner", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ccusage-binary-"));
    temporaryDirectories.push(directory);
    const binaryPath = path.join(directory, "ccusage");
    await writeFile(binaryPath, "fixture", { mode: 0o644 });

    await expect(
      resolveCcusageBinary("darwin", "arm64", {
        resolvePackagePath: () => binaryPath,
      }),
    ).resolves.toBe(binaryPath);
    expect((await stat(binaryPath)).mode & 0o111).not.toBe(0);
  });

  it("prefers the unpacked packaged executable", async () => {
    const resourcesPath = await mkdtemp(
      path.join(os.tmpdir(), "ccusage-resources-"),
    );
    temporaryDirectories.push(resourcesPath);
    const binaryPath = path.join(
      resourcesPath,
      "app.asar.unpacked/node_modules/@ccusage/ccusage-darwin-arm64/bin/ccusage",
    );
    await mkdir(path.dirname(binaryPath), { recursive: true });
    await writeFile(binaryPath, "fixture", { mode: 0o755 });

    await expect(
      resolveCcusageBinary("darwin", "arm64", { resourcesPath }),
    ).resolves.toBe(binaryPath);
  });

  it("resolves a workspace dependency from the collector package in dev", async () => {
    const workspace = await mkdtemp(
      path.join(os.tmpdir(), "ccusage-workspace-"),
    );
    temporaryDirectories.push(workspace);
    const desktopRoot = path.join(workspace, "desktop");
    const collectorRoot = path.join(workspace, "packages/usage-collector");
    const collectorLink = path.join(
      desktopRoot,
      "node_modules/@angel-engine/usage-collector",
    );
    const binaryPath = path.join(
      collectorRoot,
      "node_modules/@ccusage/ccusage-darwin-arm64/bin/ccusage",
    );

    await mkdir(path.join(collectorRoot, "dist"), { recursive: true });
    await mkdir(path.dirname(collectorLink), { recursive: true });
    await mkdir(path.dirname(binaryPath), { recursive: true });
    await writeFile(path.join(desktopRoot, "package.json"), "{}");
    await writeFile(
      path.join(collectorRoot, "package.json"),
      JSON.stringify({
        exports: { ".": { default: "./dist/index.js" } },
        name: "@angel-engine/usage-collector",
        type: "module",
      }),
    );
    await writeFile(path.join(collectorRoot, "dist/index.js"), "export {};");
    await writeFile(binaryPath, "fixture", { mode: 0o644 });
    await symlink(collectorRoot, collectorLink, "dir");

    await expect(
      resolveCcusageBinary("darwin", "arm64", {
        developmentRoot: desktopRoot,
      }),
    ).resolves.toBe(await realpath(binaryPath));
    expect((await stat(binaryPath)).mode & 0o111).not.toBe(0);
  });
});
