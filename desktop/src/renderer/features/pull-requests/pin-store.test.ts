import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPinnedPullRequestsForTests,
  isPullRequestPinned,
  listPinnedPullRequests,
  setPullRequestPinned,
} from "./pin-store";

describe("pull request pin store", () => {
  beforeEach(() => {
    clearPinnedPullRequestsForTests();
  });

  it("pins and unpins pull request numbers per project", () => {
    expect(listPinnedPullRequests("p1")).toEqual([]);
    setPullRequestPinned("p1", 12, true);
    setPullRequestPinned("p1", 3, true);
    expect(listPinnedPullRequests("p1")).toEqual([3, 12]);
    expect(isPullRequestPinned("p1", 12)).toBe(true);
    expect(isPullRequestPinned("p2", 12)).toBe(false);

    setPullRequestPinned("p1", 12, false);
    expect(listPinnedPullRequests("p1")).toEqual([3]);
  });
});
