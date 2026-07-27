// @vitest-environment jsdom

import type {
  GitHubListItemsInput,
  GitHubListItemsResult,
  GitHubResolveUrlInput,
  GitHubResolvedItem,
} from "@angel-engine/daemon-api/github";
import type { FC, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
type ListItems = (
  input: GitHubListItemsInput,
) => Promise<GitHubListItemsResult>;

const mocks = vi.hoisted(() => ({
  listItems: vi.fn<ListItems>(),
  projectPath: undefined as string | undefined,
  resolveUrl: vi.fn<ResolveUrl>(),
}));

vi.mock("@/platform/use-api", () => ({
  useApi: () => ({
    github: {
      listItems: mocks.listItems,
      resolveUrl: mocks.resolveUrl,
    },
  }),
}));

vi.mock("@/features/chat/runtime/chat-environment-context", () => ({
  useChatEnvironment: () => ({
    availableCommands: [],
    availableCommandsLoading: false,
    availableSkills: [],
    availableSkillsLoading: false,
    isProjectChat: mocks.projectPath !== undefined,
    projectPath: mocks.projectPath,
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

const listResult: GitHubListItemsResult = {
  items: [
    {
      author: "bob",
      isDraft: false,
      kind: "pullRequest",
      number: 7,
      owner: "acme",
      repo: "widgets",
      state: "OPEN",
      title: "Add widget spinner",
      updatedAt: "2026-07-24T10:00:00Z",
      url: "https://github.com/acme/widgets/pull/7",
    },
    {
      author: "alice",
      kind: "issue",
      number: 1,
      owner: "acme",
      repo: "widgets",
      state: "OPEN",
      title: "First issue",
      updatedAt: "2026-07-20T10:00:00Z",
      url: firstIssue.url,
    },
  ],
};

// cmdk observes its list container and scrolls the active item into view;
// jsdom implements neither.
class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverStub;
  Element.prototype.scrollIntoView = () => undefined;
  mocks.projectPath = "/repos/widgets";
  mocks.listItems.mockReset();
  mocks.listItems.mockResolvedValue(listResult);
  mocks.resolveUrl.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PromptGitHubAttachButton", () => {
  it("lists repository items and attaches the selected one", async () => {
    mocks.resolveUrl.mockResolvedValue(firstIssue);
    const onAttached = vi.fn<(attachment: ComposerGitHubAttachment) => void>();

    renderButton(onAttached);
    openDialog();

    const item = await screen.findByText("First issue");
    expect(screen.getByText("Add widget spinner")).toBeDefined();
    expect(mocks.listItems).toHaveBeenCalledWith({
      cwd: "/repos/widgets",
      limit: 30,
      query: undefined,
    });

    fireEvent.click(item);
    await waitFor(() => {
      expect(onAttached).toHaveBeenCalledTimes(1);
    });
    expect(mocks.resolveUrl).toHaveBeenCalledWith({ url: firstIssue.url });
    const attachment = onAttached.mock.lastCall?.[0];
    expect(attachment).toMatchObject(firstIssue);
    expect(attachment?.id).toMatch(/^github-issue-acme-widgets-1-/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing without an active project", () => {
    mocks.projectPath = undefined;

    renderButton(vi.fn());

    expect(screen.queryByTitle("composer.attachGitHub")).toBeNull();
    expect(mocks.listItems).not.toHaveBeenCalled();
  });

  it("searches the repository with the debounced query", async () => {
    const onAttached = vi.fn<(attachment: ComposerGitHubAttachment) => void>();

    renderButton(onAttached);
    openDialog();
    await screen.findByText("First issue");

    fireEvent.change(
      screen.getByPlaceholderText("composer.attachGitHubPlaceholder"),
      { target: { value: "spinner" } },
    );

    await waitFor(() => {
      expect(mocks.listItems).toHaveBeenCalledWith({
        cwd: "/repos/widgets",
        limit: 30,
        query: "spinner",
      });
    });
  });

  it("previews a pasted URL outside the list and attaches it without refetching", async () => {
    mocks.resolveUrl.mockResolvedValue(secondIssue);
    const onAttached = vi.fn<(attachment: ComposerGitHubAttachment) => void>();

    renderButton(onAttached);
    openDialog();
    fireEvent.change(
      screen.getByPlaceholderText("composer.attachGitHubPlaceholder"),
      { target: { value: secondIssue.url } },
    );

    await screen.findByText(secondIssue.title);
    expect(mocks.resolveUrl).toHaveBeenCalledWith({ url: secondIssue.url });
    expect(screen.getByText(/#2 · acme\/widgets · @alice/)).toBeDefined();
    expect(screen.queryByRole("option", { name: /Second issue/ })).toBeNull();

    fireEvent.click(screen.getByText("composer.attachGitHubConfirm"));
    await waitFor(() => {
      expect(onAttached).toHaveBeenCalledTimes(1);
    });
    expect(mocks.resolveUrl).toHaveBeenCalledTimes(1);
    expect(onAttached.mock.lastCall?.[0]).toMatchObject(secondIssue);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores a stale response after the dialog is closed and reopened", async () => {
    const firstRequest = deferred<GitHubResolvedItem>();
    const secondRequest = deferred<GitHubResolvedItem>();
    mocks.resolveUrl
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);
    const onAttached = vi.fn<(attachment: ComposerGitHubAttachment) => void>();

    renderButton(onAttached);
    openDialog();
    fireEvent.click(await screen.findByText("First issue"));
    fireEvent.click(screen.getByRole("button", { name: "close-dialog" }));

    openDialog();
    fireEvent.click(await screen.findByText("Add widget spinner"));

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

function renderButton(
  onAttached: (attachment: ComposerGitHubAttachment) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PromptGitHubAttachButton onAttached={onAttached} />
    </QueryClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByTitle("composer.attachGitHub"));
  expect(screen.getByRole("dialog")).toBeDefined();
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
