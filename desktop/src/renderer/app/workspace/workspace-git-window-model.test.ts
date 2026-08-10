import { describe, expect, it } from "vitest";

import {
  formatWorkspaceGitCommitTime,
  workspaceGitRemoteFromUpstream,
} from "./workspace-git-window-model";

describe("workspaceGitRemoteFromUpstream", () => {
  it("defaults to origin", () => {
    expect(workspaceGitRemoteFromUpstream()).toBe("origin");
    expect(workspaceGitRemoteFromUpstream("")).toBe("origin");
  });

  it("parses remote from upstream", () => {
    expect(workspaceGitRemoteFromUpstream("origin/main")).toBe("origin");
    expect(workspaceGitRemoteFromUpstream("upstream/feature")).toBe("upstream");
  });
});

describe("formatWorkspaceGitCommitTime", () => {
  it("returns empty string for empty input", () => {
    expect(formatWorkspaceGitCommitTime("")).toBe("");
  });

  it("formats a valid ISO timestamp", () => {
    const formatted = formatWorkspaceGitCommitTime(
      "2024-06-15T12:30:00.000Z",
      "en-US",
    );
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe("2024-06-15T12:30:00.000Z");
  });
});
