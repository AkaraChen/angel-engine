import type { WorkspaceGitDiffBaseKind } from "@angel-engine/daemon-api/workspace-tools";

export interface WorkspaceDiffBasePreference {
  baseKind: WorkspaceGitDiffBaseKind;
  branchRef?: string;
}

export interface WorkspaceDiffBasePreferenceInput
  extends WorkspaceDiffBasePreference {
  root: string;
}

export const DESKTOP_WORKSPACE_DIFF_BASE_GET_CHANNEL =
  "desktop-window:workspace-diff-base:get";
export const DESKTOP_WORKSPACE_DIFF_BASE_SET_CHANNEL =
  "desktop-window:workspace-diff-base:set";
