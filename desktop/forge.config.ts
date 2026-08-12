import type { ForgeConfig } from "@electron-forge/shared-types";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import is from "@sindresorhus/is";

const nativeRuntimeModules = [
  "libsql",
  "@neon-rs/load",
  "detect-libc",
  "node-pty",
  "ccusage",
];
const nativeRuntimeModuleParents = new Map([
  ["libsql", "@libsql/client"],
  ["@neon-rs/load", "libsql"],
  ["detect-libc", "libsql"],
]);
const optionalLibsqlNativeModules = [
  "@libsql/darwin-arm64",
  "@libsql/darwin-x64",
  "@libsql/linux-arm-gnueabihf",
  "@libsql/linux-arm-musleabihf",
  "@libsql/linux-arm64-gnu",
  "@libsql/linux-arm64-musl",
  "@libsql/linux-x64-gnu",
  "@libsql/linux-x64-musl",
  "@libsql/win32-x64-msvc",
];
const optionalCcusageNativeModules = [
  "@ccusage/ccusage-darwin-arm64",
  "@ccusage/ccusage-darwin-x64",
  "@ccusage/ccusage-linux-arm64",
  "@ccusage/ccusage-linux-x64",
  "@ccusage/ccusage-win32-arm64",
  "@ccusage/ccusage-win32-x64",
];
const ccusageNativePackageByTarget = new Map([
  ["darwin-arm64", "@ccusage/ccusage-darwin-arm64"],
  ["darwin-x64", "@ccusage/ccusage-darwin-x64"],
  ["linux-arm64", "@ccusage/ccusage-linux-arm64"],
  ["linux-x64", "@ccusage/ccusage-linux-x64"],
  ["win32-arm64", "@ccusage/ccusage-win32-arm64"],
  ["win32-x64", "@ccusage/ccusage-win32-x64"],
]);
for (const moduleName of optionalCcusageNativeModules) {
  nativeRuntimeModuleParents.set(moduleName, "ccusage");
}
for (const moduleName of optionalLibsqlNativeModules) {
  nativeRuntimeModuleParents.set(moduleName, "libsql");
}

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const daemonRoot = path.join(workspaceRoot, "packages", "daemon");
const usageCollectorRoot = path.join(
  workspaceRoot,
  "packages",
  "usage-collector",
);
const workspaceRequire = createRequire(
  path.join(workspaceRoot, "package.json"),
);
const appIconPath = path.join(projectRoot, "assets", "icon");
const macSignIdentity = process.env.ANGEL_ENGINE_MAC_SIGN_IDENTITY;
const macSignKeychain = process.env.ANGEL_ENGINE_MAC_SIGN_KEYCHAIN;
const macSignIdentityValidation =
  process.env.ANGEL_ENGINE_MAC_SIGN_IDENTITY_VALIDATION !== "false";
const appleApiKey = process.env.APPLE_API_KEY;
const appleApiKeyId = process.env.APPLE_API_KEY_ID;
const appleApiIssuer = process.env.APPLE_API_ISSUER;
const macNotarize =
  process.platform === "darwin" &&
  is.nonEmptyString(appleApiKey) &&
  is.nonEmptyString(appleApiKeyId) &&
  is.nonEmptyString(appleApiIssuer)
    ? {
        tool: "notarytool" as const,
        appleApiKey,
        appleApiKeyId,
        appleApiIssuer,
      }
    : undefined;
const fallbackAdHocSign =
  process.platform === "darwin" &&
  !is.nonEmptyString(macSignIdentity) &&
  macNotarize === undefined;
const defaultDarwinAppEntitlements = [
  "com.apple.security.cs.allow-jit",
  "com.apple.security.device.audio-input",
  "com.apple.security.device.bluetooth",
  "com.apple.security.device.camera",
  "com.apple.security.device.print",
  "com.apple.security.device.usb",
  "com.apple.security.personal-information.location",
];
const fallbackAdHocAppEntitlements = [
  ...defaultDarwinAppEntitlements,
  "com.apple.security.cs.disable-library-validation",
];
const defaultDarwinRendererHelperEntitlements = [
  "com.apple.security.cs.allow-jit",
];
const fallbackAdHocRendererHelperEntitlements = [
  ...defaultDarwinRendererHelperEntitlements,
  "com.apple.security.cs.disable-library-validation",
];

function fallbackAdHocEntitlementsForFile(filePath: string) {
  if (!filePath.endsWith(".app")) {
    return undefined;
  }

  if (filePath.includes("(Plugin).app")) {
    return undefined;
  }

  if (filePath.includes("(Renderer).app") || filePath.includes("(GPU).app")) {
    return fallbackAdHocRendererHelperEntitlements;
  }

  return fallbackAdHocAppEntitlements;
}

