import { describe, expect, it, vi } from "vitest";

import {
  executeCreatePullRequestAction,
  openExistingPullRequest,
} from "./workspace-create-pr-action";

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

describe("executeCreatePullRequestAction", () => {
  it("routes an existing pull request directly to the browser tab", () => {
    const openBrowser = vi.fn();
    const openDialog = vi.fn();

    expect(
      executeCreatePullRequestAction({
        existing: { url: "https://github.com/acme/widgets/pull/42" },
        openBrowser,
        openDialog,
      }),
    ).toBe("opened-existing");
    expect(openBrowser).toHaveBeenCalledWith(
      "https://github.com/acme/widgets/pull/42",
    );
    expect(openDialog).not.toHaveBeenCalled();
  });

  it("keeps the create dialog path when no pull request exists", () => {
    const openBrowser = vi.fn();
    const openDialog = vi.fn();

    expect(
      executeCreatePullRequestAction({
        existing: null,
        openBrowser,
        openDialog,
      }),
    ).toBe("opened-create");
    expect(openDialog).toHaveBeenCalledOnce();
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
