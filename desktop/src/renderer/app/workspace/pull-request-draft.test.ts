import { describe, expect, it } from "vitest";

import {
  applyPullRequestPrefill,
  resetPullRequestDialogState,
} from "./pull-request-draft";

describe("applyPullRequestPrefill", () => {
  it("preserves dirty fields when the base branch changes", () => {
    expect(
      applyPullRequestPrefill(
        {
          body: "User body",
          bodyDirty: true,
          title: "User title",
          titleDirty: true,
        },
        { body: "Generated body", title: "Generated title" },
      ),
    ).toEqual({
      body: "User body",
      bodyDirty: true,
      title: "User title",
      titleDirty: true,
    });
  });

  it("refreshes only fields the user has not edited", () => {
    expect(
      applyPullRequestPrefill(
        {
          body: "Old body",
          bodyDirty: false,
          title: "User title",
          titleDirty: true,
        },
        { body: "New body", title: "New title" },
      ),
    ).toMatchObject({ body: "New body", title: "User title" });
  });
});

describe("resetPullRequestDialogState", () => {
  it("clears every workspace-scoped field when the root changes", () => {
    expect(resetPullRequestDialogState("/repos/second")).toEqual({
      base: "",
      body: "",
      draft: false,
      open: false,
      root: "/repos/second",
      title: "",
    });
  });
});
