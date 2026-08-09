import { describe, expect, it } from "vitest";

import { applyPullRequestPrefill } from "./pull-request-draft";

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
