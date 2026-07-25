import type { PathLauncherEditorId } from "@shared/path-launcher";

interface EditorCatalogEntry {
  darwin: {
    appName: string;
    bundleId: string;
  };
  id: PathLauncherEditorId;
  linux: {
    executableNames: readonly string[];
  };
  name: string;
  win32: {
    executableName: string;
    installPaths: ReadonlyArray<{
      base:
        | "LOCALAPPDATA"
        | "PROGRAMFILES"
        | "PROGRAMFILES(X86)"
        | "ProgramW6432";
      relativePath: string;
    }>;
    publisherIncludes: readonly string[];
    registryNameIncludes: readonly string[];
  };
}

export const PATH_LAUNCHER_EDITORS: readonly EditorCatalogEntry[] = [
  {
    darwin: {
      appName: "Cursor.app",
      bundleId: "com.todesktop.230313mzl4w4u92",
    },
    id: "cursor",
    linux: {
      executableNames: ["cursor"],
    },
    name: "Cursor",
    win32: {
      executableName: "Cursor.exe",
      installPaths: [
        {
          base: "LOCALAPPDATA",
          relativePath: "Programs\\cursor\\Cursor.exe",
        },
        { base: "PROGRAMFILES", relativePath: "Cursor\\Cursor.exe" },
        { base: "ProgramW6432", relativePath: "Cursor\\Cursor.exe" },
      ],
      publisherIncludes: ["anysphere"],
      registryNameIncludes: ["cursor"],
    },
  },
  {
    darwin: {
      appName: "Visual Studio Code.app",
      bundleId: "com.microsoft.VSCode",
    },
    id: "vscode",
    linux: {
      executableNames: ["code"],
    },
    name: "Visual Studio Code",
    win32: {
      executableName: "Code.exe",
      installPaths: [
        {
          base: "LOCALAPPDATA",
          relativePath: "Programs\\Microsoft VS Code\\Code.exe",
        },
        {
          base: "PROGRAMFILES",
          relativePath: "Microsoft VS Code\\Code.exe",
        },
        {
          base: "PROGRAMFILES(X86)",
          relativePath: "Microsoft VS Code\\Code.exe",
        },
        {
          base: "ProgramW6432",
          relativePath: "Microsoft VS Code\\Code.exe",
        },
      ],
      publisherIncludes: ["microsoft"],
      registryNameIncludes: ["visual studio code"],
    },
  },
];

export type { EditorCatalogEntry };
