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

import { buildHostControlEnvironment } from "./env";
import { materializeHostSkill } from "./materialize";
import {
  isHostControlEnabled,
  resolveHostSkillDir,
  runtimeGlobalSkillDirs,
} from "./paths";

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

describe("host-control materialize", () => {
  it("symlinks or copies angel-host into runtime skill roots", () => {
    const skillDir = makeSkillPackage();
    const home = mkdtempSync(path.join(os.tmpdir(), "angel-home-"));
    tempDirs.push(home);

    const report = materializeHostSkill({
      homeDirectory: home,
      skillDir,
    });

    expect(report.missing).toBe(false);
    expect(report.targets.length).toBeGreaterThan(0);

    const shared = path.join(
      home,
      ".agents",
      "skills",
      "angel-host",
      "SKILL.md",
    );
    expect(readFileSync(shared, "utf8")).toContain("name: angel-host");

    const claude = path.join(
      home,
      ".claude",
      "skills",
      "angel-host",
      "SKILL.md",
    );
    expect(readFileSync(claude, "utf8")).toContain("name: angel-host");
  });

  it("reports missing when skill package is absent", () => {
    const report = materializeHostSkill({
      homeDirectory: mkdtempSync(path.join(os.tmpdir(), "angel-home-")),
      skillDir: "/no/such/angel-host-skill",
    });
    expect(report.missing).toBe(true);
    expect(report.targets).toEqual([]);
  });
});

describe("host-control env", () => {
  it("builds daemon connection env without echoing secrets in keys only", () => {
    const skillDir = makeSkillPackage();
    const binDir = mkdtempSync(path.join(os.tmpdir(), "angelctl-bin-"));
    tempDirs.push(binDir);
    writeFileSync(path.join(binDir, "angelctl"), "#!/bin/sh\necho ok\n", {
      mode: 0o755,
    });

    const variables = buildHostControlEnvironment(
      {
        host: "127.0.0.1",
        pid: 1,
        port: 4242,
        token: "secret-token",
        version: "test",
      },
      {
        ANGELCTL_BIN_DIR: binDir,
        ANGEL_HOST_SKILL_DIR: skillDir,
        PATH: "/usr/bin",
      },
    );

    const map = Object.fromEntries(
      variables.map((variable) => [variable.name, variable.value]),
    );
    expect(map.ANGEL_DAEMON_URL).toBe("http://127.0.0.1:4242");
    expect(map.ANGEL_DAEMON_TOKEN).toBe("secret-token");
    expect(map.ANGELCTL_BIN).toBe(path.join(binDir, "angelctl"));
    expect(map.PATH?.startsWith(`${binDir}${path.delimiter}`)).toBe(true);
    expect(map.ANGEL_HOST_SKILL_DIR).toBe(skillDir);
  });
});

describe("host-control paths", () => {
  it("resolves skill dir from env", () => {
    const skillDir = makeSkillPackage();
    expect(resolveHostSkillDir({ ANGEL_HOST_SKILL_DIR: skillDir })).toBe(
      skillDir,
    );
  });

  it("lists unique runtime skill dirs under home", () => {
    const dirs = runtimeGlobalSkillDirs("/Users/me");
    expect(dirs).toContain("/Users/me/.agents/skills");
    expect(dirs).toContain("/Users/me/.claude/skills");
    expect(dirs.some((dir) => dir.startsWith("/etc/"))).toBe(false);
  });

  it("honors ANGEL_HOST_CONTROL disable flag", () => {
    expect(isHostControlEnabled({})).toBe(true);
    expect(isHostControlEnabled({ ANGEL_HOST_CONTROL: "0" })).toBe(false);
    expect(isHostControlEnabled({ ANGEL_HOST_CONTROL: "off" })).toBe(false);
  });
});
