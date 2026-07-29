import { describe, expect, it } from "vitest";

import {
  generatedUpdateChannelFileForVersion,
  releaseArtifactNamesForVersion,
  releaseTypeForVersion,
  updateChannelFilesForVersion,
  updateChannelForVersion,
} from "./release-channel.cjs";

describe("updateChannelForVersion", () => {
  it("maps stable versions to the latest channel", () => {
    expect(updateChannelForVersion("1.2.3")).toBe("latest");
  });

  it("maps dotted beta versions to the beta channel", () => {
    expect(updateChannelForVersion("1.2.3-beta.4")).toBe("beta");
  });

  it.each([
    "1.0.0-beta2",
    "1.0.0-beta",
    "1.0.0-alpha.1",
    "1.0.0-beta.1.2",
    "v1.0.0",
    "1.0",
    "",
  ])("rejects %j", (version) => {
    expect(() => updateChannelForVersion(version)).toThrow(
      /Unsupported desktop version/,
    );
  });
});

describe("releaseTypeForVersion", () => {
  it("publishes stable versions as a release", () => {
    expect(releaseTypeForVersion("1.2.3")).toBe("release");
  });

  it("publishes beta versions as a pre-release", () => {
    expect(releaseTypeForVersion("1.2.3-beta.4")).toBe("prerelease");
  });
});

describe("updateChannelFilesForVersion", () => {
  it("feeds both channels from a stable release", () => {
    expect(updateChannelFilesForVersion("1.2.3")).toStrictEqual([
      "latest-mac.yml",
      "beta-mac.yml",
    ]);
  });

  it("never touches the latest channel from a beta release", () => {
    expect(updateChannelFilesForVersion("1.2.3-beta.4")).toStrictEqual([
      "beta-mac.yml",
    ]);
  });
});

describe("generatedUpdateChannelFileForVersion", () => {
  it("names the file electron-builder writes for the build channel", () => {
    expect(generatedUpdateChannelFileForVersion("1.2.3")).toBe(
      "latest-mac.yml",
    );
    expect(generatedUpdateChannelFileForVersion("1.2.3-beta.4")).toBe(
      "beta-mac.yml",
    );
  });
});

describe("releaseArtifactNamesForVersion", () => {
  it("lists installers before channel files", () => {
    expect(releaseArtifactNamesForVersion("1.2.3-beta.4")).toStrictEqual([
      "Angel-Engine-1.2.3-beta.4-arm64.dmg",
      "Angel-Engine-1.2.3-beta.4-arm64.zip",
      "Angel-Engine-1.2.3-beta.4-arm64.zip.blockmap",
      "beta-mac.yml",
    ]);
  });
});
