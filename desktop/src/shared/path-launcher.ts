export const PATH_LAUNCHER_EDITOR_IDS = ["cursor", "vscode"] as const;

export type PathLauncherEditorId = (typeof PATH_LAUNCHER_EDITOR_IDS)[number];

export interface PathLauncherTargetRef {
  chatId?: string;
  projectId: string;
}

export interface PathLauncherMenuRequest {
  includeAngelTerminal?: boolean;
  target: PathLauncherTargetRef;
}

export interface PathLauncherAngelTerminalResult {
  action: "open_angel_terminal";
  target: string;
}

export type PathLauncherMenuResult =
  | PathLauncherAngelTerminalResult
  | "cancelled"
  | "copied"
  | "opened";
