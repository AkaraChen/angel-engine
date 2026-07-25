import path from "node:path";
import type { EditorCatalogEntry } from "./catalog";
import { PATH_LAUNCHER_EDITORS } from "./catalog";
import { findExecutableOnPath } from "./probe";
import type {
  DiscoveryProbe,
  PlatformPathLauncherAdapter,
  ResolvedEditor,
} from "./types";

interface RegistryEntry {
  displayIcon?: string;
  displayName?: string;
  installLocation?: string;
  publisher?: string;
}

const registryRoots = [
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
] as const;

export function parseWindowsRegistryEntries(output: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  let current: RegistryEntry | undefined;

  for (const line of output.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line.trim())) {
      if (current !== undefined) entries.push(current);
      current = {};
      continue;
    }
    if (current === undefined) continue;

    const match = /^\s+(\S+)\s+REG_\S+\s+(.*)$/.exec(line);
    if (match === null) continue;
    const [, name, value] = match;
    if (name === undefined || value === undefined) continue;

    switch (name.toLowerCase()) {
      case "displayicon":
        current.displayIcon = value.trim();
        break;
      case "displayname":
        current.displayName = value.trim();
        break;
      case "installlocation":
        current.installLocation = value.trim();
        break;
      case "publisher":
        current.publisher = value.trim();
        break;
    }
  }

  if (current !== undefined) entries.push(current);
  return entries;
}

function displayIconExecutable(displayIcon: string): string {
  const trimmed = displayIcon.trim();
  const quoted = /^"([^"]+)"/.exec(trimmed)?.[1];
  return (quoted ?? trimmed.replace(/,\s*-?\d+\s*$/, "")).trim();
}

function registryCandidates(
  editor: EditorCatalogEntry,
  entries: readonly RegistryEntry[],
): string[] {
  const candidates: string[] = [];
  for (const entry of entries) {
    const name = entry.displayName?.toLowerCase() ?? "";
    const publisher = entry.publisher?.toLowerCase() ?? "";
    if (
      !editor.win32.registryNameIncludes.some((part) =>
        name.includes(part.toLowerCase()),
      ) ||
      !editor.win32.publisherIncludes.some((part) =>
        publisher.includes(part.toLowerCase()),
      )
    ) {
      continue;
    }

    if (entry.displayIcon !== undefined) {
      candidates.push(displayIconExecutable(entry.displayIcon));
    }
    if (entry.installLocation !== undefined) {
      candidates.push(
        path.win32.join(entry.installLocation, editor.win32.executableName),
      );
    }
  }
  return candidates;
}

async function firstWindowsExecutable(
  candidates: readonly string[],
  expectedExecutableName: string,
  probe: DiscoveryProbe,
): Promise<string | undefined> {
  const expectedName = expectedExecutableName.toLowerCase();
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (
      seen.has(normalized) ||
      !path.win32.isAbsolute(candidate) ||
      path.win32.basename(candidate).toLowerCase() !== expectedName
    ) {
      continue;
    }
    seen.add(normalized);
    if (await probe.executableExists(candidate)) return candidate;
  }
  return undefined;
}

async function queryUninstallRegistry(
  probe: DiscoveryProbe,
): Promise<RegistryEntry[]> {
  const entries: RegistryEntry[] = [];
  for (const root of registryRoots) {
    try {
      const { stdout } = await probe.run("reg.exe", ["query", root, "/s"]);
      entries.push(...parseWindowsRegistryEntries(stdout));
    } catch {
      // A missing registry hive or denied key does not block other candidates.
    }
  }
  return entries;
}

function knownWindowsCandidates(
  editor: EditorCatalogEntry,
  probe: DiscoveryProbe,
): string[] {
  return editor.win32.installPaths.flatMap(({ base, relativePath }) => {
    const root = probe.env[base];
    return root === undefined ? [] : [path.win32.join(root, relativePath)];
  });
}

export async function discoverWindowsEditors(
  probe: DiscoveryProbe,
): Promise<ResolvedEditor[]> {
  const resolved = new Map<EditorCatalogEntry, string>();

  await Promise.all(
    PATH_LAUNCHER_EDITORS.map(async (editor) => {
      const fromPath = await findExecutableOnPath(
        [editor.win32.executableName],
        probe,
        "win32",
      );
      const executable = await firstWindowsExecutable(
        [
          ...knownWindowsCandidates(editor, probe),
          ...(fromPath === undefined ? [] : [fromPath]),
        ],
        editor.win32.executableName,
        probe,
      );
      if (executable !== undefined) resolved.set(editor, executable);
    }),
  );

  if (resolved.size < PATH_LAUNCHER_EDITORS.length) {
    const registryEntries = await queryUninstallRegistry(probe);
    await Promise.all(
      PATH_LAUNCHER_EDITORS.filter((editor) => !resolved.has(editor)).map(
        async (editor) => {
          const executable = await firstWindowsExecutable(
            registryCandidates(editor, registryEntries),
            editor.win32.executableName,
            probe,
          );
          if (executable !== undefined) resolved.set(editor, executable);
        },
      ),
    );
  }

  return PATH_LAUNCHER_EDITORS.flatMap((editor) => {
    const executable = resolved.get(editor);
    if (executable === undefined) return [];
    return [
      {
        createInvocation: (target: string) => ({
          args: [target],
          awaitExit: false,
          executable,
        }),
        id: editor.id,
        name: editor.name,
      },
    ];
  });
}

export const win32PathLauncherAdapter: PlatformPathLauncherAdapter = {
  discoverEditors: discoverWindowsEditors,
  discoverTerminal: async (probe) => {
    const windowsApps =
      probe.env.LOCALAPPDATA === undefined
        ? []
        : [
            path.win32.join(
              probe.env.LOCALAPPDATA,
              "Microsoft",
              "WindowsApps",
              "wt.exe",
            ),
          ];
    const fromPath = await findExecutableOnPath(
      ["wt.exe"],
      probe,
      "win32",
      windowsApps.map((candidate) => path.win32.dirname(candidate)),
    );
    if (fromPath !== undefined) {
      return {
        createInvocation: (target) => ({
          args: ["-d", target],
          awaitExit: true,
          executable: fromPath,
        }),
        name: "Windows Terminal",
      };
    }

    const systemRoot = probe.env.SystemRoot ?? probe.env.WINDIR;
    const comSpecCandidates = [
      probe.env.ComSpec,
      systemRoot === undefined
        ? undefined
        : path.win32.join(systemRoot, "System32", "cmd.exe"),
    ].filter((candidate) => candidate !== undefined);
    const comSpec = await firstWindowsExecutable(
      comSpecCandidates,
      "cmd.exe",
      probe,
    );
    if (comSpec === undefined) return undefined;

    return {
      createInvocation: (target) => ({
        args: [],
        awaitExit: false,
        cwd: target,
        executable: comSpec,
      }),
      name: "Command Prompt",
    };
  },
};
