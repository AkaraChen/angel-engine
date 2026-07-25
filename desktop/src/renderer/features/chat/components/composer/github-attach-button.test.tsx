// @vitest-environment jsdom

import type {
  GitHubResolveUrlInput,
  GitHubResolvedItem,
} from "@angel-engine/daemon-api/github";
import type { FC, ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerGitHubAttachment } from "./github-attachments";
import { PromptGitHubAttachButton } from "./github-attach-button";

type ResolveUrl = (input: GitHubResolveUrlInput) => Promise<GitHubResolvedItem>;

const mocks = vi.hoisted(() => ({
  resolveUrl: vi.fn<ResolveUrl>(),
}));

vi.mock("@/platform/use-api", () => ({
  useApi: () => ({
    github: {
      resolveUrl: mocks.resolveUrl,
    },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/dialog", async () => {
  const { createContext, useContext } = await import("react");

  type DialogState = {
    onOpenChange: (next: boolean) => void;
    open: boolean;
  };
  type DialogProps = DialogState & { children: ReactNode };
  type ChildrenProps = { children: ReactNode };

  const DialogContext = createContext<DialogState | null>(null);
  const Dialog: FC<DialogProps> = ({ children, onOpenChange, open }) => (
    <DialogContext.Provider value={{ onOpenChange, open }}>
      {children}
    </DialogContext.Provider>
  );
  const DialogContent: FC<ChildrenProps> = ({ children }) => {
    const dialog = useContext(DialogContext);
    if (dialog === null || !dialog.open) return null;

    return (
      <div role="dialog">
        <button
          aria-label="close-dialog"
          onClick={() => dialog.onOpenChange(false)}
          type="button"
        />
        {children}
      </div>
    );
  };
  const Passthrough: FC<ChildrenProps> = ({ children }) => <>{children}</>;

  return {
    Dialog,
    DialogContent,
    DialogDescription: Passthrough,
    DialogFooter: Passthrough,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
  };
});

const firstIssue: GitHubResolvedItem = {
  author: "alice",
  body: "first body",
  contextText: "GitHub Issue #1 — First issue",
  kind: "issue",
  number: 1,
  owner: "acme",
  repo: "widgets",
  state: "OPEN",
  title: "First issue",
  url: "https://github.com/acme/widgets/issues/1",
};

const secondIssue: GitHubResolvedItem = {
  ...firstIssue,
  body: "second body",
  contextText: "GitHub Issue #2 — Second issue",
  number: 2,
  title: "Second issue",
  url: "https://github.com/acme/widgets/issues/2",
};

beforeEach(() => {
  mocks.resolveUrl.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PromptGitHubAttachButton", () => {
  it("attaches a resolved GitHub item and closes the dialog", async () => {
    mocks.resolveUrl.mockResolvedValue(firstIssue);
    const onAttached = vi.fn<(attachment: ComposerGitHubAttachment) => void>();

    render(<PromptGitHubAttachButton onAttached={onAttached} />);
    openDialog();
    submitUrl(firstIssue.url);

    await waitFor(() => {
      expect(onAttached).toHaveBeenCalledTimes(1);
    });
    const attachment = onAttached.mock.lastCall?.[0];
    expect(attachment).toMatchObject(firstIssue);
    expect(attachment?.id).toMatch(/^github-issue-acme-widgets-1-/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores a stale response after the dialog is closed and reopened", async () => {
    const firstRequest = deferred<GitHubResolvedItem>();
    const secondRequest = deferred<GitHubResolvedItem>();
    mocks.resolveUrl
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);
    const onAttached = vi.fn<(attachment: ComposerGitHubAttachment) => void>();

    render(<PromptGitHubAttachButton onAttached={onAttached} />);
    openDialog();
    submitUrl(firstIssue.url);
    fireEvent.click(screen.getByRole("button", { name: "close-dialog" }));

    openDialog();
    submitUrl(secondIssue.url);

    await act(async () => {
      firstRequest.resolve(firstIssue);
      await firstRequest.promise;
    });
    expect(onAttached).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeDefined();

    await act(async () => {
      secondRequest.resolve(secondIssue);
      await secondRequest.promise;
    });
    const attachment = onAttached.mock.lastCall?.[0];
    expect(attachment).toMatchObject(secondIssue);
    expect(attachment?.id).toMatch(/^github-issue-acme-widgets-2-/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

function openDialog() {
  fireEvent.click(screen.getByTitle("composer.attachGitHub"));
  expect(screen.getByRole("dialog")).toBeDefined();
}

function submitUrl(url: string) {
  const input = screen.getByPlaceholderText("composer.attachGitHubPlaceholder");
  fireEvent.change(input, { target: { value: url } });
  const form = input.closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form as HTMLFormElement);
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
