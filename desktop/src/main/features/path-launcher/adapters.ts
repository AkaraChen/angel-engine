import type { PlatformPathLauncherAdapter } from "./types";
import { darwinPathLauncherAdapter } from "./darwin";
import { linuxPathLauncherAdapter } from "./linux";
import { win32PathLauncherAdapter } from "./win32";

export function pathLauncherAdapterForPlatform(
  platform: NodeJS.Platform,
): PlatformPathLauncherAdapter {
  const adapters: Partial<
    Record<NodeJS.Platform, PlatformPathLauncherAdapter>
  > = {
    darwin: darwinPathLauncherAdapter,
    linux: linuxPathLauncherAdapter,
    win32: win32PathLauncherAdapter,
  };
  const adapter = adapters[platform];
  if (adapter === undefined) {
    throw new Error(`Path launcher is unsupported on ${platform}.`);
  }
  return adapter;
}
