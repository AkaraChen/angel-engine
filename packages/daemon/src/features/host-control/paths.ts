import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { AGENT_SKILL_DIRECTORY_RULES } from "@angel-engine/daemon-api/agents";

export const HOST_SKILL_NAME = "angel-host";
export const HOST_CLI_NAME = "angelctl";

const require = createRequire(import.meta.url);

/**
 * Host skill package directory (`…/angel-host` containing `SKILL.md`).
 *
 * Resolution order:
 * 1. `ANGEL_HOST_SKILL_DIR` (full path to the skill package)
 * 2. `ANGEL_HOST_SKILL_ROOT` + `/angel-host`
 * 3. Packaged Electron resources: `$ANGEL_RESOURCES_PATH/skills/angel-host`
 *    or `process.resourcesPath/skills/angel-host` when present
 * 4. `@angel-engine/host-skill` package next to monorepo install
 * 5. Relative walk from this module (dev + workspace layouts)
 */
export function resolveHostSkillDir(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const direct = nonEmpty(env.ANGEL_HOST_SKILL_DIR);
  if (direct !== undefined && isSkillPackage(direct)) {
    return direct;
  }

  const root = nonEmpty(env.ANGEL_HOST_SKILL_ROOT);
  if (root !== undefined) {
    const candidate = path.join(root, HOST_SKILL_NAME);
    if (isSkillPackage(candidate)) return candidate;
  }

  const resources = resourcesPath(env);
  if (resources !== undefined) {
    const candidate = path.join(resources, "skills", HOST_SKILL_NAME);
    if (isSkillPackage(candidate)) return candidate;
  }

  try {
    const packageJson = require.resolve(
      "@angel-engine/host-skill/package.json",
    );
    const candidate = path.join(path.dirname(packageJson), HOST_SKILL_NAME);
    if (isSkillPackage(candidate)) return candidate;
  } catch {
    // Package may be absent in minimal installs.
  }

  for (const candidate of relativeSkillCandidates()) {
    if (isSkillPackage(candidate)) return candidate;
  }

  return undefined;
}

/**
 * Directory that should contain the `angelctl` binary.
 */
export function resolveHostCliBinDir(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const bin = nonEmpty(env.ANGELCTL_BIN);
  if (bin !== undefined) {
    return path.dirname(bin);
  }

  const binDir = nonEmpty(env.ANGELCTL_BIN_DIR);
  if (binDir !== undefined && isExecutable(path.join(binDir, HOST_CLI_NAME))) {
    return binDir;
  }

  const resources = resourcesPath(env);
  if (resources !== undefined) {
    const candidate = path.join(resources, "bin");
    if (isExecutable(path.join(candidate, HOST_CLI_NAME))) {
      return candidate;
    }
  }

  try {
    const packageJson = require.resolve("@angel-engine/host-cli/package.json");
    const candidate = path.join(path.dirname(packageJson), "dist", "bin");
    if (isExecutable(path.join(candidate, HOST_CLI_NAME))) {
      return candidate;
    }
  } catch {
    // optional
  }

  for (const candidate of relativeCliBinCandidates()) {
    if (isExecutable(path.join(candidate, HOST_CLI_NAME))) {
      return candidate;
    }
  }

  return undefined;
}

export function resolveHostCliBinary(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const direct = nonEmpty(env.ANGELCTL_BIN);
  if (direct !== undefined && isExecutable(direct)) {
    return direct;
  }
  const dir = resolveHostCliBinDir(env);
  if (dir === undefined) return undefined;
  const binary = path.join(dir, HOST_CLI_NAME);
  return isExecutable(binary) ? binary : undefined;
}

/**
 * Unique writable global skill directories derived from catalog rules.
 * Skips absolute system paths like `/etc/codex/skills`.
 */
export function runtimeGlobalSkillDirs(
  homeDirectory: string = os.homedir(),
): string[] {
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const rules of Object.values(AGENT_SKILL_DIRECTORY_RULES)) {
    if (rules === undefined) continue;
    for (const dir of rules.globalDirs) {
      if (dir.startsWith("/etc/")) continue;
      const expanded = expandHomePath(dir, homeDirectory);
      if (seen.has(expanded)) continue;
      seen.add(expanded);
      dirs.push(expanded);
    }
  }
  // Always include the shared agents skill root when not already listed.
  const shared = path.join(homeDirectory, ".agents", "skills");
  if (!seen.has(shared)) {
    dirs.push(shared);
  }
  return dirs;
}

export function isHostControlEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.ANGEL_HOST_CONTROL?.trim().toLowerCase();
  if (raw === undefined || raw.length === 0) {
    return true;
  }
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function relativeSkillCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    // Bundled: packages/daemon/dist → ../.. = packages
    path.resolve(here, "../../host-skill", HOST_SKILL_NAME),
    // Source: packages/daemon/src/features/host-control → ../../../../ = packages
    path.resolve(here, "../../../../host-skill", HOST_SKILL_NAME),
    path.resolve(here, "../../../host-skill", HOST_SKILL_NAME),
  ];
}

function relativeCliBinCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(here, "../../host-cli/dist/bin"),
    path.resolve(here, "../../../../host-cli/dist/bin"),
    path.resolve(here, "../../../host-cli/dist/bin"),
  ];
}

function isSkillPackage(dir: string): boolean {
  return isReadable(path.join(dir, "SKILL.md"));
}

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isReadable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function expandHomePath(value: string, homeDirectory: string): string {
  if (value === "~") return homeDirectory;
  if (value.startsWith("~/")) {
    return path.join(homeDirectory, value.slice(2));
  }
  return value;
}

function resourcesPath(env: NodeJS.ProcessEnv): string | undefined {
  const fromEnv = nonEmpty(env.ANGEL_RESOURCES_PATH);
  if (fromEnv !== undefined) return fromEnv;
  const fromProcess = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath;
  return typeof fromProcess === "string" && fromProcess.length > 0
    ? fromProcess
    : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
