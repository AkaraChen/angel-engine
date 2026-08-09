import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const NATIVE_PACKAGES = {
  "darwin-arm64": "@ccusage/ccusage-darwin-arm64",
  "darwin-x64": "@ccusage/ccusage-darwin-x64",
  "linux-arm64": "@ccusage/ccusage-linux-arm64",
  "linux-x64": "@ccusage/ccusage-linux-x64",
  "win32-arm64": "@ccusage/ccusage-win32-arm64",
  "win32-x64": "@ccusage/ccusage-win32-x64",
} as const;

export function ccusageNativePackage(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  return NATIVE_PACKAGES[`${platform}-${arch}` as keyof typeof NATIVE_PACKAGES];
}

export async function resolveCcusageBinary(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): Promise<string | undefined> {
  const packageName = ccusageNativePackage(platform, arch);
  if (!packageName) return undefined;

  const subpath = platform === "win32" ? "bin/ccusage.exe" : "bin/ccusage";
  let binaryPath: string;
  try {
    binaryPath = require.resolve(`${packageName}/${subpath}`);
  } catch {
    return undefined;
  }

  try {
    await access(
      binaryPath,
      platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    return path.resolve(binaryPath);
  } catch {
    return undefined;
  }
}
