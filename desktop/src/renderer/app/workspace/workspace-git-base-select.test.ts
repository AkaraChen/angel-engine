import type { WorkspaceGitDiffBaseOption } from "@angel-engine/daemon-api/workspace-tools";

import { describe, expect, it } from "vitest";

import { nextAvailableWorkspaceGitBase } from "./workspace-git-base-select";

const bases: WorkspaceGitDiffBaseOption[] = [
  { available: true, kind: "worktree", selected: true },
  { available: true, kind: "unstaged", selected: false },
  { available: false, kind: "branch", selected: false },
  { available: true, kind: "session", selected: false },
  { available: false, kind: "turn", selected: false },
];

describe("nextAvailableWorkspaceGitBase", () => {
  it("cycles in both directions while skipping unavailable bases", () => {
    expect(nextAvailableWorkspaceGitBase(bases, "unstaged", 1)).toBe("session");
    expect(nextAvailableWorkspaceGitBase(bases, "worktree", -1)).toBe(
      "session",
    );
  });
});
