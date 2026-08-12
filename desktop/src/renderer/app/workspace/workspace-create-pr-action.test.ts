// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  createPullRequestAction,
  executeCreatePullRequestAction,
  openExistingPullRequest,
  openPullRequestInSystemBrowser,
} from "./workspace-create-pr-action";

describe("openExistingPullRequest", () => {
  it("closes the modal before opening the existing pull request", () => {
    const calls: string[] = [];
    const close = vi.fn(() => calls.push("close"));
    const openExternal = vi.fn(() => calls.push("open"));
    const openBrowserTab = vi.fn();

    openExistingPullRequest({
      close,
      openExternal,
      url: "https://forge.com/acme/widgets/pull/42",
    });

    expect(calls).toEqual(["close", "open"]);
    expect(openExternal).toHaveBeenCalledWith(
      "https://forge.com/acme/widgets/pull/42",
    );
    expect(openBrowserTab).not.toHaveBeenCalled();
  });

  it("routes pull request URLs through the main-window external-open boundary", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    openPullRequestInSystemBrowser("https://forge.com/acme/widgets/pull/42");

    expect(open).toHaveBeenCalledWith(
      "https://forge.com/acme/widgets/pull/42",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

describe("executeCreatePullRequestAction", () => {
  it("routes the reusable shortcut action's existing PR to preview", () => {
    const openDialog = vi.fn();
    const openPreview = vi.fn();
    const existing = {
      number: 42,
      url: "https://forge.com/acme/widgets/pull/42",
    };

    expect(
      executeCreatePullRequestAction({
        existing,
        openDialog,
        openPreview,
      }),
    ).toBe("opened-preview");
    expect(openPreview).toHaveBeenCalledWith(existing);
    expect(openDialog).not.toHaveBeenCalled();
    expect(createPullRequestAction.shortcut).toBe("CommandOrControl+Shift+P");
  });

  it("keeps the create dialog path when no pull request exists", () => {
    const openDialog = vi.fn();
    const openPreview = vi.fn();

    expect(
      executeCreatePullRequestAction({
        existing: null,
        openDialog,
        openPreview,
      }),
    ).toBe("opened-create");
    expect(openDialog).toHaveBeenCalledOnce();
    expect(openPreview).not.toHaveBeenCalled();
  });
});
