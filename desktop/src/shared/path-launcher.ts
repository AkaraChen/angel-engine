export const PATH_LAUNCHER_EDITOR_IDS = ["cursor", "vscode"] as const;

export type PathLauncherEditorId = (typeof PATH_LAUNCHER_EDITOR_IDS)[number];

export interface PathLauncherTargetRef {
  chatId?: string;
  projectId: string;
}

/**
 * Actions a path-launcher menu can run. The renderer renders the menu itself
 * (shadcn `ContextMenu`) and asks main to execute the picked action, so the
 * action id is the contract between the two.
 */
export type PathLauncherActionId =
  | `editor:${PathLauncherEditorId}`
  | "angelTerminal"
  | "copyPath"
  | "fileManager"
  | "systemTerminal";

export function pathLauncherEditorActionId(
  editorId: PathLauncherEditorId,
): PathLauncherActionId {
  return `editor:${editorId}`;
}

/** What the host machine can actually offer for a path-launcher menu. */
export interface PathLauncherAvailabilitySnapshot {
  editors: { id: PathLauncherEditorId; name: string }[];
  systemTerminal: boolean;
}

export interface PathLauncherInvokeRequest {
  action: PathLauncherActionId;
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
