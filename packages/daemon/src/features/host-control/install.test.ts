import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { installHostControl } from "./install";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { force: true, recursive: true });
    } catch {
      // ignore
    }
  }
});

function makeSkillPackage(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "angel-host-skill-"));
  tempDirs.push(root);
  const skillDir = path.join(root, "angel-host");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: angel-host\ndescription: test\n---\n\n# Host\n",
  );
  return skillDir;
}

function makeCliBin(): string {
  const binDir = mkdtempSync(path.join(os.tmpdir(), "angelctl-bin-"));
  tempDirs.push(binDir);
  writeFileSync(path.join(binDir, "angelctl"), "#!/bin/sh\necho ok\n", {
    mode: 0o755,
  });
  return binDir;
}

describe("installHostControl", () => {
  it("materializes skill and injects daemon env for agents", () => {
    const skillDir = makeSkillPackage();
    const binDir = makeCliBin();
    const home = mkdtempSync(path.join(os.tmpdir(), "angel-home-"));
    tempDirs.push(home);
    const targetEnv: NodeJS.ProcessEnv = {
      ANGELCTL_BIN_DIR: binDir,
      ANGEL_HOST_SKILL_DIR: skillDir,
      PATH: "/usr/bin",
    };

    const report = installHostControl(
      {
        host: "127.0.0.1",
        pid: 42,
        port: 9876,
        token: "install-token",
        version: "test",
      },
      { env: targetEnv, homeDirectory: home },
    );

    expect(report.enabled).toBe(true);
    expect(report.materialize.missing).toBe(false);
    expect(report.materialize.targetCount).toBeGreaterThan(0);
    expect(report.envNames).toEqual(
      expect.arrayContaining([
        "ANGEL_DAEMON_URL",
        "ANGEL_DAEMON_TOKEN",
        "ANGELCTL_BIN",
        "ANGELCTL_BIN_DIR",
        "PATH",
        "ANGEL_HOST_SKILL_DIR",
      ]),
    );

    expect(targetEnv.ANGEL_DAEMON_URL).toBe("http://127.0.0.1:9876");
    expect(targetEnv.ANGEL_DAEMON_TOKEN).toBe("install-token");
    expect(targetEnv.ANGELCTL_BIN).toBe(path.join(binDir, "angelctl"));
    expect(targetEnv.PATH?.startsWith(`${binDir}${path.delimiter}`)).toBe(true);

    const skillMd = path.join(
      home,
      ".agents",
      "skills",
      "angel-host",
      "SKILL.md",
    );
    expect(readFileSync(skillMd, "utf8")).toContain("name: angel-host");
  });

  it("is a no-op when host control is disabled", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "angel-home-"));
    tempDirs.push(home);
    const targetEnv: NodeJS.ProcessEnv = {
      ANGEL_HOST_CONTROL: "0",
      PATH: "/usr/bin",
    };

    const report = installHostControl(
      {
        host: "127.0.0.1",
        pid: 1,
        port: 1,
        token: "unused",
        version: "test",
      },
      { env: targetEnv, homeDirectory: home },
    );

    expect(report).toEqual({
      enabled: false,
      envNames: [],
      materialize: { missing: false, targetCount: 0 },
    });
    expect(targetEnv.ANGEL_DAEMON_URL).toBeUndefined();
    expect(targetEnv.ANGEL_DAEMON_TOKEN).toBeUndefined();
  });
});
