import type { ForgeConfig } from "@electron-forge/shared-types";
import fs from "node:fs";
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

const nativeRuntimeModules = ["better-sqlite3", "bindings", "file-uri-to-path"];

const projectRoot = __dirname;
const appIconPath = path.join(projectRoot, "assets", "icon");

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

function copyNativeRuntimeDependencies(buildPath: string) {
  for (const moduleName of nativeRuntimeModules) {
    copyRuntimePath(buildPath, path.join("node_modules", moduleName));
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
    asar: true,
    icon: appIconPath,
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
