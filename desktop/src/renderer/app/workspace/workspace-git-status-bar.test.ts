import { describe, expect, it } from "vitest";

import { splitWorkspaceGitBranchLabel } from "./workspace-git-status";

describe("splitWorkspaceGitBranchLabel", () => {
  it("keeps the identifying tail of generated agent branches intact", () => {
    expect(splitWorkspaceGitBranchLabel("agent/hexa/32349858")).toEqual({
      prefix: "agent/hexa/",
      tail: "32349858",
    });
  });

  it("keeps a branch without a path entirely in the non-shrinking tail", () => {
    expect(splitWorkspaceGitBranchLabel("pr-228")).toEqual({
      prefix: "",
      tail: "pr-228",
    });
  });
});
