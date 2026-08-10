import { describe, expect, it } from "vitest";

import {
  appendGitHubContexts,
  type ComposerGitHubAttachment,
} from "./github-attachments";

const sample: ComposerGitHubAttachment = {
  author: "alice",
  body: "body",
  contextText: "GitHub Issue #1 — title\n\nBody:\nbody",
  id: "gh-1",
  kind: "issue",
  number: 1,
  owner: "acme",
  provider: "github",
  repo: "widgets",
  state: "OPEN",
  title: "title",
  url: "https://github.com/acme/widgets/issues/1",
};

describe("appendGitHubContexts", () => {
  it("returns text unchanged without attachments", () => {
    expect(appendGitHubContexts("hello", [])).toBe("hello");
  });

  it("appends context after user text", () => {
    expect(appendGitHubContexts("please fix the bug", [sample])).toBe(
      "please fix the bug\n\n---\nGitHub Issue #1 — title\n\nBody:\nbody",
    );
  });

  it("uses context alone when text is empty", () => {
    expect(appendGitHubContexts("", [sample])).toBe(sample.contextText);
  });
});
