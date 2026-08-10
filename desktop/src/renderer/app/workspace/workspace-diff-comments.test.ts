import type { FileDiffMetadata } from "@pierre/diffs";
import { describe, expect, it } from "vitest";
import {
  chatIdFromWorkspaceToolContextKey,
  createDiffComment,
  formatDiffCommentsForAgent,
  getDiffLineSnippet,
  isSendableDiffComment,
  projectIdFromWorkspaceToolContextKey,
  toPierreDiffLineAnnotations,
} from "./workspace-diff-comments";

function stubFileDiff(
  overrides: Partial<FileDiffMetadata> = {},
): FileDiffMetadata {
  return {
    additionLines: ["line-a", "line-b", "line-c"],
    deletionLines: ["old-a", "old-b"],
    hunks: [
      {
        additionCount: 3,
        additionLineIndex: 0,
        additionLines: 2,
        additionStart: 10,
        collapsedBefore: 0,
        deletionCount: 2,
        deletionLineIndex: 0,
        deletionLines: 1,
        deletionStart: 8,
        hunkContent: [],
        noEOFCRAdditions: false,
        noEOFCRDeletions: false,
        splitLineCount: 3,
        splitLineStart: 0,
        unifiedLineCount: 3,
        unifiedLineStart: 0,
      },
    ],
    isPartial: true,
    name: "src/example.ts",
    splitLineCount: 3,
    type: "change",
    unifiedLineCount: 3,
    ...overrides,
  };
}

describe("getDiffLineSnippet", () => {
  it("reads addition-side lines from hunk coordinates", () => {
    const fileDiff = stubFileDiff();
    expect(getDiffLineSnippet(fileDiff, "additions", 10)).toBe("line-a");
    expect(getDiffLineSnippet(fileDiff, "additions", 12)).toBe("line-c");
    expect(getDiffLineSnippet(fileDiff, "additions", 9)).toBe("");
  });

  it("reads deletion-side lines from hunk coordinates", () => {
    const fileDiff = stubFileDiff();
    expect(getDiffLineSnippet(fileDiff, "deletions", 8)).toBe("old-a");
    expect(getDiffLineSnippet(fileDiff, "deletions", 9)).toBe("old-b");
  });

  it("falls back to full-file indexing when the diff is not partial", () => {
    const fileDiff = stubFileDiff({
      additionLines: ["first", "second"],
      hunks: [],
      isPartial: false,
    });
    expect(getDiffLineSnippet(fileDiff, "additions", 2)).toBe("second");
  });
});

describe("formatDiffCommentsForAgent", () => {
  it("formats selected open comments as a structured prompt", () => {
    const comments = [
      createDiffComment({
        body: "Use Result instead of any",
        lineNumber: 42,
        path: "src/a.ts",
        root: "/repo",
        side: "additions",
        snippet: "const x: any = 1",
      }),
      createDiffComment({
        body: "rename this",
        lineNumber: 3,
        path: "src/b.ts",
        root: "/repo",
        side: "deletions",
        snippet: "oldName",
      }),
    ];
    comments[1]!.selected = false;

    const prompt = formatDiffCommentsForAgent(comments);
    expect(prompt).toContain("Please address the following review comments");
    expect(prompt).toContain("Path: src/a.ts");
    expect(prompt).toContain("Line: 42 (new)");
    expect(prompt).toContain("Snippet: `const x: any = 1`");
    expect(prompt).toContain("Note: Use Result instead of any");
    expect(prompt).not.toContain("src/b.ts");
  });

  it("skips empty bodies and resolved comments", () => {
    const empty = createDiffComment({
      body: "   ",
      lineNumber: 1,
      path: "a.ts",
      root: "/repo",
      side: "additions",
    });
    const resolved = createDiffComment({
      body: "done",
      lineNumber: 2,
      path: "a.ts",
      root: "/repo",
      side: "additions",
    });
    resolved.status = "resolved";
    expect(formatDiffCommentsForAgent([empty, resolved])).toBe("");
    expect(isSendableDiffComment(empty)).toBe(false);
    expect(isSendableDiffComment(resolved)).toBe(false);
  });
});

describe("toPierreDiffLineAnnotations", () => {
  it("maps open comments for a path/source into pierre annotations", () => {
    const open = createDiffComment({
      body: "fix",
      lineNumber: 5,
      path: "src/a.ts",
      root: "/repo",
      side: "additions",
      source: "unstaged",
    });
    const otherPath = createDiffComment({
      body: "other",
      lineNumber: 1,
      path: "src/b.ts",
      root: "/repo",
      side: "additions",
      source: "unstaged",
    });
    const resolved = createDiffComment({
      body: "resolved",
      lineNumber: 9,
      path: "src/a.ts",
      root: "/repo",
      side: "deletions",
      source: "unstaged",
    });
    resolved.status = "resolved";

    expect(
      toPierreDiffLineAnnotations(
        [open, otherPath, resolved],
        "src/a.ts",
        "unstaged",
      ),
    ).toEqual([
      {
        lineNumber: 5,
        metadata: { commentId: open.id },
        side: "additions",
      },
    ]);
  });
});

describe("workspace tool context key parsers", () => {
  it("extracts project and chat ids from tool context keys", () => {
    expect(
      projectIdFromWorkspaceToolContextKey("project:proj-1:root:/repo/app"),
    ).toBe("proj-1");
    expect(projectIdFromWorkspaceToolContextKey("chat:chat-1")).toBeUndefined();
    expect(chatIdFromWorkspaceToolContextKey("chat:chat-1")).toBe("chat-1");
    expect(
      chatIdFromWorkspaceToolContextKey("project:proj-1:root:/repo"),
    ).toBeUndefined();
  });
});
