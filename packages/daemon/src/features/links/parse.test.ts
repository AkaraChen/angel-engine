import { describe, expect, it } from "vitest";
import { parseTaskLink } from "./parse";

describe("parseTaskLink", () => {
  it.each([
    ["https://github.com/acme/widgets/issues/12", "github", "issue"],
    ["https://github.com/acme/widgets/pull/99", "github", "pullRequest"],
    ["https://linear.app/acme/issue/ENG-42/fix-widget", "linear", "issue"],
  ] as const)("parses %s", (url, provider, kind) => {
    expect(parseTaskLink(url)).toMatchObject({ kind, provider });
  });

  it.each([
    "not a url",
    "https://example.com/acme/widgets/issues/12",
    "https://github.com/acme/widgets",
    "https://github.com/acme/widgets/commit/abc",
    "https://linear.app/acme/project/ENG",
    "https://linear.app/acme/issue/not-an-id",
  ])("rejects unsupported input %s", (url) => {
    expect(parseTaskLink(url)).toBeNull();
  });
});
