import type { WorkspaceToolSurfaceSnapshot } from "@shared/workspace-tool-surface";

import {
  workspaceToolChecksTabId,
  workspaceToolPullRequestTabId,
} from "@/app/workspace/workspace-tool-store";

/**
 * Immediately redirect a legacy `"checks"` tab to `"pr"` while parking the
 * scroll/highlight intent on `focusSection` until the Checks section mounts.
 */
export function redirectChecksTabToPullRequest(
  snapshot: WorkspaceToolSurfaceSnapshot,
): WorkspaceToolSurfaceSnapshot {
  if (snapshot.activeTabId !== workspaceToolChecksTabId) {
    return snapshot;
  }
  return {
    ...snapshot,
    activeTabId: workspaceToolPullRequestTabId,
    focusSection: "checks",
  };
}

export function clearPullRequestChecksFocus(
  snapshot: WorkspaceToolSurfaceSnapshot,
): WorkspaceToolSurfaceSnapshot {
  return {
    ...snapshot,
    activeTabId:
      snapshot.activeTabId === workspaceToolChecksTabId
        ? workspaceToolPullRequestTabId
        : snapshot.activeTabId,
    focusSection: null,
  };
}

/**
 * Focus intent stays parked while the PR panel is still loading. Once the
 * Checks section can mount (OPEN PR ready), consumers may scroll/highlight and
 * then clear the signal.
 */
export function shouldRetainChecksFocusWhileLoading(input: {
  focusChecksSection: boolean;
  statusPending: boolean;
}): boolean {
  return input.focusChecksSection && input.statusPending;
}

export function shouldConsumeChecksFocus(input: {
  checksSectionReady: boolean;
  focusChecksSection: boolean;
  statusPending: boolean;
}): boolean {
  return (
    input.focusChecksSection && !input.statusPending && input.checksSectionReady
  );
}
