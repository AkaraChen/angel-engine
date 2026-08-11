import type { WorkspaceToolSurfaceSnapshot } from "@shared/workspace-tool-surface";
import { describe, expect, it } from "vitest";

import {
  clearPullRequestChecksFocus,
  redirectChecksTabToPullRequest,
  shouldConsumeChecksFocus,
  shouldRetainChecksFocusWhileLoading,
} from "./workspace-tool-checks-focus";

const baseSnapshot: WorkspaceToolSurfaceSnapshot = {
  activeTabId: "files",
  nextBrowserOrdinal: 1,
  nextTerminalOrdinal: 1,
  tabs: [],
};

describe("workspace tool checks focus", () => {
  it("redirects checks to pr while parking focus intent in the store", () => {
    const redirected = redirectChecksTabToPullRequest({
      ...baseSnapshot,
      activeTabId: "checks",
    });
    expect(redirected.activeTabId).toBe("pr");
    expect(redirected.focusSection).toBe("checks");
  });

  it("retains focus while the PR status query is still loading", () => {
    expect(
      shouldRetainChecksFocusWhileLoading({
        focusChecksSection: true,
        statusPending: true,
      }),
    ).toBe(true);
    expect(
      shouldConsumeChecksFocus({
        checksSectionReady: false,
        focusChecksSection: true,
        statusPending: true,
      }),
    ).toBe(false);
  });

  it("only consumes focus once the Checks section can mount", () => {
    expect(
      shouldConsumeChecksFocus({
        checksSectionReady: true,
        focusChecksSection: true,
        statusPending: false,
      }),
    ).toBe(true);
    expect(
      clearPullRequestChecksFocus({
        ...baseSnapshot,
        activeTabId: "checks",
        focusSection: "checks",
      }),
    ).toEqual({
      ...baseSnapshot,
      activeTabId: "pr",
      focusSection: null,
    });
  });
});
