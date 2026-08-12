import { describe, expect, it } from "vitest";

import {
  appendSourceControlContexts,
  type ComposerSourceControlAttachment,
} from "./source-control-attachments";

const sample: ComposerSourceControlAttachment = {
  author: "alice",
  body: "body",
  contextText: "GitHub Issue #1 — title\n\nBody:\nbody",
  draft: false,
  id: "gh-1",
  itemId: "1",
  kind: "workItem",
  number: 1,
  providerId: "github",
  repositoryPath: "acme/widgets",
  sourceBranch: null,
  state: "OPEN",
  targetBranch: null,
  title: "title",
  url: "https://github.com/acme/widgets/issues/1",
};

describe("appendSourceControlContexts", () => {
  it("returns text unchanged without attachments", () => {
    expect(appendSourceControlContexts("hello", [])).toBe("hello");
  });

  it("appends context after user text", () => {
    expect(appendSourceControlContexts("please fix the bug", [sample])).toBe(
      "please fix the bug\n\n---\nGitHub Issue #1 — title\n\nBody:\nbody",
    );
  });

  it("uses context alone when text is empty", () => {
    expect(appendSourceControlContexts("", [sample])).toBe(sample.contextText);
  });
});
