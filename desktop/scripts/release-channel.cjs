/**
 * Publish-side channel rules for desktop releases.
 *
 * Two channels share one GitHub repository:
 *   - stable `1.2.3`        -> GitHub release, `latest-*.yml` + `beta-*.yml`
 *   - beta   `1.2.3-beta.4` -> GitHub pre-release, `beta-*.yml` only
 *
 * A stable build also feeds the beta channel so beta users roll forward onto
 * stable instead of getting stuck on the last pre-release. A beta build never
 * touches `latest-*.yml`, which is what keeps stable users off pre-releases.
 *
 * The dotted `-beta.N` form is mandatory: electron-updater compares prerelease
 * identifiers, and an undotted tag such as `1.0.0-beta2` sorts above every
 * `1.0.0-beta.N`, silently stranding those clients.
 *
 * Channel file suffixes follow electron-builder / electron-updater:
 *   - darwin: `*-mac.yml`
 *   - linux:  `*-linux.yml`
 *   - win32:  `*.yml` (no platform suffix)
 */

const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const BETA_VERSION_PATTERN = /^\d+\.\d+\.\d+-beta\.\d+$/;

/** @typedef {"darwin" | "linux" | "win32"} ReleasePlatform */

/**
 * @param {string} [platform]
 * @returns {ReleasePlatform}
 */
function normalizeReleasePlatform(platform = process.platform) {
  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    return platform;
  }
  throw new Error(
    `Unsupported desktop release platform "${platform}". Expected darwin, linux, or win32.`,
  );
}

/** Default CPU arch used in artifact names when none is supplied. */
function defaultArchForPlatform(platform = process.platform) {
  const releasePlatform = normalizeReleasePlatform(platform);
  return releasePlatform === "darwin" ? "arm64" : "x64";
}

/**
 * electron-builder embeds different arch tokens in filenames per target.
 * @param {ReleasePlatform} platform
 * @param {string} arch Node/process arch (`x64`, `arm64`, …)
 * @param {"appimage" | "deb" | "default"} kind
 */
function artifactArchToken(platform, arch, kind = "default") {
  if (platform === "linux" && kind === "deb") {
    if (arch === "x64") return "amd64";
    if (arch === "arm64") return "arm64";
    return arch;
  }
  if (platform === "linux" && kind === "appimage") {
    if (arch === "x64") return "x86_64";
    if (arch === "arm64") return "arm64";
    return arch;
  }
  return arch;
}

/** @returns {"beta" | "latest"} electron-updater channel for a version. */
function updateChannelForVersion(version) {
  if (STABLE_VERSION_PATTERN.test(version)) return "latest";
  if (BETA_VERSION_PATTERN.test(version)) return "beta";

  throw new Error(
    `Unsupported desktop version "${version}". Use "1.2.3" for a stable release or "1.2.3-beta.4" for a beta release.`,
  );
}

/** @returns {"prerelease" | "release"} electron-builder GitHub release type. */
function releaseTypeForVersion(version) {
  return updateChannelForVersion(version) === "beta" ? "prerelease" : "release";
}

/**
 * electron-updater channel file platform segment (including leading dash when
 * present). Windows has no segment: files are `latest.yml` / `beta.yml`.
 * @param {string} [platform]
 */
function updateChannelFilePlatformSuffix(platform = process.platform) {
  const releasePlatform = normalizeReleasePlatform(platform);
  if (releasePlatform === "darwin") return "-mac";
  if (releasePlatform === "linux") return "-linux";
  return "";
}

/** Channel files that must end up attached to the release, in upload order. */
function updateChannelFilesForVersion(version, platform = process.platform) {
  const suffix = updateChannelFilePlatformSuffix(platform);
  return updateChannelForVersion(version) === "beta"
    ? [`beta${suffix}.yml`]
    : [`latest${suffix}.yml`, `beta${suffix}.yml`];
}

/**
 * Channel files electron-builder generates on its own. Anything in
 * `updateChannelFilesForVersion` beyond this has to be derived by the caller.
 */
function generatedUpdateChannelFileForVersion(
  version,
  platform = process.platform,
) {
  const suffix = updateChannelFilePlatformSuffix(platform);
  return `${updateChannelForVersion(version)}${suffix}.yml`;
}

/**
 * electron-builder CLI platform flags for the host OS.
 * @param {string} [platform]
 * @returns {string[]}
 */
function electronBuilderPlatformArgs(platform = process.platform) {
  const releasePlatform = normalizeReleasePlatform(platform);
  if (releasePlatform === "darwin") {
    return ["--mac", "dmg", "zip"];
  }
  if (releasePlatform === "linux") {
    return ["--linux", "AppImage", "deb"];
  }
  return ["--win", "nsis"];
}

/**
 * Installer / update payload filenames for one platform (channel yml excluded).
 * @param {string} version
 * @param {{ platform?: string, arch?: string }} [options]
 */
function installerArtifactNamesForVersion(version, options = {}) {
  // Validate version early so callers get the same errors as channel helpers.
  updateChannelForVersion(version);

  const platform = normalizeReleasePlatform(
    options.platform ?? process.platform,
  );
  const arch = options.arch ?? defaultArchForPlatform(platform);

  if (platform === "darwin") {
    return [
      `Angel-Engine-${version}-${arch}.dmg`,
      `Angel-Engine-${version}-${arch}.zip`,
      `Angel-Engine-${version}-${arch}.zip.blockmap`,
    ];
  }

  if (platform === "linux") {
    const appImageArch = artifactArchToken(platform, arch, "appimage");
    const debArch = artifactArchToken(platform, arch, "deb");
    // AppImage embeds its block map; electron-builder does not emit a sibling
    // `.AppImage.blockmap` file the way it does for zip/nsis.
    return [
      `Angel-Engine-${version}-${appImageArch}.AppImage`,
      `Angel-Engine-${version}-${debArch}.deb`,
    ];
  }

  return [
    `Angel-Engine-${version}-${arch}.exe`,
    `Angel-Engine-${version}-${arch}.exe.blockmap`,
  ];
}

/**
 * Full release asset list for one platform: installers then channel files.
 * @param {string} version
 * @param {{ platform?: string, arch?: string }} [options]
 */
function releaseArtifactNamesForVersion(version, options = {}) {
  // Back-compat: second arg used to be a bare arch string for mac builds.
  if (typeof options === "string") {
    options = { arch: options, platform: "darwin" };
  }

  const platform = normalizeReleasePlatform(
    options.platform ?? process.platform,
  );
  return [
    ...installerArtifactNamesForVersion(version, {
      platform,
      arch: options.arch,
    }),
    ...updateChannelFilesForVersion(version, platform),
  ];
}

module.exports = {
  artifactArchToken,
  defaultArchForPlatform,
  electronBuilderPlatformArgs,
  generatedUpdateChannelFileForVersion,
  installerArtifactNamesForVersion,
  normalizeReleasePlatform,
  releaseArtifactNamesForVersion,
  releaseTypeForVersion,
  updateChannelFilePlatformSuffix,
  updateChannelFilesForVersion,
  updateChannelForVersion,
};