function copyRuntimePath(buildPath: string, relativePath: string) {
  fs.cpSync(
    path.join(projectRoot, relativePath),
    path.join(buildPath, relativePath),
    {
      dereference: true,
      force: true,
      recursive: true,
    },
  );
}

// Ship the built mobile web bundle inside the app so the daemon can serve it to
// phones on the LAN. Resolved at runtime via `app.getAppPath()/mobile`.
function copyMobileBundle(buildPath: string) {
  const source = path.resolve(workspaceRoot, "mobile", "dist");
  if (!fs.existsSync(path.join(source, "index.html"))) {
    throw new Error(
      "Mobile bundle not found at mobile/dist. Run `pnpm run runtime:build` first.",
    );
  }
  fs.cpSync(source, path.join(buildPath, "mobile"), {
    dereference: true,
    force: true,
    recursive: true,
  });
}

/** Host control CLI staged by `@angel-engine/host-cli` build (KIT-830). */
function hostCliBinDir() {
  return path.join(workspaceRoot, "packages", "host-cli", "dist", "bin");
}

function brushBinDir() {
  return path.join(projectRoot, ".runtime", "brush", "bin");
}

/** Host skill package for Skill-first injection (KIT-832). */
function hostSkillDir() {
  return path.join(workspaceRoot, "packages", "host-skill", "angel-host");
}

function assertHostCliBundled() {
  const binary = path.join(hostCliBinDir(), "angelctl");
  if (!fs.existsSync(binary)) {
    throw new Error(
      "Host CLI not found at packages/host-cli/dist/bin/angelctl. Run `bun run host-cli:build` (or desktop runtime:build) first.",
    );
  }
}

function assertHostSkillBundled() {
  const skill = path.join(hostSkillDir(), "SKILL.md");
  if (!fs.existsSync(skill)) {
    throw new Error(
      "Host skill not found at packages/host-skill/angel-host/SKILL.md.",
    );
  }
}

/** Lands at Contents/Resources/skills/angel-host (Skill-first host control). */
function copyHostSkillIntoResources(buildPath: string) {
  // packageAfterCopy buildPath is …/Contents/Resources/app
  const resourcesDir = path.join(buildPath, "..");
  const target = path.join(resourcesDir, "skills", "angel-host");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(hostSkillDir(), target, {
    dereference: true,
    force: true,
    recursive: true,
  });
}

function copyBrushIntoResources(buildPath: string) {
  const binary = path.join(brushBinDir(), "brush.exe");
  if (!fs.existsSync(binary)) return;
  const target = path.join(buildPath, "..", "bin", "brush.exe");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(binary, target);
}

function resolveRuntimeModulePackageJson(moduleName: string): string {
  const paths = [projectRoot, daemonRoot, usageCollectorRoot, workspaceRoot];
  const parentModuleName = nativeRuntimeModuleParents.get(moduleName);

  if (is.nonEmptyString(parentModuleName)) {
    paths.unshift(
      path.dirname(resolveRuntimeModulePackageJson(parentModuleName)),
    );
  }

  for (const searchPath of paths) {
    try {
      return createRequire(path.join(searchPath, "package.json")).resolve(
        `${moduleName}/package.json`,
      );
    } catch {
      // Some packages hide package.json behind exports; resolve their entry below.
    }
  }

  let currentPath = path.dirname(
    workspaceRequire.resolve(moduleName, { paths }),
  );
  while (currentPath !== path.dirname(currentPath)) {
    const packageJsonPath = path.join(currentPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson: unknown = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8"),
      );
      if (
        is.plainObject<{ name?: unknown }>(packageJson) &&
        packageJson.name === moduleName
      ) {
        return packageJsonPath;
      }
    }
    currentPath = path.dirname(currentPath);
  }

  throw new Error(`Could not resolve runtime package: ${moduleName}`);
}

function copyRuntimeModule(buildPath: string, moduleName: string) {
  const packageJsonPath = resolveRuntimeModulePackageJson(moduleName);
  const sourcePath = path.dirname(packageJsonPath);
  const targetPath = path.join(buildPath, "node_modules", moduleName);

  fs.cpSync(sourcePath, targetPath, {
    dereference: true,
    force: true,
    recursive: true,
  });
}

