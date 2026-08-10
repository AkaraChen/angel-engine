import {
  accessSync,
  constants,
  cpSync,
  lstatSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";

import {
  HOST_SKILL_NAME,
  resolveHostSkillDir,
  runtimeGlobalSkillDirs,
} from "./paths";

export interface SkillMaterializeReport {
  missing: boolean;
  skillDir?: string;
  targets: string[];
}

/**
 * Install the host-owned `angel-host` skill into runtime global skill roots
 * so shell agents that only scan native directories still load it.
 *
 * Prefer symlink; fall back to recursive copy when symlinks fail.
 * MCP is not used — filesystem materialization is the Stage 4 path.
 */
export function materializeHostSkill(
  options: {
    homeDirectory?: string;
    skillDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): SkillMaterializeReport {
  const skillDir =
    options.skillDir ?? resolveHostSkillDir(options.env ?? process.env);
  if (skillDir === undefined || !isReadableSkill(skillDir)) {
    return { missing: true, skillDir, targets: [] };
  }

  const targets: string[] = [];
  for (const runtimeDir of runtimeGlobalSkillDirs(options.homeDirectory)) {
    mkdirSync(runtimeDir, { recursive: true });
    const target = path.join(runtimeDir, HOST_SKILL_NAME);
    installSkillPackage(skillDir, target);
    targets.push(target);
  }

  return { missing: false, skillDir, targets };
}

function isReadableSkill(skillDir: string): boolean {
  try {
    accessSync(path.join(skillDir, "SKILL.md"), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function installSkillPackage(source: string, target: string): void {
  try {
    const existing = lstatSync(target);
    if (existing.isDirectory() && !existing.isSymbolicLink()) {
      rmSync(target, { force: true, recursive: true });
    } else {
      rmSync(target, { force: true });
    }
  } catch {
    // target does not exist
  }

  try {
    symlinkSync(source, target, "dir");
  } catch {
    cpSync(source, target, { dereference: true, recursive: true });
  }
}
