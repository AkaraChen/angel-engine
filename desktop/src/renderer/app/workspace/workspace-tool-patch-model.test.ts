import type { WorkspaceGitDiffResult } from "@angel-engine/daemon-api/workspace-tools";

import { describe, expect, it } from "vitest";

import {
  buildWorkspaceGitDiffPatchList,
  getWorkspaceGitNumstatTotal,
} from "./workspace-tool-patch-model";

const stagedPatch = `diff --git a/shared.txt b/shared.txt
index 7898192..422c2b7 100644
--- a/shared.txt
+++ b/shared.txt
@@ -1 +1 @@
-before
+staged`;

const unstagedPatch = `diff --git a/shared.txt b/shared.txt
index 422c2b7..70f60b0 100644
--- a/shared.txt
+++ b/shared.txt
@@ -1 +1 @@
-staged
+unstaged`;

function worktreeDiff(): WorkspaceGitDiffResult {
  return {
    availableBases: [],
    branchStatus: {
      ahead: 0,
      behind: 0,
      detached: false,
      unborn: false,
    },
    conflictedPaths: [],
    isGitRepository: true,
    numstat: [],
    patch: `${stagedPatch}\n${unstagedPatch}`,
    requestedBaseKind: "worktree",
    resolvedBase: { available: true, kind: "worktree" },
    root: "/repo",
    skippedFiles: [],
    stagedPatch,
    status: [],
    unstagedPatch,
    warnings: [],
  };
}

describe("buildWorkspaceGitDiffPatchList", () => {
  it("keeps staged and unstaged changes distinct in a worktree diff", () => {
    const patchList = buildWorkspaceGitDiffPatchList(worktreeDiff());

    expect(patchList.files).toHaveLength(1);
    expect(patchList.files[0]?.diffs.map((diff) => diff.source)).toEqual([
      "staged",
      "unstaged",
    ]);
  });
});

describe("getWorkspaceGitNumstatTotal", () => {
  const entries = [
    { additions: 5, deletions: 2, path: "shared.txt" },
    { additions: 1, deletions: 0, path: "new.txt" },
  ];

  it("uses daemon numstat totals without counting patch stages twice", () => {
    expect(getWorkspaceGitNumstatTotal(entries)).toEqual({
      additions: 6,
      deletions: 2,
    });
  });

  it("filters totals to the visible path", () => {
    expect(
      getWorkspaceGitNumstatTotal(entries, new Set(["shared.txt"])),
    ).toEqual({ additions: 5, deletions: 2 });
  });
});
