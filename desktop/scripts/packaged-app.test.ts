import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findPackagedApps,
  preferredPackagedPath,
  resolvePrepackagedPath,
  selectPackagedApp,
} from "./packaged-app.cjs";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempOut() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "angel-packaged-app-"));
  tempRoots.push(root);
  const outDir = path.join(root, "out");
  fs.mkdirSync(outDir, { recursive: true });
  return { root, outDir };
}

describe("preferredPackagedPath", () => {
  it("points at the .app for darwin and the forge dir elsewhere", () => {
    expect(preferredPackagedPath("/out", "darwin", "arm64")).toBe(
      path.join("/out", "Angel Engine-darwin-arm64", "Angel Engine.app"),
    );
    expect(preferredPackagedPath("/out", "linux", "x64")).toBe(
      path.join("/out", "Angel Engine-linux-x64"),
    );
    expect(preferredPackagedPath("/out", "win32", "x64")).toBe(
      path.join("/out", "Angel Engine-win32-x64"),
    );
  });
});

describe("resolvePrepackagedPath", () => {
  it("unwraps a mac package dir into the nested .app", () => {
    const { outDir } = makeTempOut();
    const packageDir = path.join(outDir, "Angel Engine-darwin-arm64");
    const appPath = path.join(packageDir, "Angel Engine.app");
    fs.mkdirSync(appPath, { recursive: true });

    expect(resolvePrepackagedPath(packageDir, "darwin")).toBe(appPath);
    expect(resolvePrepackagedPath(appPath, "darwin")).toBe(appPath);
  });

  it("returns linux/win package dirs as-is", () => {
    const { outDir } = makeTempOut();
    const packageDir = path.join(outDir, "Angel Engine-linux-x64");
    fs.mkdirSync(packageDir, { recursive: true });
    expect(resolvePrepackagedPath(packageDir, "linux")).toBe(packageDir);
  });
});

describe("findPackagedApps / selectPackagedApp", () => {
  it("discovers a linux forge package directory", () => {
    const { root, outDir } = makeTempOut();
    const packageDir = path.join(outDir, "Angel Engine-linux-x64");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, "angel-engine"), "binary");

    expect(findPackagedApps(outDir, "linux")).toStrictEqual([packageDir]);
    expect(
      selectPackagedApp(outDir, {
        platform: "linux",
        arch: "x64",
        desktopRoot: root,
      }).appPath,
    ).toBe(packageDir);
  });

  it("discovers a mac .app and prefers the recorded path file", () => {
    const { root, outDir } = makeTempOut();
    const packageDir = path.join(outDir, "Angel Engine-darwin-arm64");
    const appPath = path.join(packageDir, "Angel Engine.app");
    const otherApp = path.join(outDir, "Other.app");
    fs.mkdirSync(appPath, { recursive: true });
    fs.mkdirSync(otherApp, { recursive: true });

    const recorded = path.join(outDir, ".prepackaged-app");
    fs.writeFileSync(recorded, `${appPath}\n`);

    expect(findPackagedApps(outDir, "darwin").sort()).toStrictEqual(
      [appPath, otherApp].sort(),
    );
    expect(
      selectPackagedApp(outDir, {
        platform: "darwin",
        arch: "arm64",
        desktopRoot: root,
        packagedAppPathFile: recorded,
      }).appPath,
    ).toBe(appPath);
  });
});
