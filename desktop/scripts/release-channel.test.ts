import { describe, expect, it } from "vitest";

import {
  defaultArchForPlatform,
  electronBuilderPlatformArgs,
  generatedUpdateChannelFileForVersion,
  installerArtifactNamesForVersion,
  releaseArtifactNamesForVersion,
  releaseTypeForVersion,
  updateChannelFilePlatformSuffix,
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
  it("feeds both mac channels from a stable release", () => {
    expect(updateChannelFilesForVersion("1.2.3", "darwin")).toStrictEqual([
      "latest-mac.yml",
      "beta-mac.yml",
    ]);
  });

  it("never touches the latest channel from a beta release", () => {
    expect(
      updateChannelFilesForVersion("1.2.3-beta.4", "darwin"),
    ).toStrictEqual(["beta-mac.yml"]);
  });

  it("names linux channel files with the linux suffix", () => {
    expect(updateChannelFilesForVersion("1.2.3", "linux")).toStrictEqual([
      "latest-linux.yml",
      "beta-linux.yml",
    ]);
    expect(updateChannelFilesForVersion("1.2.3-beta.4", "linux")).toStrictEqual(
      ["beta-linux.yml"],
    );
  });

  it("names windows channel files without a platform suffix", () => {
    expect(updateChannelFilesForVersion("1.2.3", "win32")).toStrictEqual([
      "latest.yml",
      "beta.yml",
    ]);
    expect(updateChannelFilesForVersion("1.2.3-beta.4", "win32")).toStrictEqual(
      ["beta.yml"],
    );
  });
});

describe("generatedUpdateChannelFileForVersion", () => {
  it("names the file electron-builder writes for the build channel", () => {
    expect(generatedUpdateChannelFileForVersion("1.2.3", "darwin")).toBe(
      "latest-mac.yml",
    );
    expect(generatedUpdateChannelFileForVersion("1.2.3-beta.4", "darwin")).toBe(
      "beta-mac.yml",
    );
    expect(generatedUpdateChannelFileForVersion("1.2.3-beta.4", "linux")).toBe(
      "beta-linux.yml",
    );
    expect(generatedUpdateChannelFileForVersion("1.2.3-beta.4", "win32")).toBe(
      "beta.yml",
    );
  });
});

describe("updateChannelFilePlatformSuffix", () => {
  it("matches electron-updater platform file naming", () => {
    expect(updateChannelFilePlatformSuffix("darwin")).toBe("-mac");
    expect(updateChannelFilePlatformSuffix("linux")).toBe("-linux");
    expect(updateChannelFilePlatformSuffix("win32")).toBe("");
  });
});

describe("defaultArchForPlatform", () => {
  it("defaults mac to arm64 and other platforms to x64", () => {
    expect(defaultArchForPlatform("darwin")).toBe("arm64");
    expect(defaultArchForPlatform("linux")).toBe("x64");
    expect(defaultArchForPlatform("win32")).toBe("x64");
  });
});

describe("electronBuilderPlatformArgs", () => {
  it("selects platform-native installer targets", () => {
    expect(electronBuilderPlatformArgs("darwin")).toStrictEqual([
      "--mac",
      "dmg",
      "zip",
    ]);
    expect(electronBuilderPlatformArgs("linux")).toStrictEqual([
      "--linux",
      "AppImage",
      "deb",
    ]);
    expect(electronBuilderPlatformArgs("win32")).toStrictEqual([
      "--win",
      "nsis",
    ]);
  });
});

describe("installerArtifactNamesForVersion", () => {
  it("lists mac installers with arm64 tokens", () => {
    expect(
      installerArtifactNamesForVersion("1.2.3-beta.4", {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toStrictEqual([
      "Angel-Engine-1.2.3-beta.4-arm64.dmg",
      "Angel-Engine-1.2.3-beta.4-arm64.zip",
      "Angel-Engine-1.2.3-beta.4-arm64.zip.blockmap",
    ]);
  });

  it("lists linux installers with deb/AppImage arch tokens", () => {
    expect(
      installerArtifactNamesForVersion("1.2.3-beta.4", {
        platform: "linux",
        arch: "x64",
      }),
    ).toStrictEqual([
      "Angel-Engine-1.2.3-beta.4-x86_64.AppImage",
      "Angel-Engine-1.2.3-beta.4-amd64.deb",
    ]);
  });

  it("lists windows nsis installers", () => {
    expect(
      installerArtifactNamesForVersion("1.2.3-beta.4", {
        platform: "win32",
        arch: "x64",
      }),
    ).toStrictEqual([
      "Angel-Engine-1.2.3-beta.4-x64.exe",
      "Angel-Engine-1.2.3-beta.4-x64.exe.blockmap",
    ]);
  });
});

describe("releaseArtifactNamesForVersion", () => {
  it("lists mac installers before channel files", () => {
    expect(
      releaseArtifactNamesForVersion("1.2.3-beta.4", {
        platform: "darwin",
        arch: "arm64",
      }),
    ).toStrictEqual([
      "Angel-Engine-1.2.3-beta.4-arm64.dmg",
      "Angel-Engine-1.2.3-beta.4-arm64.zip",
      "Angel-Engine-1.2.3-beta.4-arm64.zip.blockmap",
      "beta-mac.yml",
    ]);
  });

  it("accepts a bare arch string as the second argument for mac back-compat", () => {
    expect(releaseArtifactNamesForVersion("1.2.3", "arm64")).toStrictEqual([
      "Angel-Engine-1.2.3-arm64.dmg",
      "Angel-Engine-1.2.3-arm64.zip",
      "Angel-Engine-1.2.3-arm64.zip.blockmap",
      "latest-mac.yml",
      "beta-mac.yml",
    ]);
  });

  it("lists linux installers and channel files", () => {
    expect(
      releaseArtifactNamesForVersion("1.2.3", {
        platform: "linux",
        arch: "x64",
      }),
    ).toStrictEqual([
      "Angel-Engine-1.2.3-x86_64.AppImage",
      "Angel-Engine-1.2.3-amd64.deb",
      "latest-linux.yml",
      "beta-linux.yml",
    ]);
  });

  it("lists windows installers and channel files", () => {
    expect(
      releaseArtifactNamesForVersion("1.2.3-beta.4", {
        platform: "win32",
        arch: "x64",
      }),
    ).toStrictEqual([
      "Angel-Engine-1.2.3-beta.4-x64.exe",
      "Angel-Engine-1.2.3-beta.4-x64.exe.blockmap",
      "beta.yml",
    ]);
  });
});
