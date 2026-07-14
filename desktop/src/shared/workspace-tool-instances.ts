export type WorkspaceToolHost = "sidebar" | "window";

export type WorkspaceToolInstance =
  | WorkspaceBrowserToolInstance
  | WorkspaceFilePreviewToolInstance
  | WorkspaceGitDiffToolInstance
  | WorkspaceTerminalToolInstance;

interface WorkspaceToolInstanceBase {
  host: WorkspaceToolHost;
  id: string;
  title: string;
}

export interface WorkspaceFilePreviewToolInstance
  extends WorkspaceToolInstanceBase {
  kind: "file-preview";
  path: string;
  root: string;
}

export interface WorkspaceGitDiffToolInstance
  extends WorkspaceToolInstanceBase {
  kind: "git-diff";
  path?: string;
  root: string;
}

export interface WorkspaceTerminalToolInstance
  extends WorkspaceToolInstanceBase {
  kind: "terminal";
  root: string;
  sessionId: string;
}

export interface WorkspaceBrowserToolInstance
  extends WorkspaceToolInstanceBase {
  browserViewId: string;
  kind: "browser";
  url: string;
}

export type WorkspaceToolInstanceInput =
  | Omit<WorkspaceBrowserToolInstance, "host" | "id">
  | Omit<WorkspaceFilePreviewToolInstance, "host" | "id">
  | Omit<WorkspaceGitDiffToolInstance, "host" | "id">
  | Omit<WorkspaceTerminalToolInstance, "host" | "id">;

export interface WorkspaceToolWindowOpenInput {
  instance: WorkspaceToolInstance;
}

export interface WorkspaceToolInstanceCloseInput {
  toolId: string;
}

export interface WorkspaceToolWindowLookupInput {
  toolId: string;
}

export interface WorkspaceToolContextSetInput {
  root?: string | null;
}
