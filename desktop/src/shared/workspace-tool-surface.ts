export interface WorkspaceToolSurfaceContext {
  chatId?: string | null;
  contextKey?: string | null;
  projectId?: string | null;
  root?: string | null;
}

export type WorkspaceToolTabId = string;

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

export interface WorkspaceToolSurfaceSnapshot {
  activeTabId: WorkspaceToolTabId;
  tabs: WorkspaceToolSurfaceDynamicTab[];
}
