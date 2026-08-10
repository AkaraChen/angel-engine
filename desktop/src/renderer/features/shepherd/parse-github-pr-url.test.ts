import { describe, expect, it } from "vitest";

import { parseGitHubPullRequestUrl } from "./parse-github-pr-url";

describe("parseGitHubPullRequestUrl", () => {
  it("parses a standard github PR url", () => {
    expect(
      parseGitHubPullRequestUrl("https://github.com/acme/widgets/pull/42"),
    ).toEqual({ owner: "acme", prNumber: 42, repo: "widgets" });
  });

  it("accepts www and trailing path segments", () => {
    expect(
      parseGitHubPullRequestUrl(
        "https://www.github.com/acme/widgets/pull/7/files",
      ),
    ).toEqual({ owner: "acme", prNumber: 7, repo: "widgets" });
  });

  it("rejects non-github hosts and non-PR paths", () => {
    expect(
      parseGitHubPullRequestUrl("https://gitlab.com/acme/widgets/pull/1"),
    ).toBeNull();
    expect(
      parseGitHubPullRequestUrl("https://github.com/acme/widgets/issues/1"),
    ).toBeNull();
  });
});
