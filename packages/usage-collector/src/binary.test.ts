import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
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
});
