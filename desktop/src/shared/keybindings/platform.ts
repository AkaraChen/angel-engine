import type { KeymapPlatform } from "./types";

export function detectKeymapPlatform(
  platform: string = typeof process !== "undefined"
    ? process.platform
    : "linux",
): KeymapPlatform {
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "win";
  return "linux";
}

export function isMacPlatform(platform: KeymapPlatform): boolean {
  return platform === "mac";
}
