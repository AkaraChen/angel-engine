const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

const desktopRoot = path.resolve(__dirname, "..");
const outDir = path.join(desktopRoot, "out");
const packagedAppPathFile = path.join(outDir, ".prepackaged-app");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8"),
);
const {
  electronBuilderPlatformArgs,
  generatedUpdateChannelFileForVersion,
  releaseArtifactNamesForVersion,
  releaseTypeForVersion,
  updateChannelFilesForVersion,
  updateChannelForVersion,
} = require("./release-channel.cjs");
const { selectPackagedApp } = require("./packaged-app.cjs");

// Throws on a malformed version before anything is built or published.
const version = packageJson.version;
const releaseType = releaseTypeForVersion(version);
const updateChannel = updateChannelForVersion(version);
// Resolve the JS CLI entry (not the .bin shim). On Windows, spawnSync of a
// `.cmd` wrapper fails with EINVAL unless shell:true; running the entry with
// node works on all platforms.
const electronBuilderCli = require.resolve("electron-builder/cli.js", {
  paths: [desktopRoot],
});

const publishIndex = process.argv.indexOf("--publish");
const publishMode =
  publishIndex === -1 ? "never" : process.argv[publishIndex + 1];
const waitMs = Number(
  process.env.ANGEL_ENGINE_PREPACKAGED_APP_WAIT_MS ?? 600000,
);
const pollMs = 5000;
const githubRepo = "AkaraChen/angel-engine";

if (
  !publishMode ||
  !["always", "never", "onTag", "onTagOrDraft"].includes(publishMode)
) {
  throw new Error(`Unsupported publish mode: ${publishMode}`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function directorySize(dir) {
  let size = 0;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);

    try {
      if (entry.isDirectory()) {
        size += directorySize(entryPath);
      } else {
        size += fs.statSync(entryPath).size;
      }
    } catch {
      return -1;
    }
  }

  return size;
}

function printOutTree() {
  if (!fs.existsSync(outDir)) {
    console.error(`Forge output directory does not exist: ${outDir}`);
    return;
  }

  console.error("Forge output tree:");
  try {
    execFileSync("find", [outDir, "-maxdepth", "3", "-print"], {
      cwd: desktopRoot,
      stdio: "inherit",
    });
  } catch {
    for (const entry of fs.readdirSync(outDir, { recursive: true })) {
      console.error(path.join(outDir, entry.toString()));
    }
  }
}

function selectCurrentPackage() {
  return selectPackagedApp(outDir, {
    desktopRoot,
    packagedAppPathFile,
    platform: process.platform,
    arch: process.arch,
  });
}

function waitForAppPackage() {
  const deadline = Date.now() + waitMs;
  let lastSize = -1;
  let lastAppPath;

  while (Date.now() <= deadline) {
    const { appPath } = selectCurrentPackage();

    if (appPath) {
      const size = directorySize(appPath);

      if (appPath === lastAppPath && size > 0 && size === lastSize) {
        return appPath;
      }

      lastAppPath = appPath;
      lastSize = size;
      console.log(
        `Waiting for packaged app to settle: ${path.relative(
          desktopRoot,
          appPath,
        )}`,
      );
    } else {
      console.log(
        `Waiting for Forge output: ${path.relative(desktopRoot, outDir)}`,
      );
    }

    sleep(pollMs);
  }

  return selectCurrentPackage().appPath;
}

const appPath = waitForAppPackage();

if (!appPath) {
  printOutTree();
  throw new Error(
    `No packaged app found under desktop/out for ${process.platform}/${process.arch}.`,
  );
}

console.log(`Using prepackaged app: ${path.relative(desktopRoot, appPath)}`);

const platformArgs = electronBuilderPlatformArgs(process.platform);
// Always build installers locally; GitHub upload is handled below so multi-OS
// matrix jobs can publish without racing electron-builder's release create.
execFileSync(
  process.execPath,
  [
    electronBuilderCli,
    "--prepackaged",
    appPath,
    ...platformArgs,
    "--publish",
    "never",
    `--config.publish.releaseType=${releaseType}`,
    `--config.publish.channel=${updateChannel}`,
  ],
  {
    cwd: desktopRoot,
    stdio: "inherit",
  },
);

if (publishMode !== "never") {
  const tag = `v${version}`;
  const builderOutDir = path.join(outDir, "builder");

  // A stable build has to feed the beta channel too, otherwise beta users stay
  // parked on the last pre-release. electron-builder only writes the channel
  // file it built for, so the extra channels are copies of it.
  const generatedChannelFileName = generatedUpdateChannelFileForVersion(
    version,
    process.platform,
  );
  const generatedChannelFile = path.join(
    builderOutDir,
    generatedChannelFileName,
  );

  if (!fs.existsSync(generatedChannelFile)) {
    throw new Error(
      `electron-builder did not write ${generatedChannelFileName} for the ${updateChannel} channel.`,
    );
  }

  for (const channelFile of updateChannelFilesForVersion(
    version,
    process.platform,
  )) {
    const channelFilePath = path.join(builderOutDir, channelFile);
    if (channelFilePath === generatedChannelFile) continue;

    fs.copyFileSync(generatedChannelFile, channelFilePath);
    console.log(`Derived ${channelFile} from the built update channel file.`);
  }

  const artifactNames = releaseArtifactNamesForVersion(version, {
    platform: process.platform,
    arch: process.arch,
  });
  const artifactPaths = artifactNames.map((name) =>
    path.join(builderOutDir, name),
  );
  const missingArtifacts = artifactPaths.filter((artifactPath) => {
    return !fs.existsSync(artifactPath);
  });

  if (missingArtifacts.length > 0) {
    throw new Error(
      `Missing release artifacts: ${missingArtifacts
        .map((artifactPath) => path.relative(desktopRoot, artifactPath))
        .join(", ")}`,
    );
  }

  // Concurrent matrix jobs may race on create; the loser is fine if the
  // release already exists. Upload is clobber-safe and per-asset.
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", githubRepo], {
      cwd: desktopRoot,
      stdio: "pipe",
    });
  } catch {
    const createArgs = [
      "release",
      "create",
      tag,
      "--repo",
      githubRepo,
      "--title",
      `Angel Engine ${version}`,
      "--notes",
      `Desktop release ${version}`,
    ];
    if (releaseType === "prerelease") {
      createArgs.push("--prerelease");
    }
    try {
      execFileSync("gh", createArgs, {
        cwd: desktopRoot,
        stdio: "inherit",
      });
    } catch (error) {
      // Another matrix job likely created the release first.
      console.warn(
        `Could not create GitHub release ${tag}; assuming it already exists.`,
      );
      console.warn(error instanceof Error ? error.message : error);
    }
  }

  execFileSync(
    "gh",
    [
      "release",
      "upload",
      tag,
      ...artifactPaths,
      "--repo",
      githubRepo,
      "--clobber",
    ],
    {
      cwd: desktopRoot,
      stdio: "inherit",
    },
  );
}