function copyNativeRuntimeDependencies(buildPath: string) {
  for (const moduleName of nativeRuntimeModules) {
    copyRuntimeModule(buildPath, moduleName);
  }
  for (const moduleName of optionalLibsqlNativeModules) {
    try {
      copyRuntimeModule(buildPath, moduleName);
    } catch {
      // Bun only installs the libSQL binary package for the current platform.
    }
  }
  for (const moduleName of optionalCcusageNativeModules) {
    try {
      copyRuntimeModule(buildPath, moduleName);
    } catch {
      // Bun only installs the ccusage binary package for the current platform.
    }
  }

  const clientNapiSource = path.resolve(
    projectRoot,
    "../crates/angel-engine-client-napi",
  );
  const clientNapiTarget = path.join(
    buildPath,
    "node_modules/@angel-engine/client-napi",
  );

  fs.mkdirSync(clientNapiTarget, { recursive: true });
  for (const fileName of ["package.json", "index.js", "index.d.ts"]) {
    fs.copyFileSync(
      path.join(clientNapiSource, fileName),
      path.join(clientNapiTarget, fileName),
    );
  }

  for (const fileName of fs.readdirSync(clientNapiSource)) {
    if (!fileName.endsWith(".node")) {
      continue;
    }

    fs.copyFileSync(
      path.join(clientNapiSource, fileName),
      path.join(clientNapiTarget, fileName),
    );
  }
}

function verifyCopiedCcusageBinary(buildPath: string) {
  const packageName = ccusageNativePackageByTarget.get(
    `${process.platform}-${process.arch}`,
  );
  if (!packageName) {
    throw new Error(
      `ccusage does not publish a binary for ${process.platform}-${process.arch}.`,
    );
  }
  const binaryPath = path.join(
    buildPath,
    "node_modules",
    packageName,
    "bin",
    process.platform === "win32" ? "ccusage.exe" : "ccusage",
  );
  fs.accessSync(binaryPath, fs.constants.F_OK);
  // Bun may install optional native binaries without the execute bit.
  if (process.platform !== "win32") {
    try {
      fs.accessSync(binaryPath, fs.constants.X_OK);
    } catch {
      fs.chmodSync(binaryPath, 0o755);
      fs.accessSync(binaryPath, fs.constants.X_OK);
    }
  }
}

const config: ForgeConfig = {
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      assertHostCliBundled();
      assertHostSkillBundled();
      copyHostSkillIntoResources(buildPath);
      copyBrushIntoResources(buildPath);
      copyRuntimePath(buildPath, "drizzle");
      copyMobileBundle(buildPath);
      copyNativeRuntimeDependencies(buildPath);
      verifyCopiedCcusageBinary(buildPath);
    },
  },
  packagerConfig: {
    appBundleId: "com.akrc.angel-engine",
    // Space-free binary name so Linux deb postinst / update-alternatives and
    // electron-builder linux.executableName all point at the same path.
    // The .app / product display name still comes from package.json productName.
    executableName: "angel-engine",
    asar: {
      unpack:
        "{**/node_modules/node-pty/**/spawn-helper,**/node_modules/@ccusage/**/bin/**}",
    },
    extraResource: [
      path.join(projectRoot, "build", "app-update.yml"),
      // Host control CLI for agents (KIT-830). Lands at
      // Angel Engine.app/Contents/Resources/bin/angelctl when the directory exists
      // at package time (runtime:build produces it).
      ...(fs.existsSync(path.join(hostCliBinDir(), "angelctl"))
        ? [hostCliBinDir()]
        : []),
    ],
    icon: appIconPath,
    // Installers are produced by electron-builder from the prepackaged app.
    // Forge is used for dev start and package-app.cjs, including .app signing.
    osxSign:
      process.platform === "darwin"
        ? {
            ...(is.nonEmptyString(macSignKeychain)
              ? { keychain: macSignKeychain }
              : {}),
            ...(is.nonEmptyString(macSignIdentity)
              ? { identity: macSignIdentity }
              : fallbackAdHocSign
                ? { identity: "-" }
                : {}),
            identityValidation: fallbackAdHocSign
              ? false
              : macSignIdentityValidation,
            optionsForFile: (filePath) => {
              const entitlements = fallbackAdHocSign
                ? fallbackAdHocEntitlementsForFile(filePath)
                : undefined;

              return {
                ...(entitlements ? { entitlements } : {}),
                hardenedRuntime: true,
              };
            },
          }
        : undefined,
    osxNotarize: macNotarize,
  },
  rebuildConfig: {},
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          entry: "../packages/daemon/src/main.ts",
          config: "vite.daemon.config.ts",
          target: "main",
        },
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main/index.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/index.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
        {
          // Guest-only Design Mode preload for workspace-browser WebContentsView.
          entry: "src/preload/design-mode.ts",
          config: "vite.design-mode-preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    new AutoUnpackNativesPlugin({}),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
