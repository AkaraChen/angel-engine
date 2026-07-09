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
const releaseType = packageJson.version.includes("-")
  ? "prerelease"
  : "release";
const electronBuilderBin = path.join(
  desktopRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);

const publishIndex = process.argv.indexOf("--publish");
const publishMode =
  publishIndex === -1 ? "never" : process.argv[publishIndex + 1];
const waitMs = Number(
  process.env.ANGEL_ENGINE_PREPACKAGED_APP_WAIT_MS ?? 600000,
);
const pollMs = 5000;

if (
  !publishMode ||
  !["always", "never", "onTag", "onTagOrDraft"].includes(publishMode)
) {
  throw new Error(`Unsupported publish mode: ${publishMode}`);
}

function findAppBundles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const apps = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      apps.push(entryPath);
      continue;
    }

    if (entry.isDirectory()) {
      apps.push(...findAppBundles(entryPath));
    }
  }

  return apps;
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
  execFileSync("find", [outDir, "-maxdepth", "3", "-print"], {
    cwd: desktopRoot,
    stdio: "inherit",
  });
}

const preferredAppPath = path.join(
  outDir,
  "Angel Engine-darwin-arm64",
  "Angel Engine.app",
);

function readPackagedAppPath() {
  if (!fs.existsSync(packagedAppPathFile)) {
    return undefined;
  }

  const appPath = fs.readFileSync(packagedAppPathFile, "utf8").trim();

  if (!appPath) {
    return undefined;
  }

  return path.resolve(desktopRoot, appPath);
}

function selectAppBundle() {
  const appBundles = findAppBundles(outDir);
  const packagedAppPath = readPackagedAppPath();
  const appPath =
    packagedAppPath && fs.existsSync(packagedAppPath)
      ? packagedAppPath
      : appBundles.includes(preferredAppPath)
        ? preferredAppPath
        : appBundles[0];

  return { appBundles, appPath };
}

function waitForAppBundle() {
  const deadline = Date.now() + waitMs;
  let lastSize = -1;
  let lastAppPath;

  while (Date.now() <= deadline) {
    const { appBundles, appPath } = selectAppBundle();

    if (appPath) {
      const size = directorySize(appPath);

      if (appPath === lastAppPath && size > 0 && size === lastSize) {
        return { appBundles, appPath };
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

  return selectAppBundle();
}

const { appBundles, appPath } = waitForAppBundle();

if (!appPath) {
  printOutTree();
  throw new Error("No packaged .app bundle found under desktop/out.");
}

if (appBundles.length > 1) {
  console.warn(`Found multiple app bundles, using: ${appPath}`);
}

console.log(`Using prepackaged app: ${path.relative(desktopRoot, appPath)}`);

execFileSync(
  electronBuilderBin,
  [
    "--prepackaged",
    appPath,
    "--mac",
    "dmg",
    "zip",
    "--publish",
    publishMode,
    `--config.publish.releaseType=${releaseType}`,
  ],
  {
    cwd: desktopRoot,
    stdio: "inherit",
  },
);

if (publishMode !== "never") {
  const version = packageJson.version;
  const tag = `v${version}`;
  const builderOutDir = path.join(outDir, "builder");
  const artifactNames = [
    `Angel-Engine-${version}-arm64.dmg`,
    `Angel-Engine-${version}-arm64.zip`,
    `Angel-Engine-${version}-arm64.zip.blockmap`,
    "latest-mac.yml",
  ];
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

  execFileSync(
    "gh",
    [
      "release",
      "upload",
      tag,
      ...artifactPaths,
      "--repo",
      "AkaraChen/angel-engine",
      "--clobber",
    ],
    {
      cwd: desktopRoot,
      stdio: "inherit",
    },
  );
}
