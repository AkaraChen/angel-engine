/**
 * Locate the Electron Forge prepackaged app for the current (or given) platform.
 *
 * Forge writes `out/<ProductName>-<platform>-<arch>/`:
 *   - macOS: that directory contains `<ProductName>.app`
 *   - Linux / Windows: that directory is the prepackaged app itself
 */

const fs = require("node:fs");
const path = require("node:path");

const PRODUCT_NAME = "Angel Engine";

/**
 * @param {string} outDir
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 */
function preferredPackagedPath(
  outDir,
  platform = process.platform,
  arch = process.arch,
) {
  const packageDir = path.join(outDir, `${PRODUCT_NAME}-${platform}-${arch}`);
  if (platform === "darwin") {
    return path.join(packageDir, `${PRODUCT_NAME}.app`);
  }
  return packageDir;
}

/**
 * Map a Forge package result path to the path electron-builder --prepackaged wants.
 * @param {string} packagedPath
 * @param {NodeJS.Platform} [platform]
 */
function resolvePrepackagedPath(packagedPath, platform = process.platform) {
  if (platform === "darwin") {
    if (packagedPath.endsWith(".app")) {
      return packagedPath;
    }
    const nestedApp = path.join(packagedPath, `${PRODUCT_NAME}.app`);
    if (fs.existsSync(nestedApp)) {
      return nestedApp;
    }
  }
  return packagedPath;
}

/**
 * @param {string} dir
 * @param {NodeJS.Platform} [platform]
 * @returns {string[]}
 */
function findPackagedApps(dir, platform = process.platform) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(dir, entry.name);

    if (platform === "darwin") {
      if (entry.name.endsWith(".app")) {
        found.push(entryPath);
        continue;
      }
      found.push(...findPackagedApps(entryPath, platform));
      continue;
    }

    // Linux / Windows: Forge output is `<ProductName>-<platform>-<arch>`.
    if (
      entry.name.startsWith(`${PRODUCT_NAME}-`) &&
      entry.name.includes(`-${platform}-`)
    ) {
      found.push(entryPath);
      continue;
    }

    // Recurse one level for unexpected layouts, but skip electron-builder out.
    if (entry.name === "builder" || entry.name.startsWith(".")) {
      continue;
    }
    found.push(...findPackagedApps(entryPath, platform));
  }

  return found;
}

/**
 * @param {string} recorded
 * @param {string} desktopRoot
 */
function resolveRecordedPackagedPath(recorded, desktopRoot) {
  if (path.isAbsolute(recorded)) {
    return recorded;
  }
  return path.resolve(desktopRoot, recorded);
}

/**
 * @param {string} outDir
 * @param {{
 *   platform?: NodeJS.Platform,
 *   arch?: string,
 *   packagedAppPathFile?: string,
 *   desktopRoot?: string,
 *   forgePackagedPaths?: string[],
 * }} [options]
 */
function selectPackagedApp(outDir, options = {}) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const desktopRoot = options.desktopRoot ?? path.resolve(outDir, "..");
  const preferred = preferredPackagedPath(outDir, platform, arch);

  /** @type {string[]} */
  const candidates = [];

  if (
    options.packagedAppPathFile &&
    fs.existsSync(options.packagedAppPathFile)
  ) {
    const recorded = fs
      .readFileSync(options.packagedAppPathFile, "utf8")
      .trim();
    if (recorded) {
      candidates.push(resolveRecordedPackagedPath(recorded, desktopRoot));
    }
  }

  for (const forgePath of options.forgePackagedPaths ?? []) {
    candidates.push(resolvePrepackagedPath(forgePath, platform));
  }

  candidates.push(preferred);
  candidates.push(...findPackagedApps(outDir, platform));

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    if (fs.existsSync(candidate)) {
      return { appPath: candidate, preferred, candidates: [...seen] };
    }
  }

  return { appPath: undefined, preferred, candidates: [...seen] };
}

module.exports = {
  PRODUCT_NAME,
  findPackagedApps,
  preferredPackagedPath,
  resolvePrepackagedPath,
  selectPackagedApp,
};
