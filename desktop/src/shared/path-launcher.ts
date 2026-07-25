export const PATH_LAUNCHER_EDITOR_IDS = ["cursor", "vscode"] as const;

export type PathLauncherEditorId = (typeof PATH_LAUNCHER_EDITOR_IDS)[number];

export interface PathLauncherTargetRef {
  chatId?: string;
  projectId: string;
}

export type PathLauncherMenuResult = "cancelled" | "copied" | "opened";
