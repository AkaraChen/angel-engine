import { access, chmod } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

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

interface BinaryResolutionOptions {
  developmentRoot?: string;
  resolvePackagePath?: (specifier: string) => string;
  resourcesPath?: string;
}

export async function resolveCcusageBinary(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  options: BinaryResolutionOptions = {},
): Promise<string | undefined> {
  const packageName = ccusageNativePackage(platform, arch);
  if (!packageName) return undefined;

  const subpath = platform === "win32" ? "bin/ccusage.exe" : "bin/ccusage";
  const resourcesPath =
    options.resourcesPath ??
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packagedPath = path.join(
      resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      packageName,
      subpath,
    );
    if (await makeExecutable(packagedPath, platform)) {
      return packagedPath;
    }
  }

  const resolvePackagePath =
    options.resolvePackagePath ??
    ((specifier: string) =>
      resolveDevelopmentPackagePath(
        specifier,
        options.developmentRoot ?? process.cwd(),
      ));
  try {
    const binaryPath = resolvePackagePath(`${packageName}/${subpath}`);
    return (await makeExecutable(binaryPath, platform))
      ? path.resolve(binaryPath)
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveDevelopmentPackagePath(
  specifier: string,
  developmentRoot: string,
): string {
  const requireFromApp = createRequire(
    path.join(developmentRoot, "package.json"),
  );
  try {
    return requireFromApp.resolve(specifier);
  } catch {
    const collectorEntry = requireFromApp.resolve(
      "@angel-engine/usage-collector",
    );
    return createRequire(collectorEntry).resolve(specifier);
  }
}

async function makeExecutable(
  binaryPath: string,
  platform: NodeJS.Platform,
): Promise<boolean> {
  try {
    await access(binaryPath, constants.F_OK);
    if (platform !== "win32") {
      try {
        await access(binaryPath, constants.X_OK);
      } catch {
        await chmod(binaryPath, 0o755);
        await access(binaryPath, constants.X_OK);
      }
    }
    return true;
  } catch {
    return false;
  }
}
