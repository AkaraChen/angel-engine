import { describe, expect, it } from "vitest";
import { splitWorktreePath } from "./removable-worktree-path";

describe("splitWorktreePath", () => {
  it("keeps the distinguishing managed-worktree identifier separate", () => {
    expect(
      splitWorktreePath(
        "/Users/test/.angel-engine/worktrees/angel-engine/770a1f2b",
      ),
    ).toEqual({
      directory: "/Users/test/.angel-engine/worktrees/angel-engine/",
      identifier: "770a1f2b",
    });
  });

  it("supports Windows worktree paths", () => {
    expect(
      splitWorktreePath(
        "C:\\Users\\test\\.angel-engine\\worktrees\\angel-engine\\770a1f2b",
      ),
    ).toEqual({
      directory: "C:\\Users\\test\\.angel-engine\\worktrees\\angel-engine\\",
      identifier: "770a1f2b",
    });
  });
});
