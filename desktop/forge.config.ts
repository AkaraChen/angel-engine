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
for (const moduleName of optionalLibsqlNativeModules) {
  nativeRuntimeModuleParents.set(moduleName, "libsql");
}

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const daemonRoot = path.join(workspaceRoot, "packages", "daemon");
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

function resolveRuntimeModulePackageJson(moduleName: string): string {
  const paths = [projectRoot, daemonRoot, workspaceRoot];
  const parentModuleName = nativeRuntimeModuleParents.get(moduleName);

  if (is.nonEmptyString(parentModuleName)) {
    paths.unshift(
      path.dirname(resolveRuntimeModulePackageJson(parentModuleName)),
    );
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

const config: ForgeConfig = {
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      copyRuntimePath(buildPath, "drizzle");
      copyMobileBundle(buildPath);
      copyNativeRuntimeDependencies(buildPath);
    },
  },
  packagerConfig: {
    appBundleId: "com.akrc.angel-engine",
    asar: {
      unpack: "**/node_modules/node-pty/**/spawn-helper",
    },
    extraResource: [path.join(projectRoot, "build", "app-update.yml")],
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
