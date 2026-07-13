export type WorkspaceToolSurfaceHost = "sidebar" | "window";

export interface WorkspaceToolSurfaceContext {
  chatId?: string | null;
  root?: string | null;
}

export type WorkspaceToolPinnedTabId = "files" | "git" | "processes";

export type WorkspaceToolSurfaceDynamicTab =
  | WorkspaceToolSurfaceBrowserTab
  | WorkspaceToolSurfaceFilePreviewTab
  | WorkspaceToolSurfaceGitDiffTab
  | WorkspaceToolSurfaceTerminalTab;

interface WorkspaceToolSurfaceDynamicTabBase {
  id: string;
  title: string;
}

export interface WorkspaceToolSurfaceFilePreviewTab extends WorkspaceToolSurfaceDynamicTabBase {
  kind: "file-preview";
  path: string;
  root: string;
}

export interface WorkspaceToolSurfaceGitDiffTab extends WorkspaceToolSurfaceDynamicTabBase {
  kind: "git-diff";
  path?: string;
  root: string;
}

export interface WorkspaceToolSurfaceTerminalTab extends WorkspaceToolSurfaceDynamicTabBase {
  kind: "terminal";
  root: string;
  sessionId: string;
}

export interface WorkspaceToolSurfaceBrowserTab extends WorkspaceToolSurfaceDynamicTabBase {
  browserViewId: string;
  draftUrl: string;
  kind: "browser";
  url: string;
}

export interface WorkspaceToolSurfaceSnapshot {
  activeTabId: WorkspaceToolPinnedTabId | string;
  nextBrowserOrdinal: number;
  nextTerminalOrdinal: number;
  tabs: WorkspaceToolSurfaceDynamicTab[];
  windowFileOpenRequest?: WorkspaceToolSurfaceWindowFileOpenRequest;
}

export interface WorkspaceToolSurfaceWindowFileOpenRequest {
  id: string;
  path: string;
  root: string;
}

export interface WorkspaceToolSurfaceState {
  context: WorkspaceToolSurfaceContext;
  host: WorkspaceToolSurfaceHost;
  snapshot: WorkspaceToolSurfaceSnapshot | null;
}

export interface WorkspaceToolSurfaceContextSetInput {
  chatId?: string | null;
  root?: string | null;
}

export interface WorkspaceToolSurfaceHostSetInput {
  host: WorkspaceToolSurfaceHost;
}

export interface WorkspaceToolSurfaceSnapshotSetInput {
  chatId: string;
  snapshot: WorkspaceToolSurfaceSnapshot;
}
