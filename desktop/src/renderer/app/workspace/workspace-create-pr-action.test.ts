import { describe, expect, it, vi } from "vitest";

import { openExistingPullRequest } from "./workspace-create-pr-action";

describe("openExistingPullRequest", () => {
  it("closes the modal before opening the existing pull request", () => {
    const calls: string[] = [];
    const close = vi.fn(() => calls.push("close"));
    const openBrowser = vi.fn(() => calls.push("open"));

    openExistingPullRequest({
      close,
      openBrowser,
      url: "https://github.com/acme/widgets/pull/42",
    });

    expect(calls).toEqual(["close", "open"]);
    expect(openBrowser).toHaveBeenCalledWith(
      "https://github.com/acme/widgets/pull/42",
    );
  });
});
