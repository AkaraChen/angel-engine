import path from "node:path";
import { PATH_LAUNCHER_EDITORS } from "./catalog";
import type {
  DiscoveryProbe,
  PlatformPathLauncherAdapter,
  ResolvedEditor,
} from "./types";

const resolveBundleScript = `
function run(argv) {
  ObjC.import("AppKit");
  const url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(argv[0]);
  return url ? ObjC.unwrap(url.path) : "";
}
`.trim();

async function verifiedBundlePath(
  candidate: string,
  bundleId: string,
  probe: DiscoveryProbe,
): Promise<string | undefined> {
  if (
    !path.posix.isAbsolute(candidate) ||
    !(await probe.pathExists(candidate))
  ) {
    return undefined;
  }

  try {
    const infoPlist = path.posix.join(candidate, "Contents", "Info.plist");
    const { stdout } = await probe.run("/usr/bin/plutil", [
      "-extract",
      "CFBundleIdentifier",
      "raw",
      "-o",
      "-",
      infoPlist,
    ]);
    return stdout.trim() === bundleId ? candidate : undefined;
  } catch {
    return undefined;
  }
}

async function resolveBundlePath(
  appName: string,
  bundleId: string,
  probe: DiscoveryProbe,
): Promise<string | undefined> {
  try {
    const { stdout } = await probe.run("/usr/bin/osascript", [
      "-l",
      "JavaScript",
      "-e",
      resolveBundleScript,
      "--",
      bundleId,
    ]);
    const resolved = await verifiedBundlePath(stdout.trim(), bundleId, probe);
    if (resolved !== undefined) return resolved;
  } catch {
    // Continue through deterministic filesystem fallbacks.
  }

  const home = probe.env.HOME;
  const knownCandidates = [
    path.posix.join("/Applications", appName),
    ...(home === undefined
      ? []
      : [path.posix.join(home, "Applications", appName)]),
  ];
  for (const candidate of knownCandidates) {
    const resolved = await verifiedBundlePath(candidate, bundleId, probe);
    if (resolved !== undefined) return resolved;
  }

  try {
    const { stdout } = await probe.run("/usr/bin/mdfind", [
      `kMDItemCFBundleIdentifier == '${bundleId}'`,
    ]);
    for (const candidate of stdout.split(/\r?\n/)) {
      const resolved = await verifiedBundlePath(
        candidate.trim(),
        bundleId,
        probe,
      );
      if (resolved !== undefined) return resolved;
    }
  } catch {
    // An unavailable Spotlight index means the app is not discoverable.
  }

  return undefined;
}

export async function discoverDarwinEditors(
  probe: DiscoveryProbe,
): Promise<ResolvedEditor[]> {
  const editors = await Promise.all(
    PATH_LAUNCHER_EDITORS.map(async (editor) => {
      const appPath = await resolveBundlePath(
        editor.darwin.appName,
        editor.darwin.bundleId,
        probe,
      );
      if (appPath === undefined) return undefined;

      return {
        createInvocation: (target: string) => ({
          args: ["-b", editor.darwin.bundleId, target],
          awaitExit: true,
          executable: "/usr/bin/open",
        }),
        id: editor.id,
        name: editor.name,
      } satisfies ResolvedEditor;
    }),
  );

  return editors.filter((editor) => editor !== undefined);
}

export const darwinPathLauncherAdapter: PlatformPathLauncherAdapter = {
  discoverEditors: discoverDarwinEditors,
  discoverTerminal: async () => ({
    createInvocation: (target) => ({
      args: ["-b", "com.apple.Terminal", target],
      awaitExit: true,
      executable: "/usr/bin/open",
    }),
    name: "Terminal",
  }),
};
