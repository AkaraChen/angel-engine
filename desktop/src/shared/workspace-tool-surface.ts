export type WorkspaceToolSurfaceHost = "sidebar" | "window";

export interface WorkspaceToolSurfaceContext {
  chatId?: string | null;
  contextKey?: string | null;
  root?: string | null;
}

export type WorkspaceToolPinnedTabId = "files" | "git" | "processes";

// Pinned tab ids or dynamic tab ids; dynamic ids are runtime-generated strings.
export type WorkspaceToolTabId = WorkspaceToolPinnedTabId | (string & {});

export type WorkspaceToolSurfaceDynamicTab =
  | WorkspaceToolSurfaceBrowserTab
  | WorkspaceToolSurfaceFilePreviewTab
  | WorkspaceToolSurfaceGitDiffTab
  | WorkspaceToolSurfaceTerminalTab;

interface WorkspaceToolSurfaceDynamicTabBase {
  id: string;
  title: string;
}

export interface WorkspaceToolSurfaceFilePreviewTab
  extends WorkspaceToolSurfaceDynamicTabBase {
  kind: "file-preview";
  path: string;
  root: string;
}

export interface WorkspaceToolSurfaceGitDiffTab
  extends WorkspaceToolSurfaceDynamicTabBase {
  kind: "git-diff";
  path?: string;
  root: string;
}

export interface WorkspaceToolSurfaceTerminalTab
  extends WorkspaceToolSurfaceDynamicTabBase {
  kind: "terminal";
  root: string;
  sessionId: string;
}

export interface WorkspaceToolSurfaceBrowserTab
  extends WorkspaceToolSurfaceDynamicTabBase {
  browserViewId: string;
  draftUrl: string;
  kind: "browser";
  url: string;
}

export interface WorkspaceToolSurfaceSnapshot {
  activeTabId: WorkspaceToolTabId;
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
  contextKey?: string | null;
  root?: string | null;
}

export interface WorkspaceToolSurfaceHostSetInput {
  host: WorkspaceToolSurfaceHost;
}

export interface WorkspaceToolSurfaceSnapshotSetInput {
  contextKey: string;
  snapshot: WorkspaceToolSurfaceSnapshot;
}
