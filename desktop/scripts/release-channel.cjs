/**
 * Publish-side channel rules for desktop releases.
 *
 * Two channels share one GitHub repository:
 *   - stable `1.2.3`        -> GitHub release, `latest-mac.yml` + `beta-mac.yml`
 *   - beta   `1.2.3-beta.4` -> GitHub pre-release, `beta-mac.yml` only
 *
 * A stable build also feeds the beta channel so beta users roll forward onto
 * stable instead of getting stuck on the last pre-release. A beta build never
 * touches `latest-mac.yml`, which is what keeps stable users off pre-releases.
 *
 * The dotted `-beta.N` form is mandatory: electron-updater compares prerelease
 * identifiers, and an undotted tag such as `1.0.0-beta2` sorts above every
 * `1.0.0-beta.N`, silently stranding those clients.
 */

const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const BETA_VERSION_PATTERN = /^\d+\.\d+\.\d+-beta\.\d+$/;
const DEFAULT_ARCH = "arm64";

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

/** Channel files that must end up attached to the release, in upload order. */
function updateChannelFilesForVersion(version) {
  return updateChannelForVersion(version) === "beta"
    ? ["beta-mac.yml"]
    : ["latest-mac.yml", "beta-mac.yml"];
}

/**
 * Channel files electron-builder generates on its own. Anything in
 * `updateChannelFilesForVersion` beyond this has to be derived by the caller.
 */
function generatedUpdateChannelFileForVersion(version) {
  return `${updateChannelForVersion(version)}-mac.yml`;
}

function releaseArtifactNamesForVersion(version, arch = DEFAULT_ARCH) {
  return [
    `Angel-Engine-${version}-${arch}.dmg`,
    `Angel-Engine-${version}-${arch}.zip`,
    `Angel-Engine-${version}-${arch}.zip.blockmap`,
    ...updateChannelFilesForVersion(version),
  ];
}

module.exports = {
  generatedUpdateChannelFileForVersion,
  releaseArtifactNamesForVersion,
  releaseTypeForVersion,
  updateChannelFilesForVersion,
  updateChannelForVersion,
};
