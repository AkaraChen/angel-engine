const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const packageApp = require("@electron-forge/core/dist/api/package").default;
const {
  selectPackagedApp,
  resolvePrepackagedPath,
} = require("./packaged-app.cjs");

const desktopRoot = path.resolve(__dirname, "..");
const outDir = path.join(desktopRoot, "out");
const packagedAppPathFile = path.join(outDir, ".prepackaged-app");

function printOutTree() {
  if (!fs.existsSync(outDir)) {
    console.error(`Forge output directory does not exist: ${outDir}`);
    return;
  }

  console.error("Forge output tree:");
  for (const entry of fs.readdirSync(outDir, { recursive: true })) {
    console.error(path.join(outDir, entry.toString()));
  }
}

async function main() {
  if (!process.versions.node.startsWith("24.")) {
    throw new Error(
      `Desktop packaging requires Node 24.x (received ${process.versions.node}).`,
    );
  }
  console.log(`Packaging Angel Engine for ${process.platform}/${process.arch}`);
  fs.rmSync(packagedAppPathFile, { force: true });

  const results = await packageApp({
    arch: process.arch,
    dir: desktopRoot,
    interactive: false,
    outDir,
    platform: process.platform,
  });

  const forgePackagedPaths = [];
  for (const result of results ?? []) {
    console.log(
      `Packaged ${result.platform}/${result.arch}: ${path.relative(
        desktopRoot,
        result.packagedPath,
      )}`,
    );
    forgePackagedPaths.push(
      resolvePrepackagedPath(result.packagedPath, process.platform),
    );
  }

  const { appPath } = selectPackagedApp(outDir, {
    desktopRoot,
    forgePackagedPaths,
    platform: process.platform,
    arch: process.arch,
  });

  if (!appPath) {
    printOutTree();
    throw new Error(
      `No packaged app found for ${process.platform}/${process.arch} after Forge completed.`,
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(packagedAppPathFile, `${appPath}\n`);
  console.log(`Prepared app package: ${path.relative(desktopRoot, appPath)}`);
}

// Forge's callback-based packager hooks can leave only unresolved promises
// between stages, which lets Node exit early before `packageApp()` settles.
const keepAlive = setInterval(() => {}, 1_000);
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
