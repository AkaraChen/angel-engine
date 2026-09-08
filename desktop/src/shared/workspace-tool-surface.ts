export interface WorkspaceToolSurfaceContext {
  chatId?: string | null;
  contextKey?: string | null;
  projectId?: string | null;
  root?: string | null;
}

export type WorkspaceToolPinnedTabId =
  | "files"
  | "git"
  | "checks"
  | "pr"
  | "processes";

// Pinned tab ids or dynamic tab ids; dynamic ids are runtime-generated strings.
export type WorkspaceToolTabId = WorkspaceToolPinnedTabId | (string & {});

export type WorkspaceToolSurfaceDynamicTab =
  | WorkspaceToolSurfaceFilePreviewTab
  | WorkspaceToolSurfaceGitDiffTab;

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

export type WorkspaceToolFocusSection = "checks";

export interface WorkspaceToolSurfaceSnapshot {
  activeTabId: WorkspaceToolTabId;
  /**
   * Pending scroll/highlight target after a checks→pr redirect. Kept until the
   * Checks section mounts; not cleared by the redirect itself.
   */
  focusSection?: WorkspaceToolFocusSection | null;
  tabs: WorkspaceToolSurfaceDynamicTab[];
}
