import type { ForgeConfig } from "@electron-forge/shared-types";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import is from "@sindresorhus/is";

const nativeRuntimeModules = [
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  "node-pty",
];
const nativeRuntimeModuleParents = new Map([
  ["bindings", "better-sqlite3"],
  ["file-uri-to-path", "bindings"],
]);

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
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

function resolveRuntimeModulePackageJson(moduleName: string): string {
  const paths = [projectRoot, workspaceRoot];
  const parentModuleName = nativeRuntimeModuleParents.get(moduleName);

  if (is.nonEmptyString(parentModuleName)) {
    paths.unshift(
      path.dirname(resolveRuntimeModulePackageJson(parentModuleName)),
    );
  }

  return workspaceRequire.resolve(`${moduleName}/package.json`, { paths });
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
      copyNativeRuntimeDependencies(buildPath);
    },
  },
  packagerConfig: {
    appBundleId: "com.akrc.angel-engine",
    asar: true,
    extraResource: [path.join(projectRoot, "build", "app-update.yml")],
    icon: appIconPath,
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
  makers: [
    new MakerSquirrel({}),
    new MakerDMG(
      {
        format: "ULFO",
        icon: `${appIconPath}.icns`,
        iconSize: 96,
      },
      ["darwin"],
    ),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
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
