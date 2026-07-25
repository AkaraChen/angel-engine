import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { DiscoveryProbe } from "./types";

const execFileAsync = promisify(execFile);

async function canAccess(candidate: string, mode: number): Promise<boolean> {
  try {
    await access(candidate, mode);
    return true;
  } catch {
    return false;
  }
}

export const systemDiscoveryProbe: DiscoveryProbe = {
  env: process.env,
  executableExists: (candidate) => canAccess(candidate, constants.X_OK),
  pathExists: (candidate) => canAccess(candidate, constants.F_OK),
  run: async (executable, args) => {
    const result = await execFileAsync(executable, [...args], {
      encoding: "utf8",
      windowsHide: true,
    });
    return { stdout: result.stdout };
  },
};

export async function findExecutableOnPath(
  executableNames: readonly string[],
  probe: DiscoveryProbe,
  platform: "linux" | "win32",
  additionalDirectories: readonly string[] = [],
): Promise<string | undefined> {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const delimiter = platform === "win32" ? ";" : ":";
  const pathDirectories = (probe.env.PATH ?? "")
    .split(delimiter)
    .filter((directory) => directory.length > 0);
  const directories = [...pathDirectories, ...additionalDirectories];
  const seen = new Set<string>();

  for (const directory of directories) {
    for (const executableName of executableNames) {
      const candidate = pathApi.join(directory, executableName);
      const key = platform === "win32" ? candidate.toLowerCase() : candidate;
      if (seen.has(key)) continue;
      seen.add(key);
      if (await probe.executableExists(candidate)) return candidate;
    }
  }

  return undefined;
}
