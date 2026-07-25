import { PATH_LAUNCHER_EDITORS } from "./catalog";
import { findExecutableOnPath } from "./probe";
import type {
  DiscoveryProbe,
  PlatformPathLauncherAdapter,
  ResolvedEditor,
} from "./types";

const commonExecutableDirectories = [
  "/usr/local/bin",
  "/usr/bin",
  "/snap/bin",
] as const;

export async function discoverLinuxEditors(
  probe: DiscoveryProbe,
): Promise<ResolvedEditor[]> {
  const editors = await Promise.all(
    PATH_LAUNCHER_EDITORS.map(async (editor) => {
      const executable = await findExecutableOnPath(
        editor.linux.executableNames,
        probe,
        "linux",
        commonExecutableDirectories,
      );
      if (executable === undefined) return undefined;

      return {
        createInvocation: (target: string) => ({
          args: [target],
          awaitExit: true,
          executable,
        }),
        id: editor.id,
        name: editor.name,
      } satisfies ResolvedEditor;
    }),
  );

  return editors.filter((editor) => editor !== undefined);
}

export const linuxPathLauncherAdapter: PlatformPathLauncherAdapter = {
  discoverEditors: discoverLinuxEditors,
  discoverTerminal: async (probe) => {
    const xdgTerminal = await findExecutableOnPath(
      ["xdg-terminal-exec"],
      probe,
      "linux",
      commonExecutableDirectories,
    );
    if (xdgTerminal !== undefined) {
      try {
        const { stdout } = await probe.run(xdgTerminal, [
          "--print-cmd",
          "--dir=/",
        ]);
        if (stdout.trim().length > 0) {
          return {
            createInvocation: (target) => ({
              args: [`--dir=${target}`],
              awaitExit: false,
              executable: xdgTerminal,
            }),
            name: "System Terminal",
          };
        }
      } catch {
        // A launcher without an applicable terminal is not available.
      }
    }

    const systemTerminal = await findExecutableOnPath(
      ["x-terminal-emulator"],
      probe,
      "linux",
      commonExecutableDirectories,
    );
    if (systemTerminal === undefined) return undefined;

    return {
      createInvocation: (target) => ({
        args: [],
        awaitExit: false,
        cwd: target,
        executable: systemTerminal,
      }),
      name: "System Terminal",
    };
  },
};
